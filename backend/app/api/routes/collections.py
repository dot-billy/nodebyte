from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.deps import get_current_user
from app.core.rbac import require_role
from app.db.session import get_db
from app.models.collection import Collection, CollectionNode, NodeLink
from app.models.node import Node
from app.models.user import User
from app.schemas.collections import CollectionPublic, CollectionWrite
from app.schemas.nodes import NodePublic
from app.services.audit import record_audit_event
from app.services.collections import get_collection
from app.services.nodes import get_node

router = APIRouter(prefix="/teams/{team_id}", tags=["knowledge"])


async def require_collection(db: AsyncSession, team_id: uuid.UUID, collection_id: uuid.UUID) -> Collection:
    collection = await get_collection(db, team_id=team_id, collection_id=collection_id)
    if not collection:
        raise HTTPException(404, "Collection not found")
    return collection


async def require_node(db: AsyncSession, team_id: uuid.UUID, node_id: uuid.UUID) -> Node:
    node = await get_node(db, team_id=team_id, node_id=node_id)
    if not node:
        raise HTTPException(404, "Resource not found")
    return node


async def audit(db: AsyncSession, user: User, team_id: uuid.UUID, action: str, resource_id: uuid.UUID, name: str, context: dict | None = None) -> None:
    await record_audit_event(db, team_id=team_id, actor_type="user", actor_user_id=user.id,
        actor_label=user.email, action=action, resource_type="collection" if action.startswith("collection.") else "node",
        resource_id=resource_id, resource_name=name, context=context)


async def public_collection(db: AsyncSession, collection: Collection) -> CollectionPublic:
    result = CollectionPublic.model_validate(collection)
    result.resource_count = await db.scalar(select(func.count()).select_from(CollectionNode).where(CollectionNode.collection_id == collection.id)) or 0
    return result


