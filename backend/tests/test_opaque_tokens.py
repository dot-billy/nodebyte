from __future__ import annotations

from app.core.opaque_tokens import generate_opaque_token, hash_opaque_token


def test_opaque_tokens_are_prefixed_unique_and_hash_only() -> None:
    first, first_hash, first_prefix = generate_opaque_token(prefix="nb_inv_")
    second, second_hash, _ = generate_opaque_token(prefix="nb_inv_")

    assert first.startswith("nb_inv_")
    assert len(first) >= 48
    assert first != second
    assert first_hash != second_hash
    assert first_hash == hash_opaque_token(first)
    assert first not in first_hash
    assert first_prefix == first[:16]
