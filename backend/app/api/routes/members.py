from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.rbac import VALID_ROLES, has_role, require_role, role_level
from app.db.session import get_db
from app.models.user import User
from app.schemas.members import MemberPublic, MemberRoleUpdate
from app.services.audit import record_audit_event
from app.services.members import (
    get_membership,
    list_members,
    remove_member,
    update_member_role,
)

router = APIRouter(prefix="/teams/{team_id}/members", tags=["members"])


def _member_to_public(m) -> dict:
    return {
        "id": m.id,
        "user_id": m.user_id,
        "email": m.user.email,
        "full_name": m.user.full_name,
        "role": m.role,
        "joined_at": m.created_at,
    }


@router.get("", response_model=list[MemberPublic])
async def list_team_members(
    team_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    await require_role(db, user=user, team_id=team_id, min_role="viewer")
    members = await list_members(db, team_id=team_id)
    return [_member_to_public(m) for m in members]


@router.patch("/{membership_id}", response_model=MemberPublic)
async def change_member_role(
    team_id: uuid.UUID,
    membership_id: uuid.UUID,
    payload: MemberRoleUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    actor = await require_role(db, user=user, team_id=team_id, min_role="admin")

    if payload.role not in VALID_ROLES or payload.role == "owner":
        raise HTTPException(status_code=400, detail="Invalid role")

    target = await get_membership(db, membership_id=membership_id, team_id=team_id)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    if target.role == "owner":
        raise HTTPException(status_code=403, detail="Cannot change the owner's role")

    if not has_role(actor, "owner") and role_level(target.role) >= role_level(actor.role):
        raise HTTPException(status_code=403, detail="Cannot modify a member with equal or higher role")

    old_role = target.role
    target = await update_member_role(db, membership=target, role=payload.role)
    await record_audit_event(
        db, team_id=team_id, actor_type="user", actor_user_id=user.id,
        actor_label=user.email, action="membership.role_changed", resource_type="membership",
        resource_id=target.id, resource_name=target.user.email,
        before_data={"role": old_role}, after_data={"role": payload.role},
    )
    await db.commit()
    await db.refresh(target, ["user"])
    return _member_to_public(target)


@router.delete(
    "/{membership_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def remove_team_member(
    team_id: uuid.UUID,
    membership_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    actor = await require_role(db, user=user, team_id=team_id, min_role="admin")

    target = await get_membership(db, membership_id=membership_id, team_id=team_id)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    if target.role == "owner":
        raise HTTPException(status_code=403, detail="Cannot remove the team owner")

    if target.user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself. Leave the team instead.")

    if not has_role(actor, "owner") and role_level(target.role) >= role_level(actor.role):
        raise HTTPException(status_code=403, detail="Cannot remove a member with equal or higher role")

    member_email = target.user.email
    member_role = target.role
    member_user_id = target.user_id
    await remove_member(db, membership=target)
    await record_audit_event(
        db, team_id=team_id, actor_type="user", actor_user_id=user.id,
        actor_label=user.email, action="membership.removed", resource_type="membership",
        resource_id=target.id, resource_name=member_email,
        before_data={"role": member_role, "user_id": str(member_user_id)},
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
