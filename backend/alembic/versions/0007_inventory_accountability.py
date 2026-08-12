"""inventory accountability, reconciliation, and automation health

Revision ID: 0007_inventory_accountability
Revises: 0006_security_sessions
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_inventory_accountability"
down_revision = "0006_security_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inventory_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("registration_token_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_key", sa.String(length=160), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("source_type", sa.String(length=40), nullable=False),
        sa.Column("expected_interval_minutes", sa.Integer(), server_default="1440", nullable=False),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failure_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_summary", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["registration_token_id"], ["registration_tokens.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("team_id", "source_key", name="uq_inventory_sources_team_key"),
    )
    op.create_index("ix_inventory_sources_team_id", "inventory_sources", ["team_id"])

    op.create_table(
        "inventory_sync_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("registration_token_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("reconcile_missing", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("proposed_nodes", postgresql.JSONB(), nullable=False),
        sa.Column("changes", postgresql.JSONB(), nullable=False),
        sa.Column("summary", postgresql.JSONB(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["inventory_sources.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["registration_token_id"], ["registration_tokens.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_sync_runs_team_id", "inventory_sync_runs", ["team_id"])
    op.create_index("ix_inventory_sync_runs_source_id", "inventory_sync_runs", ["source_id"])

    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_type", sa.String(length=20), nullable=False),
        sa.Column("actor_label", sa.String(length=320), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("resource_type", sa.String(length=40), nullable=False),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resource_name", sa.String(length=320), nullable=True),
        sa.Column("before_data", postgresql.JSONB(), nullable=True),
        sa.Column("after_data", postgresql.JSONB(), nullable=True),
        sa.Column("context", postgresql.JSONB(), nullable=False),
        sa.Column("inventory_source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sync_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("team_id", "actor_user_id", "action", "resource_type", "resource_id", "created_at"):
        op.create_index(f"ix_audit_events_{column}", "audit_events", [column])

    op.add_column("nodes", sa.Column("inventory_source_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("nodes", sa.Column("external_id", sa.String(length=255), nullable=True))
    op.create_foreign_key(
        "fk_nodes_inventory_source_id", "nodes", "inventory_sources",
        ["inventory_source_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_nodes_inventory_source", "nodes", ["team_id", "inventory_source_id"])
    op.create_index(
        "uq_nodes_source_external_id", "nodes", ["inventory_source_id", "external_id"],
        unique=True, postgresql_where=sa.text("external_id is not null"),
    )
    op.add_column("registration_tokens", sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("registration_tokens", "last_used_at")
    op.drop_index("uq_nodes_source_external_id", table_name="nodes")
    op.drop_index("ix_nodes_inventory_source", table_name="nodes")
    op.drop_constraint("fk_nodes_inventory_source_id", "nodes", type_="foreignkey")
    op.drop_column("nodes", "external_id")
    op.drop_column("nodes", "inventory_source_id")
    for column in ("created_at", "resource_id", "resource_type", "action", "actor_user_id", "team_id"):
        op.drop_index(f"ix_audit_events_{column}", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_inventory_sync_runs_source_id", table_name="inventory_sync_runs")
    op.drop_index("ix_inventory_sync_runs_team_id", table_name="inventory_sync_runs")
    op.drop_table("inventory_sync_runs")
    op.drop_index("ix_inventory_sources_team_id", table_name="inventory_sources")
    op.drop_table("inventory_sources")
