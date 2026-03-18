from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jwt import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import rate_limit_login, rate_limit_register
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.core.slug import slugify
from app.core.turnstile import verify_turnstile
from app.db.session import get_db
from app.models.team import Team
from app.models.user import User
from app.core.security import verify_password
from app.schemas.auth import LoginRequest, MessageResponse, RefreshRequest, RegisterRequest, TokenResponse
from app.schemas.users import UserPublic, UserUpdate
from app.services.invites import accept_invite, get_invite_by_token
from app.services.teams import create_team_with_owner
from app.services.users import authenticate, create_user, get_user_by_email, update_user

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"


def _check_honeypot(value: str | None) -> None:
    """Reject if the invisible honeypot field was filled (only bots do this)."""
    if value:
        raise HTTPException(status_code=400, detail="Invalid request")


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.refresh_token_expires_days * 24 * 3600,
        path="/",
    )


@router.get("/public-settings")
async def public_settings() -> dict:
    return {"registration_enabled": settings.registration_enabled}


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    request: Request,
    payload: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_register),
) -> TokenResponse:
    _check_honeypot(payload.website)

    if not settings.registration_enabled and not payload.invite_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration is disabled. Contact your administrator for an invite.",
        )

    await verify_turnstile(payload.cf_turnstile_token, request.client.host if request.client else None)

    invite = None
    if payload.invite_token:
        invite = await get_invite_by_token(db, token=payload.invite_token)
        if not invite:
            raise HTTPException(status_code=400, detail="Invalid invite link")
        if invite.accepted_at is not None:
            raise HTTPException(status_code=400, detail="Invite already accepted")
        from datetime import datetime, timezone
        if invite.expires_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Invite has expired")

    email = invite.invited_email if invite else (payload.email or None)
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    existing = await get_user_by_email(db, email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = await create_user(db, email=email, password=payload.password, full_name=payload.full_name)

    if invite:
        await accept_invite(db, invite=invite, user_id=user.id)
    else:
        if not payload.team_name or len(payload.team_name.strip()) < 2:
            raise HTTPException(status_code=400, detail="Team name is required")
        base_slug = slugify(payload.team_name)
        slug = base_slug
        for i in range(1, 50):
            res = await db.execute(select(Team.id).where(Team.slug == slug))
            if res.first() is None:
                break
            slug = f"{base_slug}-{i+1}"
        else:
            raise HTTPException(status_code=500, detail="Could not allocate team slug")
        await create_team_with_owner(db, name=payload.team_name.strip(), slug=slug, owner_user_id=user.id)

    await db.commit()

    access = create_access_token(user_id=user.id)
    refresh = create_refresh_token(user_id=user.id)
    _set_refresh_cookie(response, refresh)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_login),
) -> TokenResponse:
    _check_honeypot(payload.website)
    origin = request.headers.get("origin", "")
    if not origin.startswith("chrome-extension://"):
        await verify_turnstile(payload.cf_turnstile_token, request.client.host if request.client else None)

    user = await authenticate(db, email=payload.email, password=payload.password)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email or password")

    access = create_access_token(user_id=user.id)
    refresh = create_refresh_token(user_id=user.id)
    _set_refresh_cookie(response, refresh)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    token = request.cookies.get(REFRESH_COOKIE_NAME) or (body and body.refresh_token)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")
    try:
        payload = decode_token(token)
        if payload.get("typ") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user_id = uuid.UUID(payload["sub"])
    except (InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access = create_access_token(user_id=user.id)
    new_refresh = create_refresh_token(user_id=user.id)
    _set_refresh_cookie(response, new_refresh)
    return TokenResponse(access_token=access, refresh_token=new_refresh)


@router.post("/logout", response_model=MessageResponse)
async def logout(response: Response) -> MessageResponse:
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/")
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)) -> UserPublic:
    return user


@router.patch("/me", response_model=UserPublic)
async def update_me(
    payload: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserPublic:
    needs_password = payload.email is not None or payload.new_password is not None
    if needs_password:
        if not payload.current_password:
            raise HTTPException(status_code=400, detail="Current password is required to change email or password")
        if not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")

    if payload.email is not None and payload.email != user.email:
        existing = await get_user_by_email(db, payload.email)
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")

    fields = payload.model_dump(exclude_unset=True, exclude={"current_password"})
    kwargs: dict = {}
    if "full_name" in fields:
        kwargs["full_name"] = fields["full_name"]
    if "email" in fields and fields["email"] != user.email:
        kwargs["email"] = fields["email"]
    if "new_password" in fields:
        kwargs["new_password"] = fields["new_password"]

    updated = await update_user(db, user=user, **kwargs)
    await db.commit()
    return updated

