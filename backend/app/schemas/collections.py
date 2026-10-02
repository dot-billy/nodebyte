from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class CollectionWrite(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=20000)

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name cannot be blank")
        return value.strip()


class CollectionPublic(CollectionWrite):
    id: uuid.UUID
    team_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    resource_count: int = 0

    model_config = {"from_attributes": True}
