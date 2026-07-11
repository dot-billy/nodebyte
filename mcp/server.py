"""Nodebyte MCP server.

A FastMCP streamable-HTTP server that lets Claude add, upload, and search nodes
in a Nodebyte digital-inventory instance. It authenticates to the Nodebyte REST
API with a service account (email + password), caches the access token, and
re-logs-in transparently when the token expires.

Env:
  NODEBYTE_BASE_URL   base URL of the Nodebyte backend, e.g.
                      http://backend.nodebyte.svc.cluster.local:8000 (default)
  NODEBYTE_EMAIL      service-account email (required)
  NODEBYTE_PASSWORD   service-account password (required)
  NODEBYTE_TEAM_ID    optional default team id; if unset, the account's first
                      team is used
  MCP_TOKEN           inbound bearer gate for Claude -> this server (required;
                      the server refuses to start without it)
  MCP_HOST            listen address (default 127.0.0.1)
  PORT                listen port (default 8080)
  MCP_ALLOWED_HOSTS   comma-separated Host header allowlist for DNS-rebinding
                      protection (default "127.0.0.1:*,localhost:*"; set this
                      when serving on a non-localhost hostname)
  MCP_ALLOWED_ORIGINS comma-separated Origin header allowlist (default empty:
                      requests without an Origin header pass, cross-origin
                      browser requests are rejected)
"""

import os
import secrets
from typing import Any

import httpx
import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse

NODEBYTE_BASE_URL = os.environ.get(
    "NODEBYTE_BASE_URL", "http://backend.nodebyte.svc.cluster.local:8000"
).rstrip("/")
NODEBYTE_EMAIL = os.environ["NODEBYTE_EMAIL"]
NODEBYTE_PASSWORD = os.environ["NODEBYTE_PASSWORD"]
NODEBYTE_TEAM_ID = os.environ.get("NODEBYTE_TEAM_ID") or None
MCP_TOKEN = os.environ.get("MCP_TOKEN", "")
if not MCP_TOKEN:
    raise SystemExit(
        "MCP_TOKEN is not set (or empty). It is the inbound auth gate for this "
        "server; refusing to start unauthenticated. Set MCP_TOKEN to a strong secret."
    )
MCP_HOST = os.environ.get("MCP_HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))
MCP_ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("MCP_ALLOWED_HOSTS", "127.0.0.1:*,localhost:*").split(",")
    if h.strip()
]
MCP_ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("MCP_ALLOWED_ORIGINS", "").split(",") if o.strip()
]

INSTRUCTIONS = """\
Tools for a Nodebyte digital-inventory instance (the deployment at NODEBYTE_BASE_URL).
Nodebyte tracks the devices, sites, and services an IT team depends on. Each entry is
a "node" with a name, a kind, and optional hostname / ip / url / tags / notes.

Adding inventory:
  - Use add_node for a single device/site/service, or add_nodes to upload many at once.
  - kind is one of device | site | service | other (free text is also accepted).
  - name is the only required field. Provide hostname and/or ip and/or url when known.
  - add_node/add_nodes upsert by default: if a node with the same hostname (or, when no
    hostname is given, the same name) already exists in the team, it is updated in place
    instead of duplicated. Pass upsert=false to always create a new node.

Finding inventory:
  - search_nodes does a case-insensitive substring match across name, hostname, ip and
    url at once (the q argument), and can filter by kind/tags/has_url.
  - node_stats returns totals plus the kinds and tags currently in use (use it to
    discover which tags/kinds exist before searching or tagging).

Teams: nodes live in a team. Every tool takes an optional team_id; when omitted the
service account's first (or configured default) team is used. list_teams shows them.
"""

_security = TransportSecuritySettings(
    enable_dns_rebinding_protection=True,
    allowed_hosts=MCP_ALLOWED_HOSTS,
    allowed_origins=MCP_ALLOWED_ORIGINS,
)
mcp = FastMCP(
    "nodebyte",
    instructions=INSTRUCTIONS,
    host=MCP_HOST,
    port=PORT,
    transport_security=_security,
)

# Nodebyte skips Cloudflare Turnstile on login when the User-Agent starts with
# "NodebyteApp/", so this client authenticates even if Turnstile is enabled.
_client = httpx.AsyncClient(
    base_url=NODEBYTE_BASE_URL,
    headers={"User-Agent": "NodebyteApp/1.0"},
    timeout=30.0,
)

