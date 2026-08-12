from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.registration_tokens import NodeRegisterItem


class AuditEventPublic(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID | None
    actor_user_id: uuid.UUID | None
    actor_type: str
    actor_label: str | None
    action: str
    resource_type: str
    resource_id: uuid.UUID | None
    resource_name: str | None
    before_data: dict | None
    after_data: dict | None
    context: dict
    inventory_source_id: uuid.UUID | None
    sync_run_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditEventPage(BaseModel):
    total: int
    events: list[AuditEventPublic]


class InventorySourcePublic(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    source_key: str
    name: str
    source_type: str
    expected_interval_minutes: int
    health_status: str
    last_attempt_at: datetime | None
    last_success_at: datetime | None
    last_failure_at: datetime | None
    last_error: str | None
    last_summary: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InventorySyncChange(BaseModel):
    action: str  # create|update|unchanged|missing
    node_id: uuid.UUID | None = None
    external_id: str | None = None
    name: str
    hostname: str | None = None
    changed_fields: list[str] = Field(default_factory=list)


class InventorySyncPreviewRequest(BaseModel):
    token: str
    source_key: str = Field(min_length=1, max_length=160, pattern=r"^[A-Za-z0-9._:-]+$")
    source_name: str = Field(min_length=1, max_length=200)
    source_type: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9._-]+$")
    expected_interval_minutes: int = Field(default=1440, ge=5, le=525600)
    reconcile_missing: bool = True
    nodes: list[NodeRegisterItem] = Field(max_length=1000)


class InventorySyncPreview(BaseModel):
    run_id: uuid.UUID
    source: InventorySourcePublic
    status: str
    expires_at: datetime
    reconcile_missing: bool
    summary: dict[str, int]
    changes: list[InventorySyncChange]


class InventorySyncApplyRequest(BaseModel):
    token: str
    retire_missing: bool = False


class InventorySyncHumanApplyRequest(BaseModel):
    retire_missing: bool = False


class InventorySyncApplyResponse(BaseModel):
    run_id: uuid.UUID
    status: str
    summary: dict[str, int]


class InventorySourcePage(BaseModel):
    sources: list[InventorySourcePublic]


class InventorySyncRunPublic(BaseModel):
    id: uuid.UUID
    source_id: uuid.UUID
    status: str
    reconcile_missing: bool
    summary: dict
    expires_at: datetime
    applied_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class InventorySyncRunDetail(InventorySyncRunPublic):
    source: InventorySourcePublic
    changes: list[InventorySyncChange]
