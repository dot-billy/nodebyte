from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status


class _RateLimiter:
    """Simple in-memory sliding-window rate limiter (no external deps)."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._hits: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str, max_hits: int, window_seconds: int) -> None:
        now = time.monotonic()
        cutoff = now - window_seconds

        with self._lock:
            timestamps = self._hits[key]
            self._hits[key] = [t for t in timestamps if t > cutoff]
            if len(self._hits[key]) >= max_hits:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please try again later.",
                )
            self._hits[key].append(now)


_limiter = _RateLimiter()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit_register(request: Request) -> None:
    _limiter.check(f"register:{_client_ip(request)}", max_hits=5, window_seconds=3600)


def rate_limit_login(request: Request) -> None:
    _limiter.check(f"login:{_client_ip(request)}", max_hits=10, window_seconds=60)
