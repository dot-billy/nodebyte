from __future__ import annotations

import hashlib
import secrets

API_TOKEN_PREFIX = "nb_pat_"  # nosec B105


def generate_api_token() -> str:
    """Generate a high-entropy personal API token for one-time display."""
    return f"{API_TOKEN_PREFIX}{secrets.token_urlsafe(32)}"


def hash_api_token(token: str) -> str:
    """Hash a generated 256-bit opaque token for equality lookup, not a password."""
    # codeql[py/weak-sensitive-data-hashing]
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def api_token_preview(token: str) -> str:
    """Return a non-secret prefix that helps a user identify a token."""
    return token[:15]
