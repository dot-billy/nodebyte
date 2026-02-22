from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin, UUIDPrimaryKeyMixin


class RegistrationToken(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "registration_tokens"

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    token: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)

    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    use_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))

    allowed_kinds: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)

    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))

    team: Mapped["Team"] = relationship()
    created_by: Mapped["User"] = relationship()

    @property
    def is_exhausted(self) -> bool:
        return self.max_uses is not None and self.use_count >= self.max_uses

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return self.expires_at <= datetime.now(timezone.utc)

    @property
    def is_usable(self) -> bool:
        return self.is_active and not self.is_exhausted and not self.is_expired


from app.models.team import Team  # noqa: E402
from app.models.user import User  # noqa: E402
