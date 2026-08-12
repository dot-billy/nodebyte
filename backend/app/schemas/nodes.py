from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class NodeCreate(BaseModel):
    kind: str = Field(default="device", max_length=30)
    name: str = Field(min_length=1, max_length=200)
    hostname: str | None = Field(default=None, max_length=255)
    parent_node_id: uuid.UUID | None = None
    ip: str | None = Field(default=None, max_length=64)
    url: str | None = Field(default=None, max_length=2048)
    tags: list[str] = Field(default_factory=list)
    meta: dict = Field(default_factory=dict)
    notes: str | None = None


class NodeUpdate(BaseModel):
    kind: str | None = Field(default=None, max_length=30)
    name: str | None = Field(default=None, max_length=200)
    hostname: str | None = Field(default=None, max_length=255)
    parent_node_id: uuid.UUID | None = None
    ip: str | None = Field(default=None, max_length=64)
    url: str | None = Field(default=None, max_length=2048)
    tags: list[str] | None = None
    meta: dict | None = None
    notes: str | None = None
    last_seen_at: datetime | None = None
    last_seen_source: str | None = Field(default=None, max_length=100)


class NodePublic(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    parent_node_id: uuid.UUID | None
    kind: str
    name: str
    hostname: str | None
    ip: str | None
    url: str | None
    tags: list[str]
    meta: dict
    notes: str | None
    last_seen_at: datetime | None
    last_seen_source: str | None
    lifecycle_status: str
    reviewed_at: datetime | None
    reviewed_by_id: uuid.UUID | None
    reviewed_by_email: str | None = None
    owner_user_id: uuid.UUID | None
    owner_email: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BulkDeleteRequest(BaseModel):
    node_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


class BulkTagRequest(BaseModel):
    node_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    add: list[str] = Field(default_factory=list)
    remove: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _require_add_or_remove(self) -> "BulkTagRequest":
        if not self.add and not self.remove:
            raise ValueError("At least one of 'add' or 'remove' must be provided")
        return self


class BulkActionResponse(BaseModel):
    affected: int


class StaleReviewDecision(BaseModel):
    node_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    lifecycle_status: str
    owner_user_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _valid_status(self) -> "StaleReviewDecision":
        if self.lifecycle_status not in {"active", "ignored", "retired"}:
            raise ValueError("lifecycle_status must be active, ignored, or retired")
        return self


class StaleReviewSummary(BaseModel):
    stale_after_days: int
    pending: int
    ignored: int
    retired: int
    total_stale: int


class StaleReviewQueue(BaseModel):
    summary: StaleReviewSummary
    nodes: list[NodePublic]


class TagCount(BaseModel):
    tag: str
    count: int


class NodeLastSeenStats(BaseModel):
    last_24h: int
    last_7d: int
    last_30d: int
    never: int


class NodeStats(BaseModel):
    total: int
    by_kind: dict[str, int]
    last_seen: NodeLastSeenStats
    top_tags: list[TagCount]
    ip_segments: list["IpSegmentCount"] = Field(default_factory=list)
    ip_family_nodes: dict[str, int] = Field(default_factory=dict)


class IpSegmentCount(BaseModel):
    segment: str
    node_count: int
    address_count: int
