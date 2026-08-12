from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin, UUIDPrimaryKeyMixin


class InventorySource(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "inventory_sources"
    __table_args__ = (UniqueConstraint("team_id", "source_key", name="uq_inventory_sources_team_key"),)

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    registration_token_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("registration_tokens.id", ondelete="SET NULL"), nullable=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    source_key: Mapped[str] = mapped_column(String(160), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    expected_interval_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1440, server_default=text("1440")
    )
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failure_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_summary: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))

    team: Mapped["Team"] = relationship()
    registration_token: Mapped["RegistrationToken | None"] = relationship()
    created_by: Mapped["User | None"] = relationship()

    @property
    def health_status(self) -> str:
        if self.last_failure_at and (not self.last_success_at or self.last_failure_at > self.last_success_at):
            return "failing"
        if not self.last_success_at:
            return "never"
        due = self.last_success_at + timedelta(minutes=max(self.expected_interval_minutes, 1) * 2)
        return "stale" if due < datetime.now(timezone.utc) else "healthy"


from app.models.registration_token import RegistrationToken  # noqa: E402
from app.models.team import Team  # noqa: E402
from app.models.user import User  # noqa: E402
