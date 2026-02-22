from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class MemberPublic(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    full_name: str | None
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class MemberRoleUpdate(BaseModel):
    role: str = Field(min_length=1)
