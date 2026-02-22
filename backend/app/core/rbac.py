"""
Role-based access control.

Hierarchy (higher can do everything lower can):
  owner > admin > member > viewer

Usage in routes:
  membership = await require_role(db, user=user, team_id=team_id, min_role="member")
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.membership import Membership
from app.models.user import User
from app.services.teams import require_team_membership

ROLE_HIERARCHY: dict[str, int] = {
    "viewer": 0,
    "member": 1,
    "admin": 2,
    "owner": 3,
}

VALID_ROLES = set(ROLE_HIERARCHY.keys())


def role_level(role: str) -> int:
    return ROLE_HIERARCHY.get(role, -1)


def has_role(membership: Membership, min_role: str) -> bool:
    return role_level(membership.role) >= role_level(min_role)


async def require_role(
    db: AsyncSession,
    *,
    user: User,
    team_id: uuid.UUID,
    min_role: str = "viewer",
) -> Membership:
    membership = await require_team_membership(db, user_id=user.id, team_id=team_id)
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    if not has_role(membership, min_role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return membership
