"""security sessions, hashed opaque tokens, and node lifecycle

Revision ID: 0006_security_sessions
Revises: 0005_api_tokens
"""

from __future__ import annotations

import hashlib
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0006_security_sessions"
down_revision = "0005_api_tokens"
branch_labels = None
depends_on = None


def _hash_existing_tokens(table: str) -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text(f"select id, token from {table}")).all()
    for row_id, token in rows:
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        bind.execute(
            sa.text(
                f"update {table} set token_hash = :token_hash, token_prefix = :token_prefix "
                "where id = :row_id"
            ),
            {"token_hash": token_hash, "token_prefix": token[:16], "row_id": row_id},
        )


def upgrade() -> None:
    op.create_table(
        "refresh_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["replaced_by_id"], ["refresh_sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_refresh_sessions_user_id", "refresh_sessions", ["user_id"])
    op.create_index("ix_refresh_sessions_family_id", "refresh_sessions", ["family_id"])
    op.create_index("ix_refresh_sessions_token_hash", "refresh_sessions", ["token_hash"], unique=True)

    for table in ("invites", "registration_tokens"):
        op.add_column(table, sa.Column("token_hash", sa.String(length=64), nullable=True))
        op.add_column(table, sa.Column("token_prefix", sa.String(length=20), nullable=True))
        _hash_existing_tokens(table)

    op.drop_index("ix_invites_token", table_name="invites")
    op.drop_column("invites", "token")
    op.alter_column("invites", "token_hash", nullable=False)
    op.alter_column("invites", "token_prefix", nullable=False)
    op.create_index("ix_invites_token_hash", "invites", ["token_hash"], unique=True)

    op.drop_index("ix_registration_tokens_token", table_name="registration_tokens")
    op.drop_column("registration_tokens", "token")
    op.alter_column("registration_tokens", "token_hash", nullable=False)
    op.alter_column("registration_tokens", "token_prefix", nullable=False)
    op.create_index(
        "ix_registration_tokens_token_hash",
        "registration_tokens",
        ["token_hash"],
        unique=True,
    )

    op.add_column(
        "nodes",
        sa.Column("lifecycle_status", sa.String(length=20), server_default="active", nullable=False),
    )
    op.add_column("nodes", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("nodes", sa.Column("reviewed_by_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("nodes", sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_nodes_reviewed_by_id_users", "nodes", "users", ["reviewed_by_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "fk_nodes_owner_user_id_users", "nodes", "users", ["owner_user_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_nodes_lifecycle_status", "nodes", ["team_id", "lifecycle_status"])
    op.create_index("ix_nodes_last_seen_at", "nodes", ["team_id", "last_seen_at"])


def downgrade() -> None:
    op.drop_index("ix_nodes_last_seen_at", table_name="nodes")
    op.drop_index("ix_nodes_lifecycle_status", table_name="nodes")
    op.drop_constraint("fk_nodes_owner_user_id_users", "nodes", type_="foreignkey")
    op.drop_constraint("fk_nodes_reviewed_by_id_users", "nodes", type_="foreignkey")
    op.drop_column("nodes", "owner_user_id")
    op.drop_column("nodes", "reviewed_by_id")
    op.drop_column("nodes", "reviewed_at")
    op.drop_column("nodes", "lifecycle_status")

    for table, length in (("invites", 64), ("registration_tokens", 128)):
        op.add_column(table, sa.Column("token", sa.String(length=length), nullable=True))
        bind = op.get_bind()
        rows = bind.execute(sa.text(f"select id from {table}")).all()
        for (row_id,) in rows:
            bind.execute(
                sa.text(f"update {table} set token = :token where id = :row_id"),
                {"token": f"downgraded-{uuid.uuid4()}", "row_id": row_id},
            )
        op.alter_column(table, "token", nullable=False)
        op.create_index(f"ix_{table}_token", table, ["token"], unique=True)
        op.drop_index(f"ix_{table}_token_hash", table_name=table)
        op.drop_column(table, "token_prefix")
        op.drop_column(table, "token_hash")

    op.drop_index("ix_refresh_sessions_token_hash", table_name="refresh_sessions")
    op.drop_index("ix_refresh_sessions_family_id", table_name="refresh_sessions")
    op.drop_index("ix_refresh_sessions_user_id", table_name="refresh_sessions")
    op.drop_table("refresh_sessions")
