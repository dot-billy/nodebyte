from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection import Collection


async def get_collection(db: AsyncSession, *, team_id: uuid.UUID, collection_id: uuid.UUID) -> Collection | None:
    return await db.scalar(select(Collection).where(Collection.id == collection_id, Collection.team_id == team_id))
