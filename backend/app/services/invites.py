from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.invite import Invite
from app.models.membership import Membership

INVITE_TOKEN_BYTES = 32
INVITE_EXPIRY_DAYS = 7


async def create_invite(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    invited_email: str,
    role: str,
    invited_by_id: uuid.UUID,
) -> Invite:
    token = secrets.token_urlsafe(INVITE_TOKEN_BYTES)
    invite = Invite(
        team_id=team_id,
        invited_email=invited_email.lower().strip(),
        role=role,
        token=token,
        invited_by_id=invited_by_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_EXPIRY_DAYS),
    )
    db.add(invite)
    await db.flush()
    return invite


async def list_invites(db: AsyncSession, *, team_id: uuid.UUID) -> list[Invite]:
    res = await db.execute(
        select(Invite)
        .options(joinedload(Invite.invited_by))
        .where(Invite.team_id == team_id)
        .where(Invite.accepted_at.is_(None))
        .order_by(Invite.created_at.desc())
    )
    return list(res.scalars().unique().all())


async def get_invite_by_token(db: AsyncSession, *, token: str) -> Invite | None:
    res = await db.execute(
        select(Invite)
        .options(joinedload(Invite.team))
        .where(Invite.token == token)
    )
    return res.scalar_one_or_none()


async def accept_invite(db: AsyncSession, *, invite: Invite, user_id: uuid.UUID) -> Membership:
    invite.accepted_at = datetime.now(timezone.utc)

    existing = await db.execute(
        select(Membership)
        .where(Membership.user_id == user_id)
        .where(Membership.team_id == invite.team_id)
    )
    membership = existing.scalar_one_or_none()
    if membership:
        return membership

    membership = Membership(user_id=user_id, team_id=invite.team_id, role=invite.role)
    db.add(membership)
    await db.flush()
    return membership


async def revoke_invite(db: AsyncSession, *, invite: Invite) -> None:
    await db.delete(invite)
    await db.flush()
