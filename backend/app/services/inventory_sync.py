from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.inventory_source import InventorySource
from app.models.inventory_sync_run import InventorySyncRun
from app.models.node import Node
from app.models.registration_token import RegistrationToken
from app.schemas.accountability import InventorySyncPreviewRequest
from app.services.audit import node_snapshot, record_audit_event
from app.services.registration_tokens import register_or_update_node_with_token

SYNC_FIELDS = ("name", "kind", "hostname", "ip", "url", "tags", "meta", "notes", "external_id")


def _incoming_snapshot(data: dict) -> dict:
    return {field: data.get(field) for field in SYNC_FIELDS}


def _changed_fields(node: Node, data: dict) -> list[str]:
    changed: list[str] = []
    for field in SYNC_FIELDS:
        incoming = data.get(field)
        current = getattr(node, field)
        if field == "tags":
            if sorted(current or []) != sorted(incoming or []):
                changed.append(field)
        elif field == "meta":
            if (current or {}) != (incoming or {}):
                changed.append(field)
        elif current != incoming:
            changed.append(field)
    return changed


async def get_or_create_source(
    db: AsyncSession, *, rt: RegistrationToken, payload: InventorySyncPreviewRequest
) -> InventorySource:
    result = await db.execute(
        select(InventorySource)
        .where(InventorySource.team_id == rt.team_id)
        .where(InventorySource.source_key == payload.source_key)
    )
    source = result.scalar_one_or_none()
    if source is None:
        source = InventorySource(
            team_id=rt.team_id,
            registration_token_id=rt.id,
            created_by_id=rt.created_by_id,
            source_key=payload.source_key,
            name=payload.source_name,
            source_type=payload.source_type,
            expected_interval_minutes=payload.expected_interval_minutes,
        )
        db.add(source)
    else:
        source.registration_token_id = rt.id
        source.name = payload.source_name
        source.source_type = payload.source_type
        source.expected_interval_minutes = payload.expected_interval_minutes
    await db.flush()
    return source


async def create_sync_preview(
    db: AsyncSession, *, rt: RegistrationToken, payload: InventorySyncPreviewRequest
) -> InventorySyncRun:
    now = datetime.now(timezone.utc)
    source = await get_or_create_source(db, rt=rt, payload=payload)
    result = await db.execute(select(Node).where(Node.team_id == rt.team_id))
    team_nodes = list(result.scalars().all())

    by_source_external = {
        (node.inventory_source_id, node.external_id): node
        for node in team_nodes if node.external_id
    }
    by_hostname = {node.hostname: node for node in team_nodes if node.hostname}
    by_name = {node.name: node for node in team_nodes}
    matched_ids: set[uuid.UUID] = set()
    changes: list[dict] = []
    proposed: list[dict] = []

    for item in payload.nodes:
        if rt.allowed_kinds and item.kind not in rt.allowed_kinds:
            raise ValueError(f"Kind '{item.kind}' is not allowed by this registration token")
        data = item.model_dump(mode="json")
        node = None
        if item.external_id:
            node = by_source_external.get((source.id, item.external_id))
        if node is None and item.hostname:
            node = by_hostname.get(item.hostname)
        if node is None:
            node = by_name.get(item.name)
        if node and node.inventory_source_id not in (None, source.id):
            raise ValueError(
                f"Node '{node.name}' is already managed by another inventory source"
            )
        if node and node.id in matched_ids:
            raise ValueError(f"Multiple input records resolve to node '{node.name}'")
        proposed.append(data)
        if node is None:
            changes.append({
                "action": "create", "node_id": None, "external_id": item.external_id,
                "name": item.name, "hostname": item.hostname, "changed_fields": list(SYNC_FIELDS),
            })
        else:
            matched_ids.add(node.id)
            fields = _changed_fields(node, data)
            if node.inventory_source_id != source.id:
                fields.append("inventory_source_id")
            changes.append({
                "action": "update" if fields else "unchanged", "node_id": str(node.id),
                "external_id": item.external_id, "name": item.name,
                "hostname": item.hostname, "changed_fields": fields,
            })

    if payload.reconcile_missing:
        for node in team_nodes:
            if node.inventory_source_id == source.id and node.id not in matched_ids:
                changes.append({
                    "action": "missing", "node_id": str(node.id), "external_id": node.external_id,
                    "name": node.name, "hostname": node.hostname, "changed_fields": [],
                })

    summary = {key: sum(1 for change in changes if change["action"] == key)
               for key in ("create", "update", "unchanged", "missing")}
    run = InventorySyncRun(
        team_id=rt.team_id,
        source_id=source.id,
        registration_token_id=rt.id,
        status="previewed",
        reconcile_missing=payload.reconcile_missing,
        proposed_nodes=proposed,
        changes=changes,
        summary=summary,
        expires_at=now + timedelta(minutes=30),
    )
    db.add(run)
    source.last_attempt_at = now
    rt.last_used_at = now
    await db.flush()
    await record_audit_event(
        db, team_id=rt.team_id, actor_type="automation", actor_label=source.name,
        action="inventory_sync.previewed", resource_type="inventory_sync_run",
        resource_id=run.id, resource_name=source.name, after_data=summary,
        inventory_source_id=source.id, sync_run_id=run.id,
    )
    return run


