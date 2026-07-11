# nodebyte-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for
[Nodebyte](../README.md). It lets an MCP client (e.g. Claude) add, upload, and
search nodes in a Nodebyte instance over the REST API.

It is a single-file [FastMCP](https://github.com/modelcontextprotocol/python-sdk)
server exposed over **streamable HTTP** on `127.0.0.1:8080` at `/mcp`. It
authenticates to the Nodebyte backend with a service-account email + password,
caches the access token, and re-authenticates automatically when the token expires.

Inbound requests must carry `Authorization: Bearer <MCP_TOKEN>`; the server
refuses to start if `MCP_TOKEN` is unset. DNS-rebinding protection is enabled:
the `Host` header must match `MCP_ALLOWED_HOSTS`.

## Tools

| Tool | Purpose |
|------|---------|
| `add_node` | Add one device/site/service (idempotent upsert by hostname/name) |
| `add_nodes` | Bulk-add / upload many nodes at once |
| `search_nodes` | Substring search across name/hostname/ip/url, filter by kind/tags |
| `get_node` | Fetch a node by id |
| `update_node` | Patch fields on a node |
| `delete_node` | Delete a node |
| `node_stats` | Totals + kinds/tags currently in use |
| `list_teams` | List the service account's teams |

## Configuration

| Env | Default | Notes |
|-----|---------|-------|
| `NODEBYTE_BASE_URL` | `http://backend.nodebyte.svc.cluster.local:8000` | Nodebyte backend base URL |
| `NODEBYTE_EMAIL` | *(required)* | Service-account email |
| `NODEBYTE_PASSWORD` | *(required)* | Service-account password |
| `NODEBYTE_TEAM_ID` | *(first team)* | Optional default team id |
| `MCP_TOKEN` | *(required)* | Inbound requests must send `Authorization: Bearer <MCP_TOKEN>`; the server exits at startup if unset or empty |
| `MCP_HOST` | `127.0.0.1` | Listen address; set to `0.0.0.0` only behind a trusted proxy or inside a container |
| `PORT` | `8080` | Listen port |
| `MCP_ALLOWED_HOSTS` | `127.0.0.1:*,localhost:*` | Comma-separated `Host` header allowlist (DNS-rebinding protection); add your public hostname (e.g. `mcp.example.com:*`) when serving non-locally |
| `MCP_ALLOWED_ORIGINS` | *(empty)* | Comma-separated `Origin` header allowlist; requests without an `Origin` header always pass |

The service account is an ordinary Nodebyte user; every tool operates within the
teams that account is a member of. The login request sends a `NodebyteApp/1.0`
User-Agent so it works even when Cloudflare Turnstile is enabled.

## Run

```bash
pip install -r requirements.txt
NODEBYTE_BASE_URL=http://localhost:8000 \
NODEBYTE_EMAIL=you@example.com NODEBYTE_PASSWORD=secret \
MCP_TOKEN="$(openssl rand -hex 32)" \
python server.py
```

Or via Docker (the container must bind `0.0.0.0` for `-p` to work; the published
port is still gated by `MCP_TOKEN`):

```bash
docker build -t nodebyte-mcp .
docker run -p 8080:8080 \
  -e NODEBYTE_BASE_URL=http://host.docker.internal:8000 \
  -e NODEBYTE_EMAIL=you@example.com -e NODEBYTE_PASSWORD=secret \
  -e MCP_TOKEN=change-me -e MCP_HOST=0.0.0.0 \
  nodebyte-mcp
```

## Register with Claude Code

```bash
claude mcp add --transport http nodebyte https://<host>/mcp \
  --header "Authorization: Bearer <MCP_TOKEN>"
```
