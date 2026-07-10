# nodebyte-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for
[Nodebyte](../README.md). It lets an MCP client (e.g. Claude) add, upload, and
search nodes in a Nodebyte instance over the REST API.

It is a single-file [FastMCP](https://github.com/modelcontextprotocol/python-sdk)
server exposed over **streamable HTTP** on port `8080` at `/mcp`. It authenticates
to the Nodebyte backend with a service-account email + password, caches the access
token, and re-authenticates automatically when the token expires.

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
| `MCP_TOKEN` | *(none)* | If set, inbound requests must send `Authorization: Bearer <MCP_TOKEN>` |
| `PORT` | `8080` | Listen port |

The service account is an ordinary Nodebyte user; every tool operates within the
teams that account is a member of. The login request sends a `NodebyteApp/1.0`
User-Agent so it works even when Cloudflare Turnstile is enabled.

## Run

```bash
pip install -r requirements.txt
NODEBYTE_BASE_URL=http://localhost:8000 \
NODEBYTE_EMAIL=you@example.com NODEBYTE_PASSWORD=secret \
python server.py
```

Or via Docker:

```bash
docker build -t nodebyte-mcp .
docker run -p 8080:8080 \
  -e NODEBYTE_BASE_URL=http://host.docker.internal:8000 \
  -e NODEBYTE_EMAIL=you@example.com -e NODEBYTE_PASSWORD=secret \
  nodebyte-mcp
```

## Register with Claude Code

```bash
claude mcp add --transport http nodebyte https://<host>/mcp \
  --header "Authorization: Bearer <MCP_TOKEN>"
```
