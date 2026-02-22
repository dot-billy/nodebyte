from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.membership import Membership
from app.models.team import Team


async def create_team_with_owner(db: AsyncSession, *, name: str, slug: str, owner_user_id: uuid.UUID) -> Team:
    team = Team(name=name, slug=slug, created_by_id=owner_user_id)
    db.add(team)
    await db.flush()

    membership = Membership(user_id=owner_user_id, team_id=team.id, role="owner")
    db.add(membership)
    await db.flush()
    return team


async def list_teams_for_user(db: AsyncSession, *, user_id: uuid.UUID) -> list[Team]:
    res = await db.execute(
        select(Team)
        .join(Membership, Membership.team_id == Team.id)
        .where(Membership.user_id == user_id)
        .order_by(Team.created_at.desc())
    )
    return list(res.scalars().all())


async def list_teams_with_role_for_user(db: AsyncSession, *, user_id: uuid.UUID) -> list[tuple[Team, str]]:
    res = await db.execute(
        select(Team, Membership.role)
        .join(Membership, Membership.team_id == Team.id)
        .where(Membership.user_id == user_id)
        .order_by(Team.created_at.desc())
    )
    return list(res.all())


async def get_team(db: AsyncSession, *, team_id: uuid.UUID) -> Team | None:
    res = await db.execute(select(Team).where(Team.id == team_id))
    return res.scalar_one_or_none()


async def require_team_membership(db: AsyncSession, *, user_id: uuid.UUID, team_id: uuid.UUID) -> Membership | None:
    res = await db.execute(
        select(Membership).where(Membership.user_id == user_id).where(Membership.team_id == team_id)
    )
    return res.scalar_one_or_none()

