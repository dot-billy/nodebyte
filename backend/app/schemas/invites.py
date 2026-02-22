from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.core.rbac import VALID_ROLES


class InviteCreate(BaseModel):
    email: EmailStr
    role: str = Field(default="member")

    def model_post_init(self, __context: object) -> None:
        if self.role not in VALID_ROLES or self.role == "owner":
            raise ValueError(f"role must be one of: viewer, member, admin")


class InvitePublic(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    invited_email: str
    role: str
    token: str
    invited_by_email: str | None = None
    created_at: datetime
    expires_at: datetime

    model_config = {"from_attributes": True}


class InviteInfo(BaseModel):
    team_name: str
    team_slug: str
    invited_email: str
    role: str
    invited_by_email: str | None = None
    expires_at: datetime
    expired: bool
    already_accepted: bool
