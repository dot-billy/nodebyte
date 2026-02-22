from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.membership import Membership


async def list_members(db: AsyncSession, *, team_id: uuid.UUID) -> list[Membership]:
    res = await db.execute(
        select(Membership)
        .options(joinedload(Membership.user))
        .where(Membership.team_id == team_id)
        .order_by(Membership.created_at.asc())
    )
    return list(res.scalars().unique().all())


async def get_membership(db: AsyncSession, *, membership_id: uuid.UUID, team_id: uuid.UUID) -> Membership | None:
    res = await db.execute(
        select(Membership)
        .options(joinedload(Membership.user))
        .where(Membership.id == membership_id)
        .where(Membership.team_id == team_id)
    )
    return res.scalar_one_or_none()


async def update_member_role(db: AsyncSession, *, membership: Membership, role: str) -> Membership:
    membership.role = role
    await db.flush()
    return membership


async def remove_member(db: AsyncSession, *, membership: Membership) -> None:
    await db.delete(membership)
    await db.flush()
