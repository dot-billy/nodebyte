from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin, UUIDPrimaryKeyMixin


class Node(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "nodes"

    team_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False, index=True)

    parent_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("nodes.id", ondelete="SET NULL"),
        nullable=True,
    )

    kind: Mapped[str] = mapped_column(
        String(30), nullable=False, default="device", server_default=text("'device'")
    )  # device|site|service|other
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    tags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_source: Mapped[str | None] = mapped_column(String(100), nullable=True)

    team: Mapped["Team"] = relationship(back_populates="nodes")
    parent: Mapped["Node | None"] = relationship(
        "Node",
        remote_side="Node.id",
        back_populates="children",
        foreign_keys=[parent_node_id],
    )
    children: Mapped[list["Node"]] = relationship(
        "Node",
        back_populates="parent",
        foreign_keys=[parent_node_id],
    )


from app.models.team import Team  # noqa: E402