async def get_sync_run_for_apply(
    db: AsyncSession, *, run_id: uuid.UUID
) -> InventorySyncRun | None:
    result = await db.execute(
        select(InventorySyncRun)
        .options(joinedload(InventorySyncRun.source))
        .where(InventorySyncRun.id == run_id)
        .with_for_update(of=InventorySyncRun)
    )
    return result.scalar_one_or_none()


async def apply_sync_run(
    db: AsyncSession, *, run: InventorySyncRun, rt: RegistrationToken, retire_missing: bool,
    actor_type: str = "automation", actor_user_id: uuid.UUID | None = None,
    actor_label: str | None = None,
) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    if run.status != "previewed":
        raise ValueError("This sync preview has already been applied or closed")
    if run.expires_at <= now:
        run.status = "expired"
        raise ValueError("This sync preview has expired; create a new preview")
    if run.team_id != rt.team_id:
        raise PermissionError("Registration token does not belong to this sync run")

    counts = {"created": 0, "updated": 0, "unchanged": 0, "retired": 0}
    input_changes = [change for change in run.changes if change["action"] != "missing"]
    for data, preview_change in zip(run.proposed_nodes, input_changes, strict=True):
        before = None
        if preview_change.get("node_id"):
            existing = await db.get(Node, uuid.UUID(preview_change["node_id"]))
            if existing:
                before = node_snapshot(existing)
        node, created = await register_or_update_node_with_token(
            db, rt=rt, data=dict(data), allow_create=not rt.is_exhausted
        )
        if node is None:
            raise ValueError("Registration token usage limit prevents creating a previewed node")
        expected_node_id = preview_change.get("node_id")
        if expected_node_id and node.id != uuid.UUID(expected_node_id):
            raise ValueError("Inventory changed after preview; create a new preview")
        if not expected_node_id and not created:
            raise ValueError("Inventory changed after preview; create a new preview")
        node.inventory_source_id = run.source_id
        node.external_id = data.get("external_id")
        node.tags = list(data.get("tags") or [])
        node.meta = dict(data.get("meta") or {})
        if data.get("parent_hostname") and node.parent_node_id is None:
            node.meta.setdefault("parent_hostname", data["parent_hostname"])
        node.last_seen_source = f"sync:{run.source.source_key}"
        await db.flush()
        after = node_snapshot(node)
        if created:
            counts["created"] += 1
            action = "node.created"
        elif preview_change["action"] == "unchanged":
            counts["unchanged"] += 1
            continue
        else:
            counts["updated"] += 1
            action = "node.updated"
        await record_audit_event(
            db, team_id=run.team_id, actor_type=actor_type,
            actor_user_id=actor_user_id, actor_label=actor_label or run.source.name,
            action=action, resource_type="node", resource_id=node.id, resource_name=node.name,
            before_data=before, after_data=after, inventory_source_id=run.source_id,
            sync_run_id=run.id,
        )

    if retire_missing:
        for change in run.changes:
            if change["action"] != "missing" or not change.get("node_id"):
                continue
            node = await db.get(Node, uuid.UUID(change["node_id"]))
            if not node or node.inventory_source_id != run.source_id:
                continue
            before = node_snapshot(node)
            node.lifecycle_status = "retired"
            node.reviewed_at = now
            await db.flush()
            counts["retired"] += 1
            await record_audit_event(
                db, team_id=run.team_id, actor_type=actor_type,
                actor_user_id=actor_user_id, actor_label=actor_label or run.source.name,
                action="node.retired_missing", resource_type="node", resource_id=node.id,
                resource_name=node.name, before_data=before, after_data=node_snapshot(node),
                inventory_source_id=run.source_id, sync_run_id=run.id,
            )

    run.status = "applied"
    run.applied_at = now
    run.summary = {**run.summary, **counts, "retire_missing": int(retire_missing)}
    run.source.last_attempt_at = now
    run.source.last_success_at = now
    run.source.last_error = None
    run.source.last_summary = run.summary
    rt.last_used_at = now
    await db.flush()
    await record_audit_event(
        db, team_id=run.team_id, actor_type=actor_type,
        actor_user_id=actor_user_id, actor_label=actor_label or run.source.name,
        action="inventory_sync.applied", resource_type="inventory_sync_run",
        resource_id=run.id, resource_name=run.source.name, after_data=run.summary,
        inventory_source_id=run.source_id, sync_run_id=run.id,
    )
    return counts


async def list_inventory_sources(db: AsyncSession, *, team_id: uuid.UUID) -> list[InventorySource]:
    result = await db.execute(
        select(InventorySource).where(InventorySource.team_id == team_id)
        .order_by(InventorySource.name.asc())
    )
    return list(result.scalars().all())


async def list_source_runs(
    db: AsyncSession, *, team_id: uuid.UUID, source_id: uuid.UUID, limit: int = 25
) -> list[InventorySyncRun]:
    result = await db.execute(
        select(InventorySyncRun)
        .where(InventorySyncRun.team_id == team_id, InventorySyncRun.source_id == source_id)
        .order_by(InventorySyncRun.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def get_team_sync_run(
    db: AsyncSession, *, team_id: uuid.UUID, run_id: uuid.UUID, lock: bool = False
) -> InventorySyncRun | None:
    stmt = (
        select(InventorySyncRun).options(joinedload(InventorySyncRun.source))
        .where(InventorySyncRun.team_id == team_id, InventorySyncRun.id == run_id)
    )
    if lock:
        stmt = stmt.with_for_update(of=InventorySyncRun)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
