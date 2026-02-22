from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.slug import slugify
from app.db.session import get_db
from app.models.team import Team
from app.models.user import User
from app.schemas.teams import TeamCreate, TeamPublic
from app.services.teams import create_team_with_owner, list_teams_for_user

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("", response_model=list[TeamPublic])
async def list_my_teams(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[dict]:
    from app.services.teams import list_teams_with_role_for_user
    teams = await list_teams_with_role_for_user(db, user_id=user.id)
    return [{"id": t.id, "name": t.name, "slug": t.slug, "created_at": t.created_at, "my_role": role} for t, role in teams]


@router.post("", response_model=TeamPublic, status_code=201)
async def create_team(
    payload: TeamCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Team:
    base_slug = slugify(payload.slug)
    slug = base_slug
    for i in range(1, 50):
        res = await db.execute(select(Team.id).where(Team.slug == slug))
        if res.first() is None:
            break
        slug = f"{base_slug}-{i+1}"
    else:
        raise HTTPException(status_code=500, detail="Could not allocate team slug")

    team = await create_team_with_owner(db, name=payload.name, slug=slug, owner_user_id=user.id)
    await db.commit()
    return team

