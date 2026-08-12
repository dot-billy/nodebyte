from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta

from jwt import InvalidTokenError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_refresh_token, decode_token
from app.models.refresh_session import RefreshSession


class RefreshSessionError(Exception):
    def __init__(self, message: str, *, reuse_detected: bool = False) -> None:
        super().__init__(message)
        self.reuse_detected = reuse_detected


def _token_hash(token: str) -> str:
    # Refresh JWTs are signed, high-entropy opaque credentials, not passwords.
    # codeql[py/weak-sensitive-data-hashing]
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _metadata(ip: str | None, user_agent: str | None) -> tuple[str | None, str | None]:
    return (ip[:64] if ip else None, user_agent[:500] if user_agent else None)


async def issue_refresh_session(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    ip: str | None,
    user_agent: str | None,
    family_id: uuid.UUID | None = None,
) -> tuple[RefreshSession, str]:
    now = datetime.now(UTC)
    session_id = uuid.uuid4()
    raw_token = create_refresh_token(user_id=user_id, session_id=session_id)
    created_ip, stored_user_agent = _metadata(ip, user_agent)
    session = RefreshSession(
        id=session_id,
        user_id=user_id,
        family_id=family_id or session_id,
        token_hash=_token_hash(raw_token),
        expires_at=now + timedelta(days=settings.refresh_token_expires_days),
        created_ip=created_ip,
        user_agent=stored_user_agent,
    )
    db.add(session)
    await db.flush()
    return session, raw_token


async def rotate_refresh_session(
    db: AsyncSession,
    *,
    raw_token: str,
    ip: str | None,
    user_agent: str | None,
) -> tuple[uuid.UUID, str]:
    try:
        payload = decode_token(raw_token)
        if payload.get("typ") != "refresh":
            raise RefreshSessionError("Invalid refresh token")
        session_id = uuid.UUID(payload["jti"])
        user_id = uuid.UUID(payload["sub"])
    except (InvalidTokenError, KeyError, ValueError) as exc:
        raise RefreshSessionError("Invalid refresh token") from exc

    result = await db.execute(
        select(RefreshSession)
        .where(RefreshSession.id == session_id)
        .with_for_update()
    )
    session = result.scalar_one_or_none()
    if not session or session.user_id != user_id or session.token_hash != _token_hash(raw_token):
        raise RefreshSessionError("Invalid refresh token")

    now = datetime.now(UTC)
    if session.expires_at <= now:
        session.revoked_at = session.revoked_at or now
        await db.flush()
        raise RefreshSessionError("Refresh token expired")

    if session.used_at or session.revoked_at or session.replaced_by_id:
        await db.execute(
            update(RefreshSession)
            .where(RefreshSession.family_id == session.family_id)
            .where(RefreshSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await db.flush()
        raise RefreshSessionError("Refresh token reuse detected", reuse_detected=True)

    successor, new_token = await issue_refresh_session(
        db,
        user_id=user_id,
        family_id=session.family_id,
        ip=ip,
        user_agent=user_agent,
    )
    session.used_at = now
    session.revoked_at = now
    session.replaced_by_id = successor.id
    await db.flush()
    return user_id, new_token


async def revoke_refresh_family(db: AsyncSession, *, raw_token: str) -> None:
    try:
        payload = decode_token(raw_token)
        session_id = uuid.UUID(payload["jti"])
    except (InvalidTokenError, KeyError, ValueError):
        return
    result = await db.execute(select(RefreshSession.family_id).where(RefreshSession.id == session_id))
    family_id = result.scalar_one_or_none()
    if family_id is None:
        return
    await db.execute(
        update(RefreshSession)
        .where(RefreshSession.family_id == family_id)
        .where(RefreshSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def revoke_all_refresh_sessions(db: AsyncSession, *, user_id: uuid.UUID) -> None:
    await db.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user_id)
        .where(RefreshSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
