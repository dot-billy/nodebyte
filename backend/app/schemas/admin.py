from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


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


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_superuser: bool | None = None


class AdminTeamRow(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    owner_email: str | None
    member_count: int
    node_count: int
    created_at: datetime
