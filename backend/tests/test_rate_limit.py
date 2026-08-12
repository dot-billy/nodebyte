from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.core.rate_limit import _RateLimiter


def test_rate_limiter_rejects_request_over_budget() -> None:
    limiter = _RateLimiter()
    limiter.check("client", max_hits=2, window_seconds=60)
    limiter.check("client", max_hits=2, window_seconds=60)

    with pytest.raises(HTTPException) as exc:
        limiter.check("client", max_hits=2, window_seconds=60)

    assert exc.value.status_code == 429


def test_rate_limiter_keeps_budgets_isolated() -> None:
    limiter = _RateLimiter()
    limiter.check("client-a", max_hits=1, window_seconds=60)
    limiter.check("client-b", max_hits=1, window_seconds=60)
