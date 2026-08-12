from __future__ import annotations

import ipaddress
import secrets
from functools import lru_cache

from fastapi import HTTPException, Request, status
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.schemas.auth import LoginRequest


_SLIDING_WINDOW_SCRIPT = """
local current = redis.call('TIME')
local now_ms = (tonumber(current[1]) * 1000) + math.floor(tonumber(current[2]) / 1000)
local cutoff = now_ms - tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, cutoff)
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[1]) then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return count + 1
end
redis.call('ZADD', KEYS[1], now_ms, ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return count + 1
"""


@lru_cache(maxsize=1)
def get_rate_limit_redis() -> Redis:
    return Redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)


class _RedisRateLimiter:
    def __init__(self, redis: Redis | None = None) -> None:
        self._redis = redis

    async def check(self, key: str, max_hits: int, window_seconds: int) -> None:
        redis = self._redis or get_rate_limit_redis()
        try:
            count = await redis.eval(
                _SLIDING_WINDOW_SCRIPT,
                1,
                f"nodebyte:rate-limit:{key}",
                max_hits,
                window_seconds * 1000,
                secrets.token_urlsafe(18),
            )
        except RedisError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Request protection is temporarily unavailable",
            ) from exc
        if int(count) > max_hits:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
            )


_limiter = _RedisRateLimiter()


@lru_cache(maxsize=1)
def _trusted_networks() -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    return [ipaddress.ip_network(cidr, strict=False) for cidr in settings.trusted_proxy_cidrs]


def _is_trusted_proxy(host: str) -> bool:
    networks = _trusted_networks()
    if not networks:
        return False
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(addr in net for net in networks)


def client_ip(request: Request) -> str:
    direct_ip = request.client.host if request.client else "unknown"
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


async def rate_limit_register(request: Request) -> None:
    await _limiter.check(f"register:{client_ip(request)}", max_hits=5, window_seconds=3600)


async def rate_limit_login(request: Request, payload: LoginRequest) -> None:
    ip = client_ip(request)
    email = str(payload.email).strip().lower()
    await _limiter.check(f"login-ip:{ip}", max_hits=60, window_seconds=60)
    await _limiter.check(f"login:{ip}:{email}", max_hits=10, window_seconds=60)


async def rate_limit_register_node(request: Request) -> None:
    await _limiter.check(f"register-node:{client_ip(request)}", max_hits=30, window_seconds=60)


async def rate_limit_register_nodes_batch(request: Request) -> None:
    await _limiter.check(f"register-nodes:{client_ip(request)}", max_hits=6, window_seconds=60)
