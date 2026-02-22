from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.node import Node
from app.models.registration_token import RegistrationToken

TOKEN_BYTES = 32


async def create_registration_token(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    label: str,
    created_by_id: uuid.UUID,
    max_uses: int | None = None,
    allowed_kinds: list[str] | None = None,
    expires_in_days: int | None = None,
) -> RegistrationToken:
    token = secrets.token_urlsafe(TOKEN_BYTES)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=expires_in_days)
        if expires_in_days
        else None
    )
    rt = RegistrationToken(
        team_id=team_id,
        label=label,
        token=token,
        created_by_id=created_by_id,
        max_uses=max_uses,
        allowed_kinds=allowed_kinds,
        expires_at=expires_at,
    )
    db.add(rt)
    await db.flush()
    return rt


async def list_registration_tokens(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
) -> list[RegistrationToken]:
    res = await db.execute(
        select(RegistrationToken)
        .options(joinedload(RegistrationToken.created_by))
        .where(RegistrationToken.team_id == team_id)
        .order_by(RegistrationToken.created_at.desc())
    )
    return list(res.scalars().unique().all())


async def get_registration_token_by_id(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    token_id: uuid.UUID,
) -> RegistrationToken | None:
    res = await db.execute(
        select(RegistrationToken)
        .where(RegistrationToken.team_id == team_id)
        .where(RegistrationToken.id == token_id)
    )
    return res.scalar_one_or_none()


async def get_registration_token_by_value(
    db: AsyncSession,
    *,
    token: str,
) -> RegistrationToken | None:
    res = await db.execute(
        select(RegistrationToken)
        .options(joinedload(RegistrationToken.team))
        .where(RegistrationToken.token == token)
    )
    return res.scalar_one_or_none()


async def revoke_registration_token(
    db: AsyncSession,
    *,
    rt: RegistrationToken,
) -> None:
    rt.is_active = False
    await db.flush()


async def register_node_with_token(
    db: AsyncSession,
    *,
    rt: RegistrationToken,
    data: dict,
) -> Node:
    node = Node(team_id=rt.team_id, **data)
    db.add(node)
    rt.use_count += 1
    await db.flush()
    return node
