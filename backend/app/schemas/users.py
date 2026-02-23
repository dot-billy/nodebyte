from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserPublic(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    is_superuser: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    current_password: str | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=200)

