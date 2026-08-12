from __future__ import annotations

import hashlib
import secrets


def hash_opaque_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_opaque_token(*, prefix: str, token_bytes: int = 32) -> tuple[str, str, str]:
    token = f"{prefix}{secrets.token_urlsafe(token_bytes)}"
    return token, hash_opaque_token(token), token[:16]
