from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class AdminStats(BaseModel):
    total_users: int
    total_teams: int
    total_nodes: int


class AdminTeamBrief(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    role: str

    model_config = {"from_attributes": True}


class AdminUserRow(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    is_active: bool
    is_superuser: bool
    created_at: datetime
    teams: list[AdminTeamBrief]

    model_config = {"from_attributes": True}


class AdminCreateUser(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    full_name: str | None = Field(default=None, max_length=200)
    is_superuser: bool = False


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_superuser: bool | None = None
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, max_length=200)
    new_password: str | None = Field(default=None, min_length=8, max_length=200)


class AdminTeamRow(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    owner_email: str | None
    member_count: int
    node_count: int
    created_at: datetime


class AdminCreateTeam(BaseModel):
    name: str = Field(max_length=120)
    owner_user_id: uuid.UUID


class AdminTeamUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    slug: str | None = Field(default=None, max_length=120)


class AdminMemberRow(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: EmailStr
    full_name: str | None
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class AdminTeamDetail(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    owner_email: str | None
    member_count: int
    node_count: int
    created_at: datetime
    members: list[AdminMemberRow]


class AdminAddMember(BaseModel):
    email: EmailStr
    role: str = Field(default="member", pattern=r"^(owner|admin|member|viewer)$")


class AdminUpdateMemberRole(BaseModel):
    role: str = Field(pattern=r"^(owner|admin|member|viewer)$")
