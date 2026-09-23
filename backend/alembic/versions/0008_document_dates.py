"""Track remote document dates separately from inventory record timestamps."""

import sqlalchemy as sa
from alembic import op

revision = "0008_document_dates"
down_revision = "0007_inventory_accountability"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("nodes", sa.Column("document_created_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("nodes", sa.Column("document_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("nodes", "document_updated_at")
    op.drop_column("nodes", "document_created_at")
