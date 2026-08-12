from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_session_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.api_tokens import ApiTokenCreate, ApiTokenCreated, ApiTokenPublic
from app.services.api_tokens import create_api_token, list_api_tokens, revoke_api_token

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
    await db.commit()
