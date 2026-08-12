from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.routes.register_node import _validate_token
from app.core.rate_limit import rate_limit_register_nodes_batch
from app.core.rbac import require_role
from app.db.session import get_db
from app.models.inventory_source import InventorySource
from app.models.inventory_sync_run import InventorySyncRun
from app.models.registration_token import RegistrationToken
from app.models.user import User
from app.schemas.accountability import (
    AuditEventPage,
    InventorySourcePage,
    InventorySyncApplyRequest,
    InventorySyncApplyResponse,
    InventorySyncHumanApplyRequest,
    InventorySyncPreview,
    InventorySyncPreviewRequest,
    InventorySyncRunDetail,
    InventorySyncRunPublic,
)
from app.services.audit import list_audit_events, record_audit_event
from app.services.inventory_sync import (
    apply_sync_run,
    create_sync_preview,
    get_sync_run_for_apply,
    get_team_sync_run,
    list_inventory_sources,
    list_source_runs,
)

machine_router = APIRouter(prefix="/inventory-sync", tags=["inventory-sync"])
team_router = APIRouter(prefix="/teams/{team_id}", tags=["accountability"])


@machine_router.post("/preview", response_model=InventorySyncPreview, status_code=201)
async def preview_inventory_sync(
    payload: InventorySyncPreviewRequest,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_register_nodes_batch),
) -> dict:
    rt = await _validate_token(db, payload.token)
    try:
        run = await create_sync_preview(db, rt=rt, payload=payload)
        await db.commit()
        await db.refresh(run, attribute_names=["source"])
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "run_id": run.id,
        "source": run.source,
        "status": run.status,
        "expires_at": run.expires_at,
        "reconcile_missing": run.reconcile_missing,
        "summary": run.summary,
        "changes": run.changes,
    }


@machine_router.post("/{run_id}/apply", response_model=InventorySyncApplyResponse)
async def apply_inventory_sync(
    run_id: uuid.UUID,
    payload: InventorySyncApplyRequest,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_register_nodes_batch),
) -> InventorySyncApplyResponse:
    rt = await _validate_token(db, payload.token)
    run = await get_sync_run_for_apply(db, run_id=run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Sync preview not found")
    if run.team_id != rt.team_id:
        await db.rollback()
        raise HTTPException(status_code=403, detail="Registration token does not belong to this sync run")
    if run.status != "previewed":
        await db.rollback()
        raise HTTPException(status_code=409, detail="This sync preview has already been applied or closed")
    if run.expires_at <= datetime.now(timezone.utc):
        run.status = "expired"
        await db.commit()
        raise HTTPException(status_code=409, detail="This sync preview has expired; create a new preview")
    try:
        counts = await apply_sync_run(db, run=run, rt=rt, retire_missing=payload.retire_missing)
        await db.commit()
        return InventorySyncApplyResponse(run_id=run.id, status="applied", summary=counts)
    except PermissionError as exc:
        await db.rollback()
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        await db.rollback()
        failed = await db.get(InventorySyncRun, run_id)
        if failed:
            failed.status = "failed"
            source = await db.get(InventorySource, failed.source_id)
            if source:
                source.last_attempt_at = datetime.now(timezone.utc)
                source.last_failure_at = datetime.now(timezone.utc)
                source.last_error = str(exc)[:2000]
                await record_audit_event(
                    db, team_id=failed.team_id, actor_type="automation", actor_label=source.name,
                    action="inventory_sync.failed", resource_type="inventory_sync_run",
                    resource_id=failed.id, resource_name=source.name,
                    context={"error": str(exc)[:500]}, inventory_source_id=source.id,
                    sync_run_id=failed.id,
                )
            await db.commit()
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@team_router.get("/audit-events", response_model=AuditEventPage)
async def audit_events(
    team_id: uuid.UUID,
    action: str | None = Query(default=None, max_length=80),
    resource_type: str | None = Query(default=None, max_length=40),
    actor_type: str | None = Query(default=None, pattern="^(user|automation|system)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuditEventPage:
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    total, events = await list_audit_events(
        db, team_id=team_id, action=action, resource_type=resource_type,
        actor_type=actor_type, limit=limit, offset=offset,
    )
    return AuditEventPage(total=total, events=events)


@team_router.get("/inventory-sources", response_model=InventorySourcePage)
async def inventory_sources(
    team_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InventorySourcePage:
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    return InventorySourcePage(sources=await list_inventory_sources(db, team_id=team_id))


@team_router.get(
    "/inventory-sources/{source_id}/runs", response_model=list[InventorySyncRunPublic]
)
async def inventory_source_runs(
    team_id: uuid.UUID,
    source_id: uuid.UUID,
    limit: int = Query(default=25, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[InventorySyncRun]:
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    return await list_source_runs(db, team_id=team_id, source_id=source_id, limit=limit)


@team_router.get("/inventory-sync-runs/{run_id}", response_model=InventorySyncRunDetail)
async def inventory_sync_run_detail(
    team_id: uuid.UUID,
    run_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InventorySyncRun:
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    run = await get_team_sync_run(db, team_id=team_id, run_id=run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Sync run not found")
    return run


@team_router.post(
    "/inventory-sync-runs/{run_id}/apply", response_model=InventorySyncApplyResponse
)
async def apply_inventory_sync_as_user(
    team_id: uuid.UUID,
    run_id: uuid.UUID,
    payload: InventorySyncHumanApplyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InventorySyncApplyResponse:
    await require_role(db, user=user, team_id=team_id, min_role="admin")
    run = await get_team_sync_run(db, team_id=team_id, run_id=run_id, lock=True)
    if not run:
        raise HTTPException(status_code=404, detail="Sync run not found")
    if run.status != "previewed":
        await db.rollback()
        raise HTTPException(status_code=409, detail="This sync preview has already been applied or closed")
    if run.expires_at <= datetime.now(timezone.utc):
        run.status = "expired"
        await db.commit()
        raise HTTPException(status_code=409, detail="This sync preview has expired; create a new preview")
    if not run.registration_token_id:
        raise HTTPException(status_code=409, detail="The registration credential for this preview no longer exists")
    rt = await db.get(RegistrationToken, run.registration_token_id)
    if not rt or not rt.is_active or rt.is_expired:
        raise HTTPException(status_code=409, detail="The registration credential for this preview is no longer usable")
    try:
        counts = await apply_sync_run(
            db, run=run, rt=rt, retire_missing=payload.retire_missing,
            actor_type="user", actor_user_id=user.id, actor_label=user.email,
        )
        await db.commit()
        return InventorySyncApplyResponse(run_id=run.id, status="applied", summary=counts)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
