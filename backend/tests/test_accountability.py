from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from app.models.audit_event import AuditEvent
from app.models.inventory_source import InventorySource
from app.schemas.accountability import InventorySyncPreviewRequest
from pydantic import ValidationError


def test_audit_event_is_append_only_by_shape() -> None:
    assert "updated_at" not in AuditEvent.__table__.columns
    assert "before_data" in AuditEvent.__table__.columns
    assert "after_data" in AuditEvent.__table__.columns


def test_inventory_source_health_states() -> None:
    source = InventorySource(
        source_key="docker:host", name="Docker host", source_type="docker",
        expected_interval_minutes=60,
    )
    assert source.health_status == "never"

    source.last_success_at = datetime.now(timezone.utc)
    assert source.health_status == "healthy"

    source.last_success_at = datetime.now(timezone.utc) - timedelta(hours=3)
    assert source.health_status == "stale"

    source.last_failure_at = datetime.now(timezone.utc)
    source.last_error = "collector failed"
    assert source.health_status == "failing"


def test_sync_preview_accepts_empty_authoritative_snapshot() -> None:
    payload = InventorySyncPreviewRequest(
        token="nb_reg_test", source_key="docker:host.example", source_name="Docker host",
        source_type="docker", nodes=[],
    )
    assert payload.reconcile_missing is True
    assert payload.nodes == []


def test_sync_preview_rejects_unsafe_source_key() -> None:
    with pytest.raises(ValidationError):
        InventorySyncPreviewRequest(
            token="nb_reg_test", source_key="../../other-team", source_name="bad",
            source_type="docker", nodes=[],
        )
