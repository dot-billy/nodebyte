from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status

from app.schemas.auth import LoginRequest


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
    # Prefer explicit single-IP headers from common proxies/CDNs.
    # (If you're behind a reverse proxy and it doesn't forward real client IPs,
    # request.client.host will be the proxy IP and you'll rate-limit everyone together.)
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit_register(request: Request) -> None:
    _limiter.check(f"register:{_client_ip(request)}", max_hits=5, window_seconds=3600)


def rate_limit_login(request: Request, payload: LoginRequest) -> None:
    """
    Login rate limiting.

    - Per-IP burst control to protect infrastructure
    - Per-IP+email limit to prevent one user (or attacker) on a shared IP
      from locking out everyone else
    """
    ip = _client_ip(request)
    email = str(payload.email).strip().lower()

    _limiter.check(f"login-ip:{ip}", max_hits=60, window_seconds=60)
    _limiter.check(f"login:{ip}:{email}", max_hits=10, window_seconds=60)
