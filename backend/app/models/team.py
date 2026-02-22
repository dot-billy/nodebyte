from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin, UUIDPrimaryKeyMixin


class Team(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "teams"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)

    created_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_by: Mapped["User"] = relationship()

    memberships: Mapped[list["Membership"]] = relationship(back_populates="team", cascade="all, delete-orphan")
    nodes: Mapped[list["Node"]] = relationship(back_populates="team", cascade="all, delete-orphan")


from app.models.membership import Membership  # noqa: E402
from app.models.node import Node  # noqa: E402
from app.models.user import User  # noqa: E402

