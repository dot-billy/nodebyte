from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.rbac import require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.invites import InviteCreate, InviteInfo, InvitePublic
from app.services.invites import accept_invite, create_invite, get_invite_by_token, list_invites, revoke_invite

router = APIRouter(tags=["invites"])


def _invite_to_public(invite) -> dict:
    return {
        "id": invite.id,
        "team_id": invite.team_id,
        "invited_email": invite.invited_email,
        "role": invite.role,
        "token": invite.token,
        "invited_by_email": invite.invited_by.email if invite.invited_by else None,
        "created_at": invite.created_at,
        "expires_at": invite.expires_at,
    }


@router.post("/teams/{team_id}/invites", response_model=InvitePublic, status_code=201)
async def create_team_invite(
    team_id: uuid.UUID,
    payload: InviteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await require_role(db, user=user, team_id=team_id, min_role="admin")

    invite = await create_invite(
        db,
        team_id=team_id,
        invited_email=payload.email,
        role=payload.role,
        invited_by_id=user.id,
    )
    await db.commit()
    await db.refresh(invite, ["invited_by"])
    return _invite_to_public(invite)


@router.get("/teams/{team_id}/invites", response_model=list[InvitePublic])
async def list_team_invites(
    team_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    await require_role(db, user=user, team_id=team_id, min_role="admin")
    invites = await list_invites(db, team_id=team_id)
    return [_invite_to_public(i) for i in invites]


@router.delete(
    "/teams/{team_id}/invites/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def revoke_team_invite(
    team_id: uuid.UUID,
    invite_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await require_role(db, user=user, team_id=team_id, min_role="admin")
    from sqlalchemy import select
    from app.models.invite import Invite

    res = await db.execute(
        select(Invite).where(Invite.id == invite_id).where(Invite.team_id == team_id)
    )
    invite = res.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    await revoke_invite(db, invite=invite)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/invites/{token}", response_model=InviteInfo)
async def get_invite_info(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public endpoint — lets anyone peek at invite details before accepting."""
    invite = await get_invite_by_token(db, token=token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    await db.refresh(invite, ["invited_by"])
    now = datetime.now(timezone.utc)
    return {
        "team_name": invite.team.name,
        "team_slug": invite.team.slug,
        "invited_email": invite.invited_email,
        "role": invite.role,
        "invited_by_email": invite.invited_by.email if invite.invited_by else None,
        "expires_at": invite.expires_at,
        "expired": invite.expires_at <= now,
        "already_accepted": invite.accepted_at is not None,
    }


@router.post("/invites/{token}/accept")
async def accept_team_invite(
    token: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    invite = await get_invite_by_token(db, token=token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.accepted_at is not None:
        raise HTTPException(status_code=400, detail="Invite already accepted")

    now = datetime.now(timezone.utc)
    if invite.expires_at <= now:
        raise HTTPException(status_code=400, detail="Invite has expired")

    membership = await accept_invite(db, invite=invite, user_id=user.id)
    await db.commit()
    return {"message": "Invite accepted", "team_id": str(invite.team_id), "role": membership.role}
