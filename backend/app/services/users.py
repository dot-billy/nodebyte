from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.user import User


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    res = await db.execute(select(User).where(User.email == email))
    return res.scalar_one_or_none()


async def get_user(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    res = await db.execute(select(User).where(User.id == user_id))
    return res.scalar_one_or_none()


async def create_user(db: AsyncSession, *, email: str, password: str, full_name: str | None) -> User:
    user = User(email=email, password_hash=hash_password(password), full_name=full_name)
    db.add(user)
    await db.flush()
    return user


async def authenticate(db: AsyncSession, *, email: str, password: str) -> User | None:
    user = await get_user_by_email(db, email)
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


async def update_user(
    db: AsyncSession,
    *,
    user: User,
    full_name: str | None = None,
    email: str | None = None,
    new_password: str | None = None,
) -> User:
    if full_name is not None:
        user.full_name = full_name
    if email is not None:
        user.email = email
    if new_password is not None:
        user.password_hash = hash_password(new_password)
    await db.flush()
    return user

