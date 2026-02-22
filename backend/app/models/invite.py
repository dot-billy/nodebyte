from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin, UUIDPrimaryKeyMixin


class Invite(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "invites"

    team_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    invited_email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    invited_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    team: Mapped["Team"] = relationship()
    invited_by: Mapped["User"] = relationship()

    @property
    def is_pending(self) -> bool:
        from datetime import timezone as tz
        return self.accepted_at is None and self.expires_at > datetime.now(tz.utc)

    @property
    def is_expired(self) -> bool:
        from datetime import timezone as tz
        return self.accepted_at is None and self.expires_at <= datetime.now(tz.utc)


from app.models.team import Team  # noqa: E402
from app.models.user import User  # noqa: E402
