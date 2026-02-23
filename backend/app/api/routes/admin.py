from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_superuser
from app.core.security import hash_password
from app.core.slug import slugify
from app.db.session import get_db
from app.models.membership import Membership
from app.models.node import Node
from app.models.team import Team
from app.models.user import User
from app.schemas.admin import (
    AdminAddMember,
    AdminCreateTeam,
    AdminCreateUser,
    AdminMemberRow,
    AdminStats,
    AdminTeamBrief,
    AdminTeamDetail,
    AdminTeamRow,
    AdminTeamUpdate,
    AdminUpdateMemberRole,
    AdminUserRow,
    AdminUserUpdate,
)
from app.services.users import get_user_by_email

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _user_to_row(u: User) -> AdminUserRow:
    return AdminUserRow(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        is_active=u.is_active,
        is_superuser=u.is_superuser,
        created_at=u.created_at,
        teams=[
            AdminTeamBrief(id=m.team.id, name=m.team.name, slug=m.team.slug, role=m.role)
            for m in u.memberships
        ],
    )


async def _load_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    result = await db.execute(
        select(User)
        .options(selectinload(User.memberships).selectinload(Membership.team))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


async def _team_row(db: AsyncSession, team: Team) -> AdminTeamRow:
    mc = (await db.execute(
        select(func.count(Membership.id)).where(Membership.team_id == team.id)
    )).scalar_one()
    nc = (await db.execute(
        select(func.count(Node.id)).where(Node.team_id == team.id)
    )).scalar_one()
    owner = (await db.execute(select(User.email).where(User.id == team.created_by_id))).scalar_one_or_none()
    return AdminTeamRow(
        id=team.id, name=team.name, slug=team.slug,
        owner_email=owner, member_count=mc, node_count=nc, created_at=team.created_at,
    )


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=AdminStats)
async def admin_stats(
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> AdminStats:
    users = (await db.execute(select(func.count(User.id)))).scalar_one()
    teams = (await db.execute(select(func.count(Team.id)))).scalar_one()
    nodes = (await db.execute(select(func.count(Node.id)))).scalar_one()
    return AdminStats(total_users=users, total_teams=teams, total_nodes=nodes)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

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
    return [await _user_to_row(u) for u in result.scalars().all()]


@router.post("/users", response_model=AdminUserRow, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    payload: AdminCreateUser,
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> AdminUserRow:
    existing = await get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        is_superuser=payload.is_superuser,
    )
    db.add(user)
    await db.flush()
    await db.commit()

    user = await _load_user(db, user.id)
    return await _user_to_row(user)


@router.get("/users/{user_id}", response_model=AdminUserRow)
async def admin_get_user(
    user_id: uuid.UUID,
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> AdminUserRow:
    user = await _load_user(db, user_id)
    return await _user_to_row(user)


@router.patch("/users/{user_id}", response_model=AdminUserRow)
async def admin_update_user(
    user_id: uuid.UUID,
    payload: AdminUserUpdate,
    su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> AdminUserRow:
    target = await _load_user(db, user_id)

    if target.id == su.id:
        if payload.is_active is False:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate yourself")
        if payload.is_superuser is False:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove your own superuser status")

    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.is_superuser is not None:
        target.is_superuser = payload.is_superuser
    if payload.email is not None:
        dup = await get_user_by_email(db, payload.email)
        if dup and dup.id != target.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")
        target.email = payload.email
    if payload.full_name is not None:
        target.full_name = payload.full_name
    if payload.new_password is not None:
        target.password_hash = hash_password(payload.new_password)

    await db.commit()
    target = await _load_user(db, user_id)
    return await _user_to_row(target)


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


# ---------------------------------------------------------------------------
# Teams
# ---------------------------------------------------------------------------

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
    return [
        AdminTeamRow(id=t.id, name=t.name, slug=t.slug, owner_email=oe, member_count=mc, node_count=nc, created_at=t.created_at)
        for t, mc, nc, oe in result.all()
    ]


@router.post("/teams", response_model=AdminTeamRow, status_code=status.HTTP_201_CREATED)
async def admin_create_team(
    payload: AdminCreateTeam,
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> AdminTeamRow:
    owner = (await db.execute(select(User).where(User.id == payload.owner_user_id))).scalar_one_or_none()
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Owner user not found")

    slug = slugify(payload.name)
    existing_slug = (await db.execute(select(Team.id).where(Team.slug == slug))).first()
    if existing_slug:
        slug = f"{slug}-{owner.id.hex[:6]}"

    team = Team(name=payload.name, slug=slug, created_by_id=owner.id)
    db.add(team)
    await db.flush()

    membership = Membership(user_id=owner.id, team_id=team.id, role="owner")
    db.add(membership)
    await db.commit()

    return await _team_row(db, team)


@router.get("/teams/{team_id}", response_model=AdminTeamDetail)
async def admin_get_team(
    team_id: uuid.UUID,
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> AdminTeamDetail:
    team = (await db.execute(select(Team).where(Team.id == team_id))).scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    row = await _team_row(db, team)

    members_result = await db.execute(
        select(Membership)
        .options(selectinload(Membership.user))
        .where(Membership.team_id == team_id)
        .order_by(Membership.created_at)
    )
    members = [
        AdminMemberRow(
            id=m.id, user_id=m.user_id, email=m.user.email,
            full_name=m.user.full_name, role=m.role, joined_at=m.created_at,
        )
        for m in members_result.scalars().all()
    ]

    return AdminTeamDetail(**row.model_dump(), members=members)


@router.patch("/teams/{team_id}", response_model=AdminTeamRow)
async def admin_update_team(
    team_id: uuid.UUID,
    payload: AdminTeamUpdate,
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> AdminTeamRow:
    team = (await db.execute(select(Team).where(Team.id == team_id))).scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if payload.name is not None:
        team.name = payload.name
    if payload.slug is not None:
        dup = (await db.execute(select(Team.id).where(Team.slug == payload.slug, Team.id != team_id))).first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already in use")
        team.slug = payload.slug

    await db.commit()
    await db.refresh(team)
    return await _team_row(db, team)


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


# ---------------------------------------------------------------------------
# Team members
# ---------------------------------------------------------------------------

@router.post("/teams/{team_id}/members", response_model=AdminMemberRow, status_code=status.HTTP_201_CREATED)
async def admin_add_member(
    team_id: uuid.UUID,
    payload: AdminAddMember,
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> AdminMemberRow:
    team = (await db.execute(select(Team).where(Team.id == team_id))).scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    user = await get_user_by_email(db, payload.email)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = (await db.execute(
        select(Membership).where(Membership.user_id == user.id, Membership.team_id == team_id)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member of this team")

    membership = Membership(user_id=user.id, team_id=team_id, role=payload.role)
    db.add(membership)
    await db.commit()
    await db.refresh(membership)

    return AdminMemberRow(
        id=membership.id, user_id=user.id, email=user.email,
        full_name=user.full_name, role=membership.role, joined_at=membership.created_at,
    )


@router.patch("/teams/{team_id}/members/{membership_id}", response_model=AdminMemberRow)
async def admin_update_member(
    team_id: uuid.UUID,
    membership_id: uuid.UUID,
    payload: AdminUpdateMemberRole,
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> AdminMemberRow:
    result = await db.execute(
        select(Membership)
        .options(selectinload(Membership.user))
        .where(Membership.id == membership_id, Membership.team_id == team_id)
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")

    membership.role = payload.role
    await db.commit()
    await db.refresh(membership)

    return AdminMemberRow(
        id=membership.id, user_id=membership.user_id, email=membership.user.email,
        full_name=membership.user.full_name, role=membership.role, joined_at=membership.created_at,
    )


@router.delete("/teams/{team_id}/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def admin_remove_member(
    team_id: uuid.UUID,
    membership_id: uuid.UUID,
    _su: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
) -> Response:
    result = await db.execute(
        select(Membership).where(Membership.id == membership_id, Membership.team_id == team_id)
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")
    await db.delete(membership)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