_access_token: str | None = None
_default_team_id: str | None = NODEBYTE_TEAM_ID


async def _login() -> str:
    global _access_token
    resp = await _client.post(
        "/api/auth/login",
        json={"email": NODEBYTE_EMAIL, "password": NODEBYTE_PASSWORD},
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"nodebyte login failed -> {resp.status_code}: {resp.text[:300]}")
    _access_token = resp.json()["access_token"]
    return _access_token


async def _req(method: str, path: str, *, params: dict | None = None, json: Any = None) -> Any:
    """Call the Nodebyte API with the cached bearer, re-logging-in once on 401."""
    global _access_token
    if _access_token is None:
        await _login()
    for attempt in (1, 2):
        headers = {"Authorization": f"Bearer {_access_token}"}
        resp = await _client.request(method, path, params=params, json=json, headers=headers)
        if resp.status_code == 401 and attempt == 1:
            await _login()
            continue
        if resp.status_code >= 400:
            raise RuntimeError(f"nodebyte {method} {path} -> {resp.status_code}: {resp.text[:500]}")
        if resp.status_code == 204:
            return None
        if resp.headers.get("content-type", "").startswith("application/json"):
            return resp.json()
        return resp.text
    raise RuntimeError(f"nodebyte {method} {path} -> unauthorized after re-login")


async def _resolve_team(team_id: str | None) -> str:
    global _default_team_id
    if team_id:
        return team_id
    if _default_team_id:
        return _default_team_id
    teams = await _req("GET", "/api/teams")
    if not teams:
        raise RuntimeError("service account belongs to no teams; create one in Nodebyte first")
    _default_team_id = teams[0]["id"]
    return _default_team_id


def _node_body(fields: dict) -> dict:
    body: dict = {}
    for key, value in fields.items():
        if value is None:
            continue
        body[key] = value
    return body


async def _find_node(team_id: str, hostname: str | None, name: str) -> dict | None:
    """Return an existing node matched by hostname (preferred) else exact name, or None."""
    query = hostname or name
    matches = await _req(
        "GET", f"/api/teams/{team_id}/nodes", params={"q": query, "limit": 200}
    )
    for node in matches:
        if hostname:
            if node.get("hostname") == hostname:
                return node
        elif node.get("name") == name and not node.get("hostname"):
            return node
    return None


@mcp.tool()
async def list_teams() -> list[dict]:
    """List the teams the service account belongs to (id, name, slug, my_role).

    Every other tool accepts an optional team_id; use this to find the id when you
    need to target a team other than the default (first) one.
    """
    return await _req("GET", "/api/teams")


@mcp.tool()
async def add_node(
    name: str,
    kind: str = "device",
    hostname: str | None = None,
    ip: str | None = None,
    url: str | None = None,
    tags: list[str] | None = None,
    notes: str | None = None,
    meta: dict | None = None,
    team_id: str | None = None,
    upsert: bool = True,
) -> dict:
    """Add a single node (device / site / service) to the inventory.

    Only `name` is required. `kind` is one of device | site | service | other (free
    text is accepted too). Provide `hostname`, `ip`, and/or `url` when known; `tags`
    is a list of labels; `meta` is a free-form dict for extra structured data.

    When upsert is true (default) and a node with the same hostname already exists in
    the team (or, if no hostname is given, a hostname-less node with the same name),
    that node is updated in place instead of creating a duplicate. Pass upsert=false to
    always create a new node. Returns the created or updated node.
    """
    tid = await _resolve_team(team_id)
    body = _node_body(
        {"name": name, "kind": kind, "hostname": hostname, "ip": ip, "url": url,
         "tags": tags, "notes": notes, "meta": meta}
    )
    if upsert:
        existing = await _find_node(tid, hostname, name)
        if existing:
            return await _req("PATCH", f"/api/teams/{tid}/nodes/{existing['id']}", json=body)
    return await _req("POST", f"/api/teams/{tid}/nodes", json=body)


