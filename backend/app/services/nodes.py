from __future__ import annotations

import uuid

from sqlalchemy import delete as sa_delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.node import Node


async def list_nodes(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Node]:
    stmt = select(Node).where(Node.team_id == team_id).order_by(Node.updated_at.desc())
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Node.name.ilike(like),
                Node.hostname.ilike(like),
                Node.ip.ilike(like),
                Node.url.ilike(like),
            )
        )
    stmt = stmt.limit(limit).offset(offset)
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def count_nodes(db: AsyncSession, *, team_id: uuid.UUID) -> int:
    res = await db.execute(select(func.count()).select_from(Node).where(Node.team_id == team_id))
    return res.scalar_one()


async def get_node(db: AsyncSession, *, team_id: uuid.UUID, node_id: uuid.UUID) -> Node | None:
    res = await db.execute(select(Node).where(Node.team_id == team_id).where(Node.id == node_id))
    return res.scalar_one_or_none()


async def create_node(db: AsyncSession, *, team_id: uuid.UUID, data: dict) -> Node:
    node = Node(team_id=team_id, **data)
    db.add(node)
    await db.flush()
    return node


async def update_node(db: AsyncSession, *, node: Node, data: dict) -> Node:
    for k, v in data.items():
        setattr(node, k, v)
    await db.flush()
    return node


async def delete_node(db: AsyncSession, *, node: Node) -> None:
    await db.delete(node)


async def bulk_delete_nodes(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    node_ids: list[uuid.UUID],
) -> int:
    stmt = (
        sa_delete(Node)
        .where(Node.team_id == team_id)
        .where(Node.id.in_(node_ids))
    )
    result = await db.execute(stmt)
    return result.rowcount  # type: ignore[return-value]


async def bulk_update_tags(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    node_ids: list[uuid.UUID],
    add: list[str] | None = None,
    remove: list[str] | None = None,
) -> int:
    stmt = select(Node).where(Node.team_id == team_id).where(Node.id.in_(node_ids))
    res = await db.execute(stmt)
    nodes = list(res.scalars().all())
    remove_set = set(remove or [])
    add_list = add or []
    for node in nodes:
        tags = [t for t in (node.tags or []) if t not in remove_set]
        for t in add_list:
            if t not in tags:
                tags.append(t)
        node.tags = tags
    await db.flush()
    return len(nodes)

