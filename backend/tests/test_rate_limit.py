from __future__ import annotations

import asyncio
from collections import defaultdict

import pytest
from fastapi import HTTPException
from redis.exceptions import ConnectionError

from app.core.rate_limit import _RedisRateLimiter


class FakeRedis:
    def __init__(self) -> None:
        self.counts: dict[str, int] = defaultdict(int)

    async def eval(self, _script: str, _num_keys: int, key: str, *_args: object) -> int:
        self.counts[key] += 1
        return self.counts[key]


class BrokenRedis:
    async def eval(self, *_args: object) -> int:
        raise ConnectionError("redis unavailable")


def test_rate_limiter_rejects_request_over_budget() -> None:
    async def scenario() -> None:
        limiter = _RedisRateLimiter(FakeRedis())  # type: ignore[arg-type]
        await limiter.check("client", max_hits=2, window_seconds=60)
        await limiter.check("client", max_hits=2, window_seconds=60)
        with pytest.raises(HTTPException) as exc:
            await limiter.check("client", max_hits=2, window_seconds=60)
        assert exc.value.status_code == 429

    asyncio.run(scenario())


def test_rate_limiter_keeps_budgets_isolated() -> None:
    async def scenario() -> None:
        limiter = _RedisRateLimiter(FakeRedis())  # type: ignore[arg-type]
        await limiter.check("client-a", max_hits=1, window_seconds=60)
        await limiter.check("client-b", max_hits=1, window_seconds=60)

    asyncio.run(scenario())


def test_rate_limiter_fails_closed_when_redis_is_unavailable() -> None:
    async def scenario() -> None:
        limiter = _RedisRateLimiter(BrokenRedis())  # type: ignore[arg-type]
        with pytest.raises(HTTPException) as exc:
            await limiter.check("client", max_hits=1, window_seconds=60)
        assert exc.value.status_code == 503

    asyncio.run(scenario())
