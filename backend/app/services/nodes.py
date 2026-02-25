from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy import delete as sa_delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.node import Node
from app.schemas.nodes import NodeLastSeenStats, NodeStats, TagCount


async def list_nodes(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    q: str | None = None,
    parent_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Node]:
    stmt = select(Node).where(Node.team_id == team_id).order_by(Node.updated_at.desc())
    if parent_id is not None:
        stmt = stmt.where(Node.parent_node_id == parent_id)
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


async def get_node_stats(db: AsyncSession, *, team_id: uuid.UUID, top_tags_limit: int = 10) -> NodeStats:
    total = (await db.execute(select(func.count(Node.id)).where(Node.team_id == team_id))).scalar_one()

    res = await db.execute(
        select(Node.kind, func.count(Node.id))
        .where(Node.team_id == team_id)
        .group_by(Node.kind)
    )
    by_kind = {kind: int(count) for kind, count in res.all()}

    now = datetime.now(timezone.utc)
    c24 = now - timedelta(hours=24)
    c7 = now - timedelta(days=7)
    c30 = now - timedelta(days=30)

    seen = await db.execute(
        select(
            func.count(Node.id).filter(Node.last_seen_at >= c24).label("last_24h"),
            func.count(Node.id).filter(Node.last_seen_at >= c7).label("last_7d"),
            func.count(Node.id).filter(Node.last_seen_at >= c30).label("last_30d"),
            func.count(Node.id).filter(Node.last_seen_at.is_(None)).label("never"),
        ).where(Node.team_id == team_id)
    )
    last_24h, last_7d, last_30d, never = seen.one()
    last_seen = NodeLastSeenStats(
        last_24h=int(last_24h or 0),
        last_7d=int(last_7d or 0),
        last_30d=int(last_30d or 0),
        never=int(never or 0),
    )

    tag_rows = await db.execute(
        text(
            """
            select tag, count(*)::int as count
            from nodes, jsonb_array_elements_text(nodes.tags) as tag
            where nodes.team_id = :team_id
            group by tag
            order by count desc, tag asc
            limit :limit
            """
        ),
        {"team_id": str(team_id), "limit": top_tags_limit},
    )
    top_tags = [TagCount(tag=row[0], count=int(row[1])) for row in tag_rows.all()]

    return NodeStats(total=int(total), by_kind=by_kind, last_seen=last_seen, top_tags=top_tags)


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

