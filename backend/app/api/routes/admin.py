from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_superuser
from app.db.session import get_db
from app.models.membership import Membership
from app.models.node import Node
from app.models.team import Team
from app.models.user import User
from app.schemas.admin import (
    AdminStats,
    AdminTeamBrief,
    AdminTeamRow,
    AdminUserRow,
    AdminUserUpdate,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStats)
async def admin_stats(
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> AdminStats:
    users = (await db.execute(select(func.count(User.id)))).scalar_one()
    teams = (await db.execute(select(func.count(Team.id)))).scalar_one()
    nodes = (await db.execute(select(func.count(Node.id)))).scalar_one()
    return AdminStats(total_users=users, total_teams=teams, total_nodes=nodes)


@router.get("/users", response_model=list[AdminUserRow])
async def admin_list_users(
    q: str = Query("", max_length=200),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> list[AdminUserRow]:
    stmt = select(User).options(selectinload(User.memberships).selectinload(Membership.team))

    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(User.email.ilike(pattern), User.full_name.ilike(pattern)))

    stmt = stmt.order_by(User.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    users = result.scalars().all()

    rows: list[AdminUserRow] = []
    for u in users:
        teams = [
            AdminTeamBrief(id=m.team.id, name=m.team.name, slug=m.team.slug, role=m.role)
            for m in u.memberships
        ]
        rows.append(
            AdminUserRow(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                is_active=u.is_active,
                is_superuser=u.is_superuser,
                created_at=u.created_at,
                teams=teams,
            )
        )
    return rows


@router.patch("/users/{user_id}", response_model=AdminUserRow)
async def admin_update_user(
    user_id: uuid.UUID,
    payload: AdminUserUpdate,
    su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> AdminUserRow:
    stmt = select(User).options(selectinload(User.memberships).selectinload(Membership.team)).where(User.id == user_id)
    result = await db.execute(stmt)
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if target.id == su.id:
        if payload.is_active is False:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate yourself")
        if payload.is_superuser is False:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove your own superuser status")

    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.is_superuser is not None:
        target.is_superuser = payload.is_superuser

    await db.commit()

    refreshed = await db.execute(
        select(User)
        .options(selectinload(User.memberships).selectinload(Membership.team))
        .where(User.id == user_id)
    )
    target = refreshed.scalar_one()

    teams = [
        AdminTeamBrief(id=m.team.id, name=m.team.name, slug=m.team.slug, role=m.role)
        for m in target.memberships
    ]
    return AdminUserRow(
        id=target.id,
        email=target.email,
        full_name=target.full_name,
        is_active=target.is_active,
        is_superuser=target.is_superuser,
        created_at=target.created_at,
        teams=teams,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def admin_delete_user(
    user_id: uuid.UUID,
    su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> Response:
    if user_id == su.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")

    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await db.delete(target)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/teams", response_model=list[AdminTeamRow])
async def admin_list_teams(
    q: str = Query("", max_length=200),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> list[AdminTeamRow]:
    member_count = func.count(Membership.id).label("member_count")
    node_count = (
        select(func.count(Node.id))
        .where(Node.team_id == Team.id)
        .correlate(Team)
        .scalar_subquery()
        .label("node_count")
    )

    stmt = (
        select(Team, member_count, node_count)
        .outerjoin(Membership, Membership.team_id == Team.id)
        .join(User, User.id == Team.created_by_id)
        .add_columns(User.email.label("owner_email"))
        .group_by(Team.id, User.email)
    )

    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(Team.name.ilike(pattern), Team.slug.ilike(pattern)))

    stmt = stmt.order_by(Team.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)

    rows: list[AdminTeamRow] = []
    for team, mc, nc, owner_email in result.all():
        rows.append(
            AdminTeamRow(
                id=team.id,
                name=team.name,
                slug=team.slug,
                owner_email=owner_email,
                member_count=mc,
                node_count=nc,
                created_at=team.created_at,
            )
        )
    return rows


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def admin_delete_team(
    team_id: uuid.UUID,
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> Response:
    result = await db.execute(select(Team).where(Team.id == team_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    await db.delete(target)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
