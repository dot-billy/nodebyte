from __future__ import annotations

import ipaddress
import time
from collections import defaultdict
from functools import lru_cache
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


@lru_cache(maxsize=1)
def _trusted_networks() -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    from app.core.config import settings

    return [ipaddress.ip_network(cidr, strict=False) for cidr in settings.trusted_proxy_cidrs]


def _is_trusted_proxy(host: str) -> bool:
    """Check if the direct-connection IP is a trusted reverse proxy."""
    networks = _trusted_networks()
    if not networks:
        return False
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(addr in net for net in networks)


def _client_ip(request: Request) -> str:
    direct_ip = request.client.host if request.client else "unknown"

    # Only trust forwarded headers when the request comes from a known proxy.
    if not _is_trusted_proxy(direct_ip):
        return direct_ip

    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()

    return direct_ip


def rate_limit_register(request: Request) -> None:
    _limiter.check(f"register:{_client_ip(request)}", max_hits=5, window_seconds=3600)


def rate_limit_register_node(request: Request) -> None:
    ip = _client_ip(request)
    _limiter.check(f"regnode-ip:{ip}", max_hits=30, window_seconds=60)


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
