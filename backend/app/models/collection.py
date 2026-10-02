from __future__ import annotations

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.common import TimestampMixin, UUIDPrimaryKeyMixin


class Collection(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "collections"

    team_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class CollectionNode(Base):
    __tablename__ = "collection_nodes"

    collection_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True)
    node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True, index=True)


class NodeLink(Base):
    __tablename__ = "node_links"
    __table_args__ = (CheckConstraint("left_node_id < right_node_id", name="ck_node_links_order"),)

    # Canonical ordering makes links undirected and prevents duplicate/self links.
    left_node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True)
    right_node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True, index=True)
