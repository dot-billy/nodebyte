from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_session_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.api_tokens import ApiTokenCreate, ApiTokenCreated, ApiTokenPublic
from app.services.api_tokens import create_api_token, list_api_tokens, revoke_api_token
from app.services.audit import record_audit_event

router = APIRouter(prefix="/auth/api-tokens", tags=["auth"])


@router.get("", response_model=list[ApiTokenPublic])
async def list_tokens(
    user: User = Depends(get_current_session_user),
    db: AsyncSession = Depends(get_db),
) -> list[ApiTokenPublic]:
    return await list_api_tokens(db, user_id=user.id)


@router.post("", response_model=ApiTokenCreated, status_code=status.HTTP_201_CREATED)
async def create_token(
    payload: ApiTokenCreate,
    user: User = Depends(get_current_session_user),
    db: AsyncSession = Depends(get_db),
) -> ApiTokenCreated:
    api_token, raw_token = await create_api_token(
        db,
        user_id=user.id,
        name=payload.name,
        expires_in_days=payload.expires_in_days,
    )
    await record_audit_event(
        db, team_id=None, actor_type="user", actor_user_id=user.id,
        actor_label=user.email, action="api_token.created", resource_type="api_token",
        resource_id=api_token.id, resource_name=api_token.name,
        after_data={"name": api_token.name, "token_prefix": api_token.token_prefix,
                    "expires_at": str(api_token.expires_at) if api_token.expires_at else None},
    )
    await db.commit()
    await db.refresh(api_token)
    public = ApiTokenPublic.model_validate(api_token)
    return ApiTokenCreated(**public.model_dump(), token=raw_token)


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: uuid.UUID,
    user: User = Depends(get_current_session_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    api_token = await revoke_api_token(db, user_id=user.id, token_id=token_id)
    if api_token is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API token not found")
    await record_audit_event(
        db, team_id=None, actor_type="user", actor_user_id=user.id,
        actor_label=user.email, action="api_token.revoked", resource_type="api_token",
        resource_id=api_token.id, resource_name=api_token.name,
        before_data={"revoked_at": None},
        after_data={"revoked_at": str(api_token.revoked_at)},
    )
    await db.commit()
