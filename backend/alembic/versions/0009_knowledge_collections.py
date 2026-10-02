"""Manually curated knowledge, optional collections, and resource links."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0009_knowledge_collections"
down_revision = "0008_document_dates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("nodes", sa.Column("summary", sa.Text(), nullable=True))
    op.add_column("nodes", sa.Column("source_name", sa.String(120), nullable=True))
    op.create_table(
        "collections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_collections_team_id", "collections", ["team_id"])
    op.create_table(
        "collection_nodes",
        sa.Column("collection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_collection_nodes_node_id", "collection_nodes", ["node_id"])
    op.create_table(
        "node_links",
        sa.Column("left_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("right_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("nodes.id", ondelete="CASCADE"), primary_key=True),
        sa.CheckConstraint("left_node_id < right_node_id", name="ck_node_links_order"),
    )
    op.create_index("ix_node_links_right_node_id", "node_links", ["right_node_id"])


def downgrade() -> None:
    op.drop_table("node_links")
    op.drop_table("collection_nodes")
    op.drop_table("collections")
    op.drop_column("nodes", "source_name")
    op.drop_column("nodes", "summary")
