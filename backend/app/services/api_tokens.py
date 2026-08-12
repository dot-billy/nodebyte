from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.api_tokens import api_token_preview, generate_api_token, hash_api_token
from app.models.api_token import ApiToken


async def create_api_token(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    name: str,
    expires_in_days: int | None,
) -> tuple[ApiToken, str]:
    raw_token = generate_api_token()
    expires_at = (
        datetime.now(UTC) + timedelta(days=expires_in_days)
        if expires_in_days is not None
        else None
    )
    api_token = ApiToken(
        user_id=user_id,
        name=name.strip(),
        token_hash=hash_api_token(raw_token),
        token_prefix=api_token_preview(raw_token),
        expires_at=expires_at,
    )
    db.add(api_token)
    await db.flush()
    return api_token, raw_token


async def list_api_tokens(db: AsyncSession, *, user_id: uuid.UUID) -> list[ApiToken]:
    result = await db.execute(
        select(ApiToken)
        .where(ApiToken.user_id == user_id)
        .order_by(ApiToken.created_at.desc())
    )
    return list(result.scalars().all())


async def revoke_api_token(
    db: AsyncSession, *, user_id: uuid.UUID, token_id: uuid.UUID
) -> ApiToken | None:
    result = await db.execute(
        select(ApiToken).where(ApiToken.id == token_id, ApiToken.user_id == user_id)
    )
    api_token = result.scalar_one_or_none()
    if api_token is None:
        return None
    if api_token.revoked_at is None:
        api_token.revoked_at = datetime.now(UTC)
        await db.flush()
    return api_token


async def revoke_all_api_tokens(db: AsyncSession, *, user_id: uuid.UUID) -> None:
    tokens = await list_api_tokens(db, user_id=user_id)
    now = datetime.now(UTC)
    for api_token in tokens:
        if api_token.revoked_at is None:
            api_token.revoked_at = now
    await db.flush()


async def get_api_token_user(db: AsyncSession, *, token: str):
    result = await db.execute(
        select(ApiToken)
        .options(joinedload(ApiToken.user))
        .where(ApiToken.token_hash == hash_api_token(token))
    )
    api_token = result.scalar_one_or_none()
    if api_token is None or not api_token.is_active or not api_token.user.is_active:
        return None

    now = datetime.now(UTC)
    if api_token.last_used_at is None or api_token.last_used_at < now - timedelta(minutes=15):
        api_token.last_used_at = now
        await db.commit()
    return api_token.user