@mcp.tool()
async def add_nodes(
    nodes: list[dict],
    team_id: str | None = None,
    upsert: bool = True,
) -> dict:
    """Bulk-add / upload many nodes at once.

    `nodes` is a list of node objects, each accepting the same fields as add_node
    (name required; optional kind, hostname, ip, url, tags, notes, meta). upsert
    applies per node exactly as in add_node. Returns
    {"created": n, "updated": n, "errors": [{"name": ..., "error": ...}]}.
    """
    tid = await _resolve_team(team_id)
    created = 0
    updated = 0
    errors: list[dict] = []
    for entry in nodes:
        name = entry.get("name")
        if not name:
            errors.append({"name": None, "error": "missing required field 'name'"})
            continue
        hostname = entry.get("hostname")
        body = _node_body(
            {"name": name, "kind": entry.get("kind", "device"), "hostname": hostname,
             "ip": entry.get("ip"), "url": entry.get("url"), "tags": entry.get("tags"),
             "notes": entry.get("notes"), "meta": entry.get("meta")}
        )
        try:
            existing = await _find_node(tid, hostname, name) if upsert else None
            if existing:
                await _req("PATCH", f"/api/teams/{tid}/nodes/{existing['id']}", json=body)
                updated += 1
            else:
                await _req("POST", f"/api/teams/{tid}/nodes", json=body)
                created += 1
        except Exception as exc:  # noqa: BLE001 - report per-node, keep going
            errors.append({"name": name, "error": str(exc)})
    return {"created": created, "updated": updated, "errors": errors}


@mcp.tool()
async def search_nodes(
    q: str | None = None,
    kind: list[str] | None = None,
    tags: list[str] | None = None,
    has_url: bool | None = None,
    is_orphan: bool | None = None,
    limit: int = 50,
    offset: int = 0,
    team_id: str | None = None,
) -> list[dict]:
    """Search the inventory.

    `q` is a case-insensitive substring matched across name, hostname, ip and url at
    once. `kind` filters to one or more kinds; `tags` requires the node to carry all
    listed tags; `has_url` / `is_orphan` are boolean filters. limit is 1-200 (default
    50). Returns matching nodes, newest-updated first.
    """
    params: dict = {"limit": limit, "offset": offset}
    if q:
        params["q"] = q
    if kind:
        params["kind"] = kind
    if tags:
        params["tags"] = tags
    if has_url is not None:
        params["has_url"] = has_url
    if is_orphan is not None:
        params["is_orphan"] = is_orphan
    tid = await _resolve_team(team_id)
    return await _req("GET", f"/api/teams/{tid}/nodes", params=params)


@mcp.tool()
async def get_node(node_id: str, team_id: str | None = None) -> dict:
    """Fetch a single node by its id."""
    tid = await _resolve_team(team_id)
    return await _req("GET", f"/api/teams/{tid}/nodes/{node_id}")


@mcp.tool()
async def update_node(
    node_id: str,
    name: str | None = None,
    kind: str | None = None,
    hostname: str | None = None,
    ip: str | None = None,
    url: str | None = None,
    tags: list[str] | None = None,
    notes: str | None = None,
    meta: dict | None = None,
    team_id: str | None = None,
) -> dict:
    """Update fields on an existing node by id. Only the fields you pass are changed.

    Passing `tags` replaces the whole tag list. Same field meanings as add_node.
    """
    tid = await _resolve_team(team_id)
    body = _node_body(
        {"name": name, "kind": kind, "hostname": hostname, "ip": ip, "url": url,
         "tags": tags, "notes": notes, "meta": meta}
    )
    return await _req("PATCH", f"/api/teams/{tid}/nodes/{node_id}", json=body)


@mcp.tool()
async def delete_node(node_id: str, team_id: str | None = None) -> dict:
    """Delete a node by id."""
    tid = await _resolve_team(team_id)
    await _req("DELETE", f"/api/teams/{tid}/nodes/{node_id}")
    return {"deleted": node_id}


@mcp.tool()
async def node_stats(team_id: str | None = None) -> dict:
    """Inventory summary: total count, counts by kind, and the top tags in use.

    Use this to discover which kinds and tags exist before searching or tagging.
    """
    tid = await _resolve_team(team_id)
    return await _req("GET", f"/api/teams/{tid}/nodes/stats")


class TokenAuth(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path != "/healthz":
            expected = f"Bearer {MCP_TOKEN}".encode()
            provided = request.headers.get("authorization", "").encode()
            if not secrets.compare_digest(provided, expected):
                return JSONResponse({"error": "unauthorized"}, status_code=401)
        return await call_next(request)


def main() -> None:
    app = mcp.streamable_http_app()
    app.add_middleware(TokenAuth)
    app.add_route("/healthz", lambda _req: PlainTextResponse("ok"), methods=["GET"])
    uvicorn.run(app, host=MCP_HOST, port=PORT)


if __name__ == "__main__":
    main()
