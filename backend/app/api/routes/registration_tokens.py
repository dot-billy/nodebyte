from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.rbac import require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.registration_tokens import RegistrationTokenCreate, RegistrationTokenPublic
from app.services.registration_tokens import (
    create_registration_token,
    get_registration_token_by_id,
    list_registration_tokens,
    revoke_registration_token,
)

router = APIRouter(prefix="/teams/{team_id}/registration-tokens", tags=["registration-tokens"])


def _to_public(rt, created_by_email: str | None = None) -> dict:
    return {
        "id": rt.id,
        "team_id": rt.team_id,
        "label": rt.label,
        "token": rt.token,
        "created_by_email": created_by_email or (rt.created_by.email if rt.created_by else None),
        "max_uses": rt.max_uses,
        "use_count": rt.use_count,
        "allowed_kinds": rt.allowed_kinds,
        "expires_at": rt.expires_at,
        "is_active": rt.is_active,
        "is_usable": rt.is_usable,
        "created_at": rt.created_at,
    }


@router.post("", response_model=RegistrationTokenPublic, status_code=201)
async def create_token(
    team_id: uuid.UUID,
    payload: RegistrationTokenCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_role(db, user=user, team_id=team_id, min_role="admin")
    rt = await create_registration_token(
        db,
        team_id=team_id,
        label=payload.label,
        created_by_id=user.id,
        max_uses=payload.max_uses,
        allowed_kinds=payload.allowed_kinds,
        expires_in_days=payload.expires_in_days,
    )
    await db.commit()
    return _to_public(rt, created_by_email=user.email)


@router.get("", response_model=list[RegistrationTokenPublic])
async def list_tokens(
    team_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_role(db, user=user, team_id=team_id, min_role="admin")
    tokens = await list_registration_tokens(db, team_id=team_id)
    return [_to_public(t) for t in tokens]


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def revoke_token(
    team_id: uuid.UUID,
    token_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_role(db, user=user, team_id=team_id, min_role="admin")
    rt = await get_registration_token_by_id(db, team_id=team_id, token_id=token_id)
    if not rt:
        raise HTTPException(status_code=404, detail="Token not found")
    await revoke_registration_token(db, rt=rt)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
