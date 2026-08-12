from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.models.node import Node


def _json_value(value: Any) -> Any:
    if isinstance(value, (uuid.UUID, datetime)):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(v) for v in value]
    return value


def node_snapshot(node: Node) -> dict:
    return _json_value({
        "id": node.id,
        "name": node.name,
        "kind": node.kind,
        "hostname": node.hostname,
        "ip": node.ip,
        "url": node.url,
        "tags": node.tags,
        "meta": node.meta,
        "notes": node.notes,
        "parent_node_id": node.parent_node_id,
        "inventory_source_id": node.inventory_source_id,
        "external_id": node.external_id,
        "lifecycle_status": node.lifecycle_status,
        "owner_user_id": node.owner_user_id,
        "last_seen_at": node.last_seen_at,
        "last_seen_source": node.last_seen_source,
    })


async def record_audit_event(
    db: AsyncSession,
    *,
    team_id: uuid.UUID | None,
    actor_type: str,
    action: str,
    resource_type: str,
    actor_user_id: uuid.UUID | None = None,
    actor_label: str | None = None,
    resource_id: uuid.UUID | None = None,
    resource_name: str | None = None,
    before_data: dict | None = None,
    after_data: dict | None = None,
    context: dict | None = None,
    inventory_source_id: uuid.UUID | None = None,
    sync_run_id: uuid.UUID | None = None,
) -> AuditEvent:
    event = AuditEvent(
        team_id=team_id,
        actor_user_id=actor_user_id,
        actor_type=actor_type,
        actor_label=actor_label,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        resource_name=resource_name,
        before_data=_json_value(before_data),
        after_data=_json_value(after_data),
        context=_json_value(context or {}),
        inventory_source_id=inventory_source_id,
        sync_run_id=sync_run_id,
    )
    db.add(event)
    await db.flush()
    return event


async def list_audit_events(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    action: str | None = None,
    resource_type: str | None = None,
    actor_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[int, list[AuditEvent]]:
    filters = [AuditEvent.team_id == team_id]
    if action:
        filters.append(AuditEvent.action == action)
    if resource_type:
        filters.append(AuditEvent.resource_type == resource_type)
    if actor_type:
        filters.append(AuditEvent.actor_type == actor_type)
    total = await db.scalar(select(func.count()).select_from(AuditEvent).where(*filters))
    result = await db.execute(
        select(AuditEvent)
        .where(*filters)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return int(total or 0), list(result.scalars().all())
