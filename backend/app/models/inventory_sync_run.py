from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin, UUIDPrimaryKeyMixin


class InventorySyncRun(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "inventory_sync_runs"

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    registration_token_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("registration_tokens.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="previewed")
    reconcile_missing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    proposed_nodes: Mapped[list] = mapped_column(JSONB, nullable=False)
    changes: Mapped[list] = mapped_column(JSONB, nullable=False)
    summary: Mapped[dict] = mapped_column(JSONB, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    source: Mapped["InventorySource"] = relationship()


from app.models.inventory_source import InventorySource  # noqa: E402
