from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ApiTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    expires_in_days: int | None = Field(default=90, ge=1, le=3650)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Token name cannot be blank")
        return value


class ApiTokenPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    token_prefix: str
    created_at: datetime
    expires_at: datetime | None
    last_used_at: datetime | None
    revoked_at: datetime | None
    is_active: bool


class ApiTokenCreated(ApiTokenPublic):
    token: str
