from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def _now() -> datetime:
    return datetime.now(UTC)


def create_access_token(*, user_id: uuid.UUID) -> str:
    now = _now()
    exp = now + timedelta(minutes=settings.access_token_expires_minutes)
    payload = {
        "iss": settings.jwt_issuer,
        "sub": str(user_id),
        "typ": "access",
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_refresh_token(*, user_id: uuid.UUID) -> str:
    now = _now()
    exp = now + timedelta(days=settings.refresh_token_expires_days)
    payload = {
        "iss": settings.jwt_issuer,
        "sub": str(user_id),
        "typ": "refresh",
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], issuer=settings.jwt_issuer)

