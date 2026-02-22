from __future__ import annotations

import httpx
from fastapi import HTTPException

from app.core.config import settings

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(token: str | None, remote_ip: str | None = None) -> None:
    if not settings.turnstile_enabled:
        return

    if not token:
        raise HTTPException(status_code=400, detail="Bot verification required")

    payload: dict[str, str] = {
        "secret": settings.turnstile_secret_key,
        "response": token,
    }
    if remote_ip:
        payload["remoteip"] = remote_ip

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(VERIFY_URL, data=payload)

    result = resp.json()
    if not result.get("success"):
        raise HTTPException(status_code=400, detail="Bot verification failed")
