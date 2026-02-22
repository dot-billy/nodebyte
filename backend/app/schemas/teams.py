from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TeamCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str = Field(min_length=2, max_length=120)


class TeamPublic(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    created_at: datetime
    my_role: str | None = None

    model_config = {"from_attributes": True}

