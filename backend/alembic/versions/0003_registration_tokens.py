"""registration_tokens

Revision ID: 0003
Revises: 0002
Create Date: 2026-02-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_registration_tokens"
down_revision = "0002_invites"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "registration_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("teams.id"), nullable=False, index=True),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("token", sa.String(128), nullable=False, unique=True, index=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("max_uses", sa.Integer, nullable=True),
        sa.Column("use_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("allowed_kinds", postgresql.JSONB, nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
    )


def downgrade() -> None:
    op.drop_table("registration_tokens")
