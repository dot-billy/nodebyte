from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_tokens import API_TOKEN_PREFIX
from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User
from app.services.api_tokens import get_api_token_user
from app.services.users import get_user

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str | None = Depends(oauth2_scheme),
) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if token.startswith(API_TOKEN_PREFIX):
        user = await get_api_token_user(db, token=token)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return user

    return await _get_session_user(db, token)


async def _get_session_user(db: AsyncSession, token: str) -> User:
    try:
        payload = decode_token(token)
        if payload.get("typ") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user_id = uuid.UUID(payload["sub"])
    except (InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await get_user(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def get_current_session_user(
    db: AsyncSession = Depends(get_db),
    token: str | None = Depends(oauth2_scheme),
) -> User:
    """Require a browser/native login token for security-sensitive token management."""
    if not token or token.startswith(API_TOKEN_PREFIX):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session authentication required")
    return await _get_session_user(db, token)


async def require_superuser(
    user: User = Depends(get_current_user),
) -> User:
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superuser access required")
    return user
