import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from app.models.node import Node
from app.schemas.nodes import NodeCreate, NodeUpdate
from app.services.audit import node_snapshot
from app.services.nodes import update_node


@pytest.mark.parametrize("schema", [NodeCreate, NodeUpdate])
@pytest.mark.parametrize("field", ["document_created_at", "document_updated_at"])
def test_document_dates_require_timezone(schema, field):
    with pytest.raises(ValidationError):
        schema(name="Runbook", **{field: "2026-09-23T12:00:00"})
    payload = schema(name="Runbook", **{field: "2026-09-23T12:00:00-04:00"})
    assert getattr(payload, field).utcoffset().total_seconds() == -14400


def test_unrelated_updates_preserve_document_dates_and_explicit_null_clears_them():
    date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    node = Node(name="Runbook", document_created_at=date, document_updated_at=date)
    db = AsyncMock()
    asyncio.run(update_node(db, node=node, data=NodeUpdate(notes="New description").model_dump(exclude_unset=True)))
    assert node.document_created_at == date
    assert node.document_updated_at == date
    asyncio.run(update_node(db, node=node, data=NodeUpdate(document_updated_at=None).model_dump(exclude_unset=True)))
    assert node.document_updated_at is None
    assert node.document_created_at == date


def test_document_dates_are_audited_separately():
    date = datetime(2020, 1, 1, tzinfo=timezone.utc)
    node = Node(name="Runbook", document_created_at=date, document_updated_at=date)
    snapshot = node_snapshot(node)
    assert snapshot["document_created_at"] == str(date)
    assert snapshot["document_updated_at"] == str(date)
