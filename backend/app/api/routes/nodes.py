from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.rbac import require_role
from app.db.session import get_db
from app.models.node import Node
from app.models.user import User
from app.schemas.nodes import BulkActionResponse, BulkDeleteRequest, BulkTagRequest, NodeCreate, NodePublic, NodeStats, NodeUpdate
from app.services.nodes import (
    bulk_delete_nodes,
    bulk_update_tags,
    count_nodes,
    create_node,
    delete_node,
    get_node_stats,
    get_node,
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
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Node]:
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    return await list_nodes(db, team_id=team_id, q=q, parent_id=parent_id, limit=limit, offset=offset)


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
    await db.commit()
    # Ensure DB-generated fields are loaded for serialization.
    await db.refresh(node)
    return node


@router.post("/bulk-delete", response_model=BulkActionResponse)
async def nodes_bulk_delete(
    team_id: uuid.UUID,
    payload: BulkDeleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BulkActionResponse:
    await require_role(db, user=user, team_id=team_id, min_role="member")
    affected = await bulk_delete_nodes(db, team_id=team_id, node_ids=payload.node_ids)
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
    await db.commit()
    # Ensure any server-side updates are loaded for serialization.
    await db.refresh(node)
    return node


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
    await delete_node(db, node=node)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

