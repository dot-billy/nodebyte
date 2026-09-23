# nodebyte-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for
[Nodebyte](../README.md). It lets an MCP client (e.g. Claude) add, upload,
list and search nodes in a Nodebyte instance over the REST API.

It is a single-file [FastMCP](https://github.com/modelcontextprotocol/python-sdk)
server exposed over **streamable HTTP** on `127.0.0.1:8080` at `/mcp`. It
authenticates to the Nodebyte backend with a revocable personal API token created
from the Nodebyte Settings page. It never needs to store a user's password.

Inbound requests must carry `Authorization: Bearer <MCP_TOKEN>`; the server
refuses to start if `MCP_TOKEN` is unset. DNS-rebinding protection is enabled:
the `Host` header must match `MCP_ALLOWED_HOSTS`.

## Tools

| Tool | Purpose |
|------|---------|
| `add_node` | Add one device/site/service (idempotent upsert by hostname/name) |
| `add_nodes` | Bulk-add / upload many nodes at once |
| `list_nodes` | Paginated team inventory with node IDs; filter by parent, kind, tags, URL, or orphan status |
| `search_nodes` | Substring search across name/hostname/ip/url, filter by kind/tags |
| `get_node` | Fetch a node by id |
| `update_node` | Patch fields on a node |
| `delete_node` | Delete a node |
| `node_stats` | Totals + kinds/tags currently in use |
| `list_teams` | List the service account's teams |

## Adding related nodes

1. Call `list_nodes(team_id="<team-id>", kind=["device"])` to find the parent.
   Results include each node's `id` and `parent_node_id`. Listing returns up to
   `limit` nodes (default 50, maximum 200); increase `offset` by `limit` until
   a page contains fewer than `limit` nodes.
2. Call `add_node(name="Application VM", parent_node_id="<parent-id>",
   team_id="<team-id>")` to create or upsert a child under that parent.
3. Call `list_nodes(parent_id="<parent-id>", team_id="<team-id>")` to list
   its direct children. `search_nodes` also accepts `parent_id`.

Each object in `add_nodes` can include `parent_node_id`, and `update_node` accepts
it to attach or move an existing node. The parent must already exist in the same
team. The REST API enforces team permissions and rejects invalid parents and
cycles. Omitting `parent_node_id` (or passing null) preserves an existing parent
during updates and upserts. To remove a parent, use the REST PATCH endpoint with
`{"parent_node_id": null}`.

Use `is_orphan=true` to list nodes without parents. Both list and search results
are ordered by most recently updated first. All node tools accept an optional `team_id`;
when omitted, the configured default or first available team is used.

The underlying REST list endpoint is `GET /api/teams/{team_id}/nodes`, with
`parent_id`, `limit`, and `offset` query parameters (along with search filters).
It requires a personal API token or access token with at least viewer access.

## Configuration

| Env | Default | Notes |
|-----|---------|-------|
| `NODEBYTE_BASE_URL` | `http://backend.nodebyte.svc.cluster.local:8000` | Nodebyte backend base URL |
| `NODEBYTE_API_TOKEN` | *(required)* | Personal API token created in Nodebyte Settings |
| `NODEBYTE_TEAM_ID` | *(first team)* | Optional default team id |
| `MCP_TOKEN` | *(required)* | Inbound requests must send `Authorization: Bearer <MCP_TOKEN>`; the server exits at startup if unset or empty |
| `MCP_HOST` | `127.0.0.1` | Listen address; set to `0.0.0.0` only behind a trusted proxy or inside a container |
| `PORT` | `8080` | Listen port |
| `MCP_ALLOWED_HOSTS` | `127.0.0.1:*,localhost:*` | Comma-separated `Host` header allowlist (DNS-rebinding protection); add your public hostname (e.g. `mcp.example.com:*`) when serving non-locally |
| `MCP_ALLOWED_ORIGINS` | *(empty)* | Comma-separated `Origin` header allowlist; requests without an `Origin` header always pass |

The token belongs to an ordinary Nodebyte user; every tool operates within the
teams and role permissions of that user. The token is shown only once when it is
created and can be revoked independently without changing the user's password.

## Run

```bash
pip install -r requirements.txt
NODEBYTE_BASE_URL=http://localhost:8000 \
NODEBYTE_API_TOKEN=nb_pat_replace_me \
MCP_TOKEN="$(openssl rand -hex 32)" \
python server.py
```

Or via Docker (the container must bind `0.0.0.0` for `-p` to work; the published
port is still gated by `MCP_TOKEN`):

```bash
docker build -t nodebyte-mcp .
docker run -p 8080:8080 \
  -e NODEBYTE_BASE_URL=http://host.docker.internal:8000 \
  -e NODEBYTE_API_TOKEN=nb_pat_replace_me \
  -e MCP_TOKEN=change-me -e MCP_HOST=0.0.0.0 \
  nodebyte-mcp
```

## Register with Claude Code

```bash
claude mcp add --transport http nodebyte https://<host>/mcp \
  --header "Authorization: Bearer <MCP_TOKEN>"
```
