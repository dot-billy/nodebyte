"""add node parent relationship

Revision ID: 0004_node_parent
Revises: 0003_registration_tokens
Create Date: 2026-02-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_node_parent"
down_revision = "0003_registration_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "nodes",
        sa.Column("parent_node_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_nodes_parent_node_id_nodes",
        "nodes",
        "nodes",
        ["parent_node_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_nodes_team_id_parent_node_id",
        "nodes",
        ["team_id", "parent_node_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_nodes_team_id_parent_node_id", table_name="nodes")
    op.drop_constraint("fk_nodes_parent_node_id_nodes", "nodes", type_="foreignkey")
    op.drop_column("nodes", "parent_node_id")

