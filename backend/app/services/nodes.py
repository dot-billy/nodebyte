from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy import and_, cast, delete as sa_delete, func, or_, select, text, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.node import Node
from app.schemas.nodes import (
    IpSegmentCount,
    NodeLastSeenStats,
    NodeStats,
    StaleReviewQueue,
    StaleReviewSummary,
    TagCount,
)


async def list_nodes(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    q: str | None = None,
    parent_id: uuid.UUID | None = None,
    kind: list[str] | None = None,
    has_url: bool | None = None,
    tags: list[str] | None = None,
    is_orphan: bool | None = None,
    lifecycle_status: list[str] | None = None,
    stale_after_days: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Node]:
    stmt = (
        select(Node)
        .options(joinedload(Node.owner), joinedload(Node.reviewed_by))
        .where(Node.team_id == team_id)
        .order_by(Node.updated_at.desc())
    )
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
    if kind:
        stmt = stmt.where(Node.kind.in_(kind))
    if has_url is True:
        stmt = stmt.where(Node.url.isnot(None))
    elif has_url is False:
        stmt = stmt.where(Node.url.is_(None))
    if tags:
        stmt = stmt.where(Node.tags.op("@>")(cast(tags, JSONB)))
    if is_orphan is True:
        stmt = stmt.where(Node.parent_node_id.is_(None))
    elif is_orphan is False:
        stmt = stmt.where(Node.parent_node_id.isnot(None))
    if lifecycle_status:
        stmt = stmt.where(Node.lifecycle_status.in_(lifecycle_status))
    if stale_after_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=stale_after_days)
        stmt = stmt.where(or_(Node.last_seen_at.is_(None), Node.last_seen_at < cutoff))
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

    ip_rows = await db.execute(
        text(
            """
            with ips as (
              select
                nodes.id as node_id,
                coalesce(ip.value->>'network', ip.value->>'interface', 'unknown') as segment,
                ip.value->>'family' as family
              from nodes
              join lateral jsonb_array_elements(coalesce(nodes.meta->'ips', '[]'::jsonb)) as ip(value) on true
              where nodes.team_id = :team_id
            )
            select
              segment,
              count(distinct node_id)::int as node_count,
              count(*)::int as address_count
            from ips
            where segment is not null and segment <> ''
            group by segment
            order by node_count desc, address_count desc, segment asc
            limit 10
            """
        ),
        {"team_id": str(team_id)},
    )
    ip_segments = [
        IpSegmentCount(segment=row[0], node_count=int(row[1]), address_count=int(row[2]))
        for row in ip_rows.all()
    ]

    fam_rows = await db.execute(
        text(
            """
            with ips as (
              select
                nodes.id as node_id,
                ip.value->>'family' as family
              from nodes
              join lateral jsonb_array_elements(coalesce(nodes.meta->'ips', '[]'::jsonb)) as ip(value) on true
              where nodes.team_id = :team_id
            )
            select family, count(distinct node_id)::int as node_count
            from ips
            where family is not null and family <> ''
            group by family
            order by node_count desc, family asc
            """
        ),
        {"team_id": str(team_id)},
    )
    ip_family_nodes = {str(row[0]): int(row[1]) for row in fam_rows.all()}

    return NodeStats(
        total=int(total),
        by_kind=by_kind,
        last_seen=last_seen,
        top_tags=top_tags,
        ip_segments=ip_segments,
        ip_family_nodes=ip_family_nodes,
    )


async def get_node(db: AsyncSession, *, team_id: uuid.UUID, node_id: uuid.UUID) -> Node | None:
    res = await db.execute(
        select(Node)
        .options(joinedload(Node.owner), joinedload(Node.reviewed_by))
        .where(Node.team_id == team_id)
        .where(Node.id == node_id)
    )
    return res.scalar_one_or_none()

async def validate_parent_node_id(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    node_id: uuid.UUID | None,
    parent_node_id: uuid.UUID | None,
) -> None:
    if parent_node_id is None:
        return

    parent = await get_node(db, team_id=team_id, node_id=parent_node_id)
    if not parent:
        raise ValueError("Parent node not found")

    # For create flows we only need to validate existence in-team.
    if node_id is None:
        return

    if parent_node_id == node_id:
        raise ValueError("A node cannot be its own parent")

    # Prevent cycles by walking up the parent chain starting at the proposed parent.
    seen: set[uuid.UUID] = set()
    current: uuid.UUID | None = parent_node_id
    while current is not None:
        if current == node_id:
            raise ValueError("This parent would create a cycle")
        if current in seen:
            raise ValueError("Cycle detected in existing relationships")
        seen.add(current)

        res = await db.execute(
            select(Node.parent_node_id)
            .where(Node.team_id == team_id)
            .where(Node.id == current)
        )
        current = res.scalar_one_or_none()


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


def _stale_condition(cutoff: datetime):
    return or_(Node.last_seen_at.is_(None), Node.last_seen_at < cutoff)


def _review_due_condition(cutoff: datetime):
    source_timestamp = func.coalesce(Node.last_seen_at, Node.created_at)
    return or_(
        Node.reviewed_at.is_(None),
        Node.reviewed_at < source_timestamp,
        Node.reviewed_at < cutoff,
    )


async def get_stale_review_queue(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    stale_after_days: int,
    limit: int = 200,
) -> StaleReviewQueue:
    cutoff = datetime.now(timezone.utc) - timedelta(days=stale_after_days)
    stale = _stale_condition(cutoff)
    due = _review_due_condition(cutoff)

    pending_stmt = (
        select(Node)
        .options(joinedload(Node.owner), joinedload(Node.reviewed_by))
        .where(Node.team_id == team_id)
        .where(Node.lifecycle_status == "active")
        .where(stale)
        .where(due)
        .order_by(Node.last_seen_at.asc().nullsfirst(), Node.name.asc())
        .limit(limit)
    )
    pending_nodes = list((await db.execute(pending_stmt)).scalars().unique().all())

    counts = await db.execute(
        select(
            func.count(Node.id).filter(
                and_(Node.lifecycle_status == "active", stale, due)
            ),
            func.count(Node.id).filter(and_(Node.lifecycle_status == "ignored", stale)),
            func.count(Node.id).filter(and_(Node.lifecycle_status == "retired", stale)),
            func.count(Node.id).filter(stale),
        ).where(Node.team_id == team_id)
    )
    pending, ignored, retired, total_stale = counts.one()
    return StaleReviewQueue(
        summary=StaleReviewSummary(
            stale_after_days=stale_after_days,
            pending=int(pending or 0),
            ignored=int(ignored or 0),
            retired=int(retired or 0),
            total_stale=int(total_stale or 0),
        ),
        nodes=pending_nodes,
    )


async def apply_stale_review_decision(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    node_ids: list[uuid.UUID],
    lifecycle_status: str,
    reviewed_by_id: uuid.UUID,
    owner_user_id: uuid.UUID | None,
) -> int:
    values: dict = {
        "lifecycle_status": lifecycle_status,
        "reviewed_at": datetime.now(timezone.utc),
        "reviewed_by_id": reviewed_by_id,
    }
    if owner_user_id is not None:
        values["owner_user_id"] = owner_user_id
    result = await db.execute(
        update(Node)
        .where(Node.team_id == team_id)
        .where(Node.id.in_(node_ids))
        .values(**values)
    )
    return result.rowcount  # type: ignore[return-value]
