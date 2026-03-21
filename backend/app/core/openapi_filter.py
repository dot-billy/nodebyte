"""
Role-aware OpenAPI schema filtering.

Generates a per-request OpenAPI schema that only exposes routes the caller
is authorised to see.  Admin routes are hidden from non-superusers; mutating
team routes are hidden from viewers; etc.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from jwt import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.models.membership import Membership
from app.models.user import User

VISIBILITY_LEVELS = {
    "public": 0,
    "authenticated": 1,
    "viewer": 2,
    "member": 3,
    "admin": 4,
    "superuser": 5,
}

_TEAM_ROLE_TO_LEVEL = {
    "viewer": VISIBILITY_LEVELS["viewer"],
    "member": VISIBILITY_LEVELS["member"],
    "admin": VISIBILITY_LEVELS["admin"],
    "owner": VISIBILITY_LEVELS["admin"],
}

_PUBLIC_ROUTES: set[tuple[str, str]] = {
    ("/api/auth/public-settings", "get"),
    ("/api/auth/register", "post"),
    ("/api/auth/login", "post"),
    ("/api/auth/refresh", "post"),
    ("/api/register-node", "post"),
    ("/healthz", "get"),
}


def _route_visibility(path: str, method: str, tags: list[str]) -> int:
    """Return the minimum visibility level required to see a route."""

    # Superuser-only: anything tagged or prefixed "admin"
    if "admin" in tags or path.startswith("/api/admin"):
        return VISIBILITY_LEVELS["superuser"]

    if (path, method) in _PUBLIC_ROUTES:
        return VISIBILITY_LEVELS["public"]

    # Invite peek is public
    if path == "/api/invites/{token}" and method == "get":
        return VISIBILITY_LEVELS["public"]

    # Auth routes are accessible to any logged-in user
    if path.startswith("/api/auth/"):
        return VISIBILITY_LEVELS["authenticated"]

    # Accept invite just needs auth
    if path == "/api/invites/{token}/accept":
        return VISIBILITY_LEVELS["authenticated"]

    # Team list / create
    if path in ("/api/teams", "/api/teams/"):
        return VISIBILITY_LEVELS["authenticated"]

    # Invite & registration-token management → admin
    if "/registration-tokens" in path or "/invites" in path:
        return VISIBILITY_LEVELS["admin"]

    # Member endpoints: read → viewer, write → admin
    if "/members" in path:
        return VISIBILITY_LEVELS["viewer"] if method == "get" else VISIBILITY_LEVELS["admin"]

    # Node endpoints: read → viewer, write → member
    if "/nodes" in path:
        return VISIBILITY_LEVELS["viewer"] if method == "get" else VISIBILITY_LEVELS["member"]

    return VISIBILITY_LEVELS["authenticated"]


# ------------------------------------------------------------------
# Resolve the calling user's level from the Authorization header
# ------------------------------------------------------------------

async def resolve_caller_level(
    authorization: str | None,
    db: AsyncSession,
) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        return VISIBILITY_LEVELS["public"]

    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decode_token(token)
        if payload.get("typ") != "access":
            return VISIBILITY_LEVELS["public"]
        user_id = uuid.UUID(payload["sub"])
    except (InvalidTokenError, KeyError, ValueError):
        return VISIBILITY_LEVELS["public"]

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        return VISIBILITY_LEVELS["public"]

    if user.is_superuser:
        return VISIBILITY_LEVELS["superuser"]

    result = await db.execute(
        select(Membership.role).where(Membership.user_id == user_id)
    )
    roles = [r for (r,) in result.all()]
    if not roles:
        return VISIBILITY_LEVELS["authenticated"]

    return max(_TEAM_ROLE_TO_LEVEL.get(r, VISIBILITY_LEVELS["authenticated"]) for r in roles)


# ------------------------------------------------------------------
# Schema filtering
# ------------------------------------------------------------------

def _collect_refs(obj: Any) -> set[str]:
    """Recursively collect all ``$ref`` strings from a JSON-like structure."""
    refs: set[str] = set()
    if isinstance(obj, dict):
        if "$ref" in obj:
            refs.add(obj["$ref"])
        for v in obj.values():
            refs.update(_collect_refs(v))
    elif isinstance(obj, list):
        for item in obj:
            refs.update(_collect_refs(item))
    return refs


def filter_openapi_schema(
    schema: dict[str, Any],
    caller_level: int,
) -> dict[str, Any]:
    """Return a copy of *schema* containing only routes the caller may see."""

    filtered_paths: dict[str, Any] = {}
    for path, methods in schema.get("paths", {}).items():
        kept: dict[str, Any] = {}
        for method, operation in methods.items():
            if method.startswith("x-"):
                kept[method] = operation
                continue
            tags = operation.get("tags", [])
            if caller_level >= _route_visibility(path, method, tags):
                kept[method] = operation
        if kept:
            filtered_paths[path] = kept

    out: dict[str, Any] = {**schema, "paths": filtered_paths}

    # Prune unreferenced schemas so the component list doesn't leak info
    components = schema.get("components", {})
    all_schemas = components.get("schemas", {})
    if all_schemas:
        all_refs = _collect_refs(filtered_paths)
        used: set[str] = set()
        pending = {
            m.group(1)
            for ref in all_refs
            if (m := re.match(r"#/components/schemas/(.+)", ref))
        }
        while pending:
            name = pending.pop()
            if name in used or name not in all_schemas:
                continue
            used.add(name)
            for ref in _collect_refs(all_schemas[name]):
                if (m := re.match(r"#/components/schemas/(.+)", ref)):
                    pending.add(m.group(1))
        out["components"] = {
            **components,
            "schemas": {k: v for k, v in all_schemas.items() if k in used},
        }

    # Prune unused tag descriptions
    if "tags" in out:
        used_tags: set[str] = set()
        for methods in filtered_paths.values():
            for method, op in methods.items():
                if not method.startswith("x-"):
                    used_tags.update(op.get("tags", []))
        out["tags"] = [t for t in schema["tags"] if t.get("name") in used_tags]

    return out
