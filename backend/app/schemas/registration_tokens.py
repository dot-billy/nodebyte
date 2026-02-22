from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class RegistrationTokenCreate(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    max_uses: int | None = Field(default=None, ge=1)
    allowed_kinds: list[str] | None = None
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class RegistrationTokenPublic(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    label: str
    token: str
    created_by_email: str | None = None
    max_uses: int | None
    use_count: int
    allowed_kinds: list[str] | None
    expires_at: datetime | None
    is_active: bool
    is_usable: bool
    created_at: datetime


class NodeRegisterRequest(BaseModel):
    """Sent by a server/agent to self-register as a node."""
    token: str
    name: str = Field(min_length=1, max_length=200)
    kind: str = Field(default="device", max_length=30)
    hostname: str | None = Field(default=None, max_length=255)
    ip: str | None = Field(default=None, max_length=64)
    url: str | None = Field(default=None, max_length=2048)
    tags: list[str] = Field(default_factory=list)
    meta: dict = Field(default_factory=dict)
    notes: str | None = None
