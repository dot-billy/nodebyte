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


def _merge_unique_strs(existing: list[str] | None, incoming: list[str] | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for val in (existing or []) + (incoming or []):
        if not val:
            continue
        if val in seen:
            continue
        seen.add(val)
        out.append(val)
    return out


async def _find_existing_node_for_registration(db: AsyncSession, *, team_id: uuid.UUID, data: dict) -> Node | None:
    hostname = data.get("hostname")
    if hostname:
        res = await db.execute(
            select(Node).where(Node.team_id == team_id).where(Node.hostname == hostname)
        )
        node = res.scalar_one_or_none()
        if node:
            return node

    name = data.get("name")
    if name:
        res = await db.execute(select(Node).where(Node.team_id == team_id).where(Node.name == name))
        return res.scalar_one_or_none()

    return None


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


async def register_or_update_node_with_token(
    db: AsyncSession,
    *,
    rt: RegistrationToken,
    data: dict,
    allow_create: bool = True,
) -> tuple[Node | None, bool]:
    """
    Idempotent self-registration.

    If a node already exists for this team (matched by hostname when present, else by name),
    update it instead of creating a duplicate.

    Returns: (node, created)
      - node is None only when allow_create=False and no existing node matched.
    """
    existing = await _find_existing_node_for_registration(db, team_id=rt.team_id, data=data)
    now = datetime.now(timezone.utc)

    if existing:
        # Update the existing node in-place.
        existing.name = data.get("name", existing.name)
        existing.kind = data.get("kind", existing.kind)
        existing.hostname = data.get("hostname", existing.hostname)
        existing.ip = data.get("ip", existing.ip)
        existing.url = data.get("url", existing.url)
        existing.notes = data.get("notes", existing.notes)
        existing.tags = _merge_unique_strs(existing.tags, data.get("tags"))
        existing.meta = {**(existing.meta or {}), **(data.get("meta") or {})}
        existing.last_seen_at = now
        existing.last_seen_source = "register-node"
        await db.flush()
        return existing, False

    if not allow_create:
        return None, False

    node = Node(team_id=rt.team_id, **data)
    node.last_seen_at = now
    node.last_seen_source = "register-node"
    db.add(node)
    rt.use_count += 1
    await db.flush()
    return node, True
