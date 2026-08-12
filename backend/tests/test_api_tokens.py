from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.core.api_tokens import (
    API_TOKEN_PREFIX,
    api_token_preview,
    generate_api_token,
    hash_api_token,
)
from app.models.api_token import ApiToken


def test_generated_api_tokens_are_prefixed_high_entropy_and_unique() -> None:
    first = generate_api_token()
    second = generate_api_token()

    assert first.startswith(API_TOKEN_PREFIX)
    assert len(first) >= 48
    assert first != second
    assert api_token_preview(first) == first[:15]


def test_api_token_hash_is_deterministic_and_does_not_contain_secret() -> None:
    token = generate_api_token()
    digest = hash_api_token(token)

    assert digest == hash_api_token(token)
    assert len(digest) == 64
    assert token not in digest


def test_api_token_active_state_honors_expiry_and_revocation() -> None:
    token = ApiToken(
        name="test",
        token_hash="a" * 64,
        token_prefix="nb_pat_example",
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    assert token.is_active

    token.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    assert not token.is_active

    token.expires_at = None
    token.revoked_at = datetime.now(UTC)
    assert not token.is_active
