from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.rbac import require_role
from app.db.session import get_db
from app.models.membership import Membership
from app.models.node import Node
from app.models.user import User
from app.schemas.nodes import (
    BulkActionResponse,
    BulkDeleteRequest,
    BulkTagRequest,
    NodeCreate,
    NodePublic,
    NodeStats,
    NodeUpdate,
    StaleReviewDecision,
    StaleReviewQueue,
)
from app.services.ansible_inventory import build_ansible_inventory
from app.services.audit import node_snapshot, record_audit_event
from app.services.nodes import (
    apply_stale_review_decision,
    bulk_delete_nodes,
    bulk_update_tags,
    count_nodes,
    create_node,
    delete_node,
    get_node,
    get_node_stats,
    get_stale_review_queue,
    list_nodes,
    update_node,
    validate_parent_node_id,
)

router = APIRouter(prefix="/teams/{team_id}/nodes", tags=["nodes"])


@router.get("/count")
async def nodes_count(
    team_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    total = await count_nodes(db, team_id=team_id)
    return {"count": total}


@router.get("/stats", response_model=NodeStats)
async def nodes_stats(
    team_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NodeStats:
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    return await get_node_stats(db, team_id=team_id)


@router.get("", response_model=list[NodePublic])
async def nodes_list(
    team_id: uuid.UUID,
    q: str | None = None,
    parent_id: uuid.UUID | None = Query(default=None),
    kind: list[str] | None = Query(default=None),
    has_url: bool | None = Query(default=None),
    tags: list[str] | None = Query(default=None),
    is_orphan: bool | None = Query(default=None),
    lifecycle_status: list[str] | None = Query(default=None),
    stale_after_days: int | None = Query(default=None, ge=1, le=3650),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Node]:
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    return await list_nodes(
        db, team_id=team_id, q=q, parent_id=parent_id,
        kind=kind, has_url=has_url, tags=tags, is_orphan=is_orphan,
        lifecycle_status=lifecycle_status, stale_after_days=stale_after_days,
        limit=limit, offset=offset,
    )


@router.post("", response_model=NodePublic, status_code=201)
async def nodes_create(
    team_id: uuid.UUID,
    payload: NodeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Node:
    await require_role(db, user=user, team_id=team_id, min_role="member")
    data = payload.model_dump()
    try:
        await validate_parent_node_id(
            db,
            team_id=team_id,
            node_id=None,
            parent_node_id=data.get("parent_node_id"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    node = await create_node(db, team_id=team_id, data=data)
    await record_audit_event(
        db, team_id=team_id, actor_type="user", actor_user_id=user.id,
        actor_label=user.email, action="node.created", resource_type="node",
        resource_id=node.id, resource_name=node.name, after_data=node_snapshot(node),
    )
    await db.commit()
    created = await get_node(db, team_id=team_id, node_id=node.id)
    if created is None:  # pragma: no cover - defensive after a successful insert
        raise HTTPException(status_code=500, detail="Node creation could not be verified")
    return created


@router.post("/bulk-delete", response_model=BulkActionResponse)
async def nodes_bulk_delete(
    team_id: uuid.UUID,
    payload: BulkDeleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BulkActionResponse:
    await require_role(db, user=user, team_id=team_id, min_role="member")
    rows = await db.execute(select(Node).where(Node.team_id == team_id, Node.id.in_(payload.node_ids)))
    snapshots = [node_snapshot(node) for node in rows.scalars().all()]
    affected = await bulk_delete_nodes(db, team_id=team_id, node_ids=payload.node_ids)
    await record_audit_event(
        db, team_id=team_id, actor_type="user", actor_user_id=user.id,
        actor_label=user.email, action="node.bulk_deleted", resource_type="node_batch",
        resource_name=f"{affected} nodes", before_data={"nodes": snapshots},
        context={"affected": affected},
    )
    await db.commit()
    return BulkActionResponse(affected=affected)


@router.post("/bulk-tag", response_model=BulkActionResponse)
async def nodes_bulk_tag(
    team_id: uuid.UUID,
    payload: BulkTagRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BulkActionResponse:
    await require_role(db, user=user, team_id=team_id, min_role="member")
    affected = await bulk_update_tags(
        db,
        team_id=team_id,
        node_ids=payload.node_ids,
        add=payload.add or None,
        remove=payload.remove or None,
    )
    await record_audit_event(
        db, team_id=team_id, actor_type="user", actor_user_id=user.id,
        actor_label=user.email, action="node.bulk_tagged", resource_type="node_batch",
        resource_name=f"{affected} nodes", context={
            "node_ids": [str(node_id) for node_id in payload.node_ids],
            "add": payload.add, "remove": payload.remove, "affected": affected,
        },
    )
    await db.commit()
    return BulkActionResponse(affected=affected)


@router.get("/export/ansible")
async def nodes_export_ansible(
    team_id: uuid.UUID,
    groups: list[str] = Query(default=["kind", "tag", "parent", "subnet"]),
    q: str | None = None,
    kind: list[str] | None = Query(default=None),
    has_url: bool | None = Query(default=None),
    tags: list[str] | None = Query(default=None),
    is_orphan: bool | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    if kind is None:
        kind = ["device"]
    nodes = await list_nodes(
        db, team_id=team_id, q=q, kind=kind, has_url=has_url,
        tags=tags, is_orphan=is_orphan, limit=10000, offset=0,
    )

    parent_names: dict[uuid.UUID, str] = {}
    if "parent" in groups:
        parent_ids = {n.parent_node_id for n in nodes if n.parent_node_id}
        if parent_ids:
            stmt = select(Node.id, Node.name).where(Node.id.in_(parent_ids))
            res = await db.execute(stmt)
            parent_names = {row[0]: row[1] for row in res.all()}

    inventory = build_ansible_inventory(
        nodes, parent_names=parent_names, group_strategies=set(groups),
    )
    return JSONResponse(
        content=inventory,
        headers={"Content-Disposition": 'attachment; filename="inventory.json"'},
    )


@router.get("/stale-review", response_model=StaleReviewQueue)
async def stale_review_queue(
    team_id: uuid.UUID,
    stale_after_days: int = Query(default=30, ge=1, le=3650),
    limit: int = Query(default=200, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StaleReviewQueue:
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    return await get_stale_review_queue(
        db,
        team_id=team_id,
        stale_after_days=stale_after_days,
        limit=limit,
    )


@router.post("/stale-review/decide", response_model=BulkActionResponse)
async def stale_review_decide(
    team_id: uuid.UUID,
    payload: StaleReviewDecision,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BulkActionResponse:
    await require_role(db, user=user, team_id=team_id, min_role="member")
    if payload.owner_user_id is not None:
        owner = await db.execute(
            select(Membership.id)
            .where(Membership.team_id == team_id)
            .where(Membership.user_id == payload.owner_user_id)
        )
        if owner.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Owner must be a team member")
    affected = await apply_stale_review_decision(
        db,
        team_id=team_id,
        node_ids=payload.node_ids,
        lifecycle_status=payload.lifecycle_status,
        reviewed_by_id=user.id,
        owner_user_id=payload.owner_user_id,
    )
    await record_audit_event(
        db, team_id=team_id, actor_type="user", actor_user_id=user.id,
        actor_label=user.email, action="node.stale_review_decided",
        resource_type="node_batch", resource_name=f"{affected} nodes",
        context={"node_ids": [str(node_id) for node_id in payload.node_ids],
                 "lifecycle_status": payload.lifecycle_status,
                 "owner_user_id": str(payload.owner_user_id) if payload.owner_user_id else None,
                 "affected": affected},
    )
    await db.commit()
    return BulkActionResponse(affected=affected)


@router.get("/{node_id}", response_model=NodePublic)
async def nodes_get(
    team_id: uuid.UUID,
    node_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Node:
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    node = await get_node(db, team_id=team_id, node_id=node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.patch("/{node_id}", response_model=NodePublic)
async def nodes_patch(
    team_id: uuid.UUID,
    node_id: uuid.UUID,
    payload: NodeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Node:
    await require_role(db, user=user, team_id=team_id, min_role="member")
    node = await get_node(db, team_id=team_id, node_id=node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    data = payload.model_dump(exclude_unset=True)
    before = node_snapshot(node)

    if "parent_node_id" in data:
        try:
            await validate_parent_node_id(
                db,
                team_id=team_id,
                node_id=node.id,
                parent_node_id=data.get("parent_node_id"),
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    node = await update_node(db, node=node, data=data)
    await record_audit_event(
        db, team_id=team_id, actor_type="user", actor_user_id=user.id,
        actor_label=user.email, action="node.updated", resource_type="node",
        resource_id=node.id, resource_name=node.name, before_data=before,
        after_data=node_snapshot(node),
    )
    await db.commit()
    updated = await get_node(db, team_id=team_id, node_id=node.id)
    if updated is None:  # pragma: no cover - defensive after a successful update
        raise HTTPException(status_code=500, detail="Node update could not be verified")
    return updated


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def nodes_delete(
    team_id: uuid.UUID,
    node_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await require_role(db, user=user, team_id=team_id, min_role="member")
    node = await get_node(db, team_id=team_id, node_id=node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    before = node_snapshot(node)
    await delete_node(db, node=node)
    await record_audit_event(
        db, team_id=team_id, actor_type="user", actor_user_id=user.id,
        actor_label=user.email, action="node.deleted", resource_type="node",
        resource_id=node.id, resource_name=node.name, before_data=before,
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