@router.get("/collections", response_model=list[CollectionPublic])
async def collections_list(team_id: uuid.UUID, node_id: uuid.UUID | None = None,
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    stmt = select(Collection, func.count(CollectionNode.node_id)).outerjoin(CollectionNode).where(Collection.team_id == team_id)
    if node_id is not None:
        await require_node(db, team_id, node_id)
        stmt = stmt.where(Collection.id.in_(select(CollectionNode.collection_id).where(CollectionNode.node_id == node_id)))
    rows = (await db.execute(stmt.group_by(Collection.id).order_by(func.lower(Collection.name), Collection.id).limit(limit).offset(offset))).all()
    return [CollectionPublic.model_validate(c).model_copy(update={"resource_count": count}) for c, count in rows]


@router.post("/collections", response_model=CollectionPublic, status_code=201)
async def collections_create(team_id: uuid.UUID, payload: CollectionWrite,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_role(db, user=user, team_id=team_id, min_role="member")
    collection = Collection(team_id=team_id, **payload.model_dump())
    db.add(collection)
    await db.flush()
    await audit(db, user, team_id, "collection.created", collection.id, collection.name, payload.model_dump())
    await db.commit()
    return await public_collection(db, collection)


@router.get("/collections/{collection_id}", response_model=CollectionPublic)
async def collections_get(team_id: uuid.UUID, collection_id: uuid.UUID,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    return await public_collection(db, await require_collection(db, team_id, collection_id))


@router.put("/collections/{collection_id}", response_model=CollectionPublic)
async def collections_update(team_id: uuid.UUID, collection_id: uuid.UUID, payload: CollectionWrite,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_role(db, user=user, team_id=team_id, min_role="member")
    collection = await require_collection(db, team_id, collection_id)
    before = {"name": collection.name, "description": collection.description}
    collection.name, collection.description = payload.name, payload.description
    await db.flush()
    await db.refresh(collection)
    await audit(db, user, team_id, "collection.updated", collection.id, collection.name, {"before": before, "after": payload.model_dump()})
    await db.commit()
    return await public_collection(db, collection)


@router.delete("/collections/{collection_id}", status_code=204)
async def collections_delete(team_id: uuid.UUID, collection_id: uuid.UUID,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_role(db, user=user, team_id=team_id, min_role="member")
    collection = await require_collection(db, team_id, collection_id)
    await audit(db, user, team_id, "collection.deleted", collection.id, collection.name)
    await db.delete(collection)
    await db.commit()
    return Response(status_code=204)


@router.put("/collections/{collection_id}/nodes/{node_id}", status_code=204)
async def collection_add_node(team_id: uuid.UUID, collection_id: uuid.UUID, node_id: uuid.UUID,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_role(db, user=user, team_id=team_id, min_role="member")
    collection = await require_collection(db, team_id, collection_id)
    await require_node(db, team_id, node_id)
    result = await db.execute(insert(CollectionNode).values(collection_id=collection_id, node_id=node_id).on_conflict_do_nothing())
    if result.rowcount:
        await audit(db, user, team_id, "collection.resource_added", collection.id, collection.name, {"node_id": str(node_id)})
    await db.commit()
    return Response(status_code=204)


@router.delete("/collections/{collection_id}/nodes/{node_id}", status_code=204)
async def collection_remove_node(team_id: uuid.UUID, collection_id: uuid.UUID, node_id: uuid.UUID,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_role(db, user=user, team_id=team_id, min_role="member")
    collection = await require_collection(db, team_id, collection_id)
    await require_node(db, team_id, node_id)
    result = await db.execute(delete(CollectionNode).where(CollectionNode.collection_id == collection_id, CollectionNode.node_id == node_id))
    if result.rowcount:
        await audit(db, user, team_id, "collection.resource_removed", collection.id, collection.name, {"node_id": str(node_id)})
    await db.commit()
    return Response(status_code=204)


@router.get("/nodes/{node_id}/links", response_model=list[NodePublic])
async def node_links_list(team_id: uuid.UUID, node_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    await require_node(db, team_id, node_id)
    stmt = select(Node).options(joinedload(Node.owner), joinedload(Node.reviewed_by)).where(Node.team_id == team_id, or_(
        Node.id.in_(select(NodeLink.right_node_id).where(NodeLink.left_node_id == node_id)),
        Node.id.in_(select(NodeLink.left_node_id).where(NodeLink.right_node_id == node_id)),
    )).order_by(func.lower(Node.name), Node.id).limit(limit).offset(offset)
    return list((await db.execute(stmt)).scalars().all())


@router.put("/nodes/{node_id}/links/{related_id}", status_code=204)
async def node_link_create(team_id: uuid.UUID, node_id: uuid.UUID, related_id: uuid.UUID,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_role(db, user=user, team_id=team_id, min_role="member")
    node = await require_node(db, team_id, node_id)
    await require_node(db, team_id, related_id)
    if node_id == related_id:
        raise HTTPException(400, "A resource cannot link to itself")
    left, right = sorted([node_id, related_id])
    result = await db.execute(insert(NodeLink).values(left_node_id=left, right_node_id=right).on_conflict_do_nothing())
    if result.rowcount:
        await audit(db, user, team_id, "node.linked", node.id, node.name, {"related_id": str(related_id)})
    await db.commit()
    return Response(status_code=204)


@router.delete("/nodes/{node_id}/links/{related_id}", status_code=204)
async def node_link_delete(team_id: uuid.UUID, node_id: uuid.UUID, related_id: uuid.UUID,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await require_role(db, user=user, team_id=team_id, min_role="member")
    node = await require_node(db, team_id, node_id)
    await require_node(db, team_id, related_id)
    left, right = sorted([node_id, related_id])
    result = await db.execute(delete(NodeLink).where(NodeLink.left_node_id == left, NodeLink.right_node_id == right))
    if result.rowcount:
        await audit(db, user, team_id, "node.unlinked", node.id, node.name, {"related_id": str(related_id)})
    await db.commit()
    return Response(status_code=204)
