# Nodebyte

A digital inventory and knowledge library for individuals and teams. Track devices, sites, and services alongside documents, reference links, and channel directories. Connect related resources and organize them in optional collections.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Features

- **Fast search** — find any node instantly by name, hostname, IP, URL, or tags
- **Knowledge library** — curate document, link, and channel records with a summary, separate notes, source labels, tags, and source dates
- **Flexible collections** — group resources around a home lab, project, environment, or customer; one resource can belong to several collections or none
- **Related resources** — connect systems to runbooks, design documents, and channels with links visible from either resource
- **Shared search** — search saved summaries, notes, tags, source labels, and inventory fields across the active team
- **Multi-tenant teams** — create teams with roles (owner, admin, member, viewer) and switch context in one click
- **REST API** — automate node registration from deploy scripts, monitoring, or CI/CD pipelines
- **Registration tokens** — let servers and agents self-register as nodes without user credentials
- **Personal API tokens** — authenticate scripts and integrations with revocable, expiring tokens instead of user passwords
- **Browser extension** — add any website to your inventory with one click (Chrome, Manifest V3)
- **Bookmark sync** — nodes with URLs automatically sync to browser bookmarks, organized by kind
- **Bulk operations** — multi-select nodes to delete or tag in batch
- **Stale inventory review** — triage inactive nodes in bulk, assign an owner, and keep, ignore, or retire them
- **Import reconciliation** — preview authoritative Docker, Kubernetes, and LXD changes before applying, with explicit missing-node retirement
- **Automation health** — see source freshness, failures, summaries, and sync-run history
- **Audit history** — inspect append-only human and automation changes with before/after context
- **Child inventory tables** — open a parent to browse child descriptions, links, tags, and dates; sort by name, tags, date added/updated, or remote document dates
- **Invite system** — invite team members by email with role-based access
- **Super admin console** — platform-wide user and team management for superusers

## Screenshots

| Dashboard | Nodes |
|-----------|-------|
| ![Dashboard](screenshots/dashboard.png) | ![Nodes](screenshots/nodes.png) |

| Team Management | Registration Tokens |
|-----------------|---------------------|
| ![Team](screenshots/team.png) | ![Tokens](screenshots/tokens.png) |

| Browser Extension |
|-------------------|
| ![Extension](screenshots/extension.png) |

## Architecture

```mermaid
flowchart LR
    Browser["Browser"] --> Frontend["Next.js\n:3000"]
    Extension["Chrome Extension"] --> Backend
    Frontend -->|"/api/*"| Backend["FastAPI\n:8000"]
    Backend --> DB[("PostgreSQL\n:5432")]
    Backend --> Redis[("Redis\nrate limits")]
```

The frontend proxies all `/api/*` requests to the backend, keeping auth cookies same-origin. The Chrome extension talks directly to the backend API.

## Prerequisites

- [Docker Engine](https://docs.docker.com/engine/install/) with the [Compose plugin](https://docs.docker.com/compose/install/) (`docker compose`)

That's it. No local Python, Node.js, or PostgreSQL install required.

## Quickstart

```bash
# 1. Clone the repo
git clone https://github.com/your-org/nodebyte.git
cd nodebyte

# 2. Copy the example env file and edit as needed
cp .env.example .env

# 3. Start everything
docker compose up --build
```

Once the containers are healthy:

| Service  | URL                          |
|----------|------------------------------|
| Frontend | http://localhost:3000         |
| API      | http://localhost:8000         |
| API Docs | http://localhost:8000/docs    |

Register your first account at http://localhost:3000/register. The first team is created automatically during registration.

### Invite-only mode

If you set `REGISTRATION_ENABLED=false`, create the first admin user from the command line:

```bash
docker compose exec backend python scripts/create_admin.py
```

The script prompts for email, password, and team name. You can also pass them as environment variables:

```bash
docker compose exec \
  -e ADMIN_EMAIL="admin@example.com" \
  -e ADMIN_PASSWORD="your-secure-password" \
  -e ADMIN_TEAM="My Org" \
  backend python scripts/create_admin.py
```

After that, invite additional users from the Team page in the dashboard.

### Super admin console

Users with `is_superuser = true` get an **Admin** section in the dashboard sidebar with platform-wide management:

- **Overview** — total users, teams, and nodes at a glance
- **Users** — search, activate/deactivate, promote/demote superuser status, or delete any user
- **Teams** — search, view member/node counts, or delete any team

The `create_admin.py` script automatically grants superuser status. To promote an existing user, run:

```bash
docker compose exec backend python -c "
import asyncio
from sqlalchemy import update
from app.db.session import SessionLocal
from app.models.user import User

async def main():
    async with SessionLocal() as db:
        await db.execute(update(User).where(User.email == 'you@example.com').values(is_superuser=True))
        await db.commit()
        print('Done')

asyncio.run(main())
"
```

Or toggle superuser status from the admin console itself once you have at least one superuser.

## Configuration

All configuration is done through environment variables. Set them in your `.env` file or pass them directly to Docker Compose.

### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | *(set by docker-compose)* |
| `REDIS_URL` | Shared Redis connection for distributed rate limits | `redis://redis:6379/0` |
| `JWT_SECRET` | Secret key for signing JWTs — **change in production** | *(required)* |
| `JWT_ISSUER` | Issuer claim in JWTs | `nodebyte` |
| `ACCESS_TOKEN_EXPIRES_MINUTES` | Access token lifetime | `15` |
| `REFRESH_TOKEN_EXPIRES_DAYS` | Refresh token lifetime | `30` |
| `COOKIE_SECURE` | Set `true` when serving over HTTPS | `false` |
| `COOKIE_SAMESITE` | SameSite cookie policy (`lax`, `strict`, `none`) | `lax` |
| `FRONTEND_ORIGIN` | Allowed CORS origin for the frontend | `http://localhost:3000` |
| `REGISTRATION_ENABLED` | Allow public user registration (`false` = invite-only) | `true` |
| `TURNSTILE_ENABLED` | Enable Cloudflare Turnstile bot protection | `true` |
| `TURNSTILE_SECRET_KEY` | Turnstile secret key (use test key for dev) | *(test key)* |
| `NODEBYTE_ENV` | Environment name (`dev` or `production`) | `dev` |

### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Set to `production` for optimized builds (`next build` + `next start`) | `development` |
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL (used client-side) | `http://localhost:8000` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key (use test key for dev) | *(test key)* |
| `API_PROXY_TARGET` | Server-side API proxy origin when running Next.js outside Compose; set before building and starting Next.js | `http://backend:8000` |
| `NEXT_PUBLIC_EDITION` | Landing page variant: `cloud` (marketing) or `oss` (minimal) | `cloud` |

### Docker Compose

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_DB` | Database name | `nodebyte` |
| `POSTGRES_USER` | Database user | `nodebyte` |
| `POSTGRES_PASSWORD` | Database password — **change in production** | `changeme` |
| `POSTGRES_PORT` | Host port for PostgreSQL | `5432` |

## Browser Extension

The Nodebyte browser extension lets you add websites to your inventory with one click.

### Build

```bash
./create-extension.sh
```

This creates `frontend/public/downloads/extension.tar.gz` and an `extension-meta.json` with version info. The download page at `/download` picks these up automatically.

### Install (sideload)

1. Extract the `extension` folder from the archive
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the `extension` folder
4. Click the Nodebyte icon in your toolbar, open **Settings**, and set your API URL

The extension connects directly to the backend API (e.g. `http://localhost:8000`).

## Child tables and document dates

Click a parent node's name to see its children in a sortable table. The description
uses each child's **Description / notes** field. Click a column header to change
sort direction, filter by tag, open a child by name, or edit it directly. All child
pages are loaded; the table is not limited to the first 200 children. Tags sort by
each node's alphabetized tag list, with untagged nodes last. Unknown document dates
also appear last in either sort direction.

**Date added** (`created_at`) and **Date updated** (`updated_at`) are automatically
tracked for the NodeByte record. Automation and inventory updates may change the
record's updated date. They do not indicate when a linked remote document changed.

Use the optional **Document created** and **Document updated** fields in the node
editor to record the remote document's own dates. Entries and displayed times use
your local timezone. These dates are supplied manually or by an integration; opening
a URL does not fetch them automatically. Existing records start with unknown document
dates, and editing other fields does not change them.

The team node POST/PATCH API accepts `document_created_at` and `document_updated_at`
as ISO 8601 timestamps with a timezone, for example `2026-09-23T09:15:00-04:00`.
GET responses include both fields. Omit a date on PATCH to preserve it; send `null`
to clear it. MCP `add_node`, `add_nodes`, and `update_node` also accept these dates
(use the REST API or editor to clear them).

Apply migration `0008_document_dates` before running the updated backend:
`docker compose exec backend alembic upgrade head`.

## Knowledge and collections

Use **Inventory**, **Knowledge**, and **Collections** in the dashboard sidebar.
Inventory's **Table view** keeps the existing bulk actions and infrastructure
details available. The search field above these pages searches across the active
team's resources, including summaries and notes.

Choose **Add resource** to save a document, reference link, channel directory
entry, or system. Summaries are manually curated and stored separately from notes.
The optional source label (for example, Google Docs or Slack) identifies where a
resource comes from; it does not create an integration. Original links are opened
only for HTTP(S) URLs without embedded credentials.

Source creation and modification dates are entered manually in the user's local
timezone. Unknown dates remain unknown. These fields are independent of the
automatically maintained NodeByte record dates. This release does not fetch
remote content, synchronize metadata, generate AI summaries, or search Slack
messages. Search covers information saved in NodeByte.

Create a collection with a name and optional description, then use **Add existing**
or **Add resource** inside it. The details panel lets you add a resource to more
collections and link related resources. Links work in both directions. Removing
a resource from a collection or deleting the collection preserves the resource.
Deleting a resource removes its collection memberships and related-resource links,
and never deletes the original external document.

Collections are organizational, not permission boundaries. Viewers can read;
members, admins, and owners can curate. Saved summaries and notes are visible to
the NodeByte team; access to the original document remains controlled by its source.
No customer, project, collection, or related inventory record is required to save
a knowledge resource. Knowledge kinds (`document`, `channel`, `link`) are excluded
from the infrastructure stale-review queue.

Apply migration `0009_knowledge_collections` before starting the updated backend:

```bash
docker compose exec backend alembic upgrade head
```

The existing node API now accepts `summary` and `source_name` on POST/PATCH.
Omit fields on PATCH to preserve their values; send `null` to clear them.
`GET /api/teams/{team_id}/nodes` accepts `scope=inventory|knowledge` and
`collection_id`; omitting `scope` retains the original all-resource behavior.

Collection and link endpoints follow the same team RBAC as nodes:

- `GET/POST /api/teams/{team_id}/collections`
- `GET/PUT/DELETE /api/teams/{team_id}/collections/{collection_id}`
- `PUT/DELETE /api/teams/{team_id}/collections/{collection_id}/nodes/{node_id}`
- `GET /api/teams/{team_id}/nodes/{node_id}/links`
- `PUT/DELETE /api/teams/{team_id}/nodes/{node_id}/links/{related_id}`

Collection listing accepts `node_id` to find a resource's collections. Collection,
node, and related-resource lists support `limit` (1–200) and `offset`. Membership
and link PUTs are idempotent, and self-links and cross-team associations are rejected.
Collection updates use PUT with the full name and description. Changes appear in
the existing activity log.

Database integration checks run with `TEST_DATABASE_URL` pointing to a disposable
PostgreSQL database. Each test creates and removes its own schema. CI runs these
checks alongside the existing suite.

## Authoritative inventory sync

The Docker, Kubernetes, and LXD collectors now create a server-side preview before
they apply changes. Each source owns only the records it has previously synchronized,
so one source cannot retire another source's inventory.

```bash
# Preview only; no node mutation
NODEBYTE_SYNC_MODE=preview ./scripts/docker-inventory.sh

# Preview and apply creates/updates; missing nodes stay unchanged
NODEBYTE_SYNC_MODE=apply ./scripts/docker-inventory.sh

# Explicitly retire records missing from this authoritative snapshot
NODEBYTE_SYNC_MODE=apply NODEBYTE_RETIRE_MISSING=1 ./scripts/docker-inventory.sh
```

Pending previews can also be reviewed under **Dashboard → Automation** and applied
by a team owner or admin. The same page shows source health and recent run summaries.
Every applied mutation is recorded under **Dashboard → Activity**.

## Personal API Tokens and MCP

Create personal API tokens from **Dashboard → Settings** for scripts and integrations.
The plaintext token is shown once, only a SHA-256 lookup hash is stored, and each
token can be given an expiration date or revoked independently. Token requests use
the same team membership and RBAC permissions as the user who created the token.

Use the token as a bearer credential:

```bash
curl https://nodebyte.example.com/api/teams \
  -H "Authorization: Bearer ${NODEBYTE_API_TOKEN}" # gitleaks:allow
```

The bundled MCP server in `mcp/` requires both a Nodebyte personal API token for
backend access and a separate `MCP_TOKEN` protecting inbound MCP requests. See
[`mcp/README.md`](mcp/README.md) for the hardened deployment options.

## Seed Data

A helper script generates 100 random nodes for testing:

```bash
NODEBYTE_EMAIL="you@example.com" NODEBYTE_PASSWORD="yourpassword" python3 scripts/seed_nodes.py
```

You must have a registered account and the backend running on `http://localhost:8000`.

## Production Deployment

Use the production Compose definition so the application runs from immutable,
non-root images without source-code bind mounts or a published database port:

```bash
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker compose -f docker-compose.prod.yml ps
```

Back up the `nodebyte_postgres` volume before applying migrations. The backend
production image applies Alembic migrations before starting Uvicorn. Address
each item in this checklist before the rollout:

- [ ] **`JWT_SECRET`** — set to a long random string (`openssl rand -hex 32`)
- [ ] **`POSTGRES_PASSWORD`** — set to a strong, unique password
- [ ] **`COOKIE_SECURE=true`** — required when serving over HTTPS
- [ ] **`COOKIE_SAMESITE=lax`** — or `strict` if frontend and API share a domain
- [ ] **`FRONTEND_ORIGIN`** — set to your actual frontend URL (e.g. `https://nodebyte.example.com`)
- [ ] **`NEXT_PUBLIC_API_BASE_URL`** — set to your actual API URL
- [ ] **Turnstile** — replace test keys with real Cloudflare Turnstile keys, or set `TURNSTILE_ENABLED=false` to disable
- [ ] **Compose** — use `docker-compose.prod.yml`, which runs Uvicorn without `--reload`
- [ ] **HTTPS** — terminate TLS with a reverse proxy (nginx, Caddy, Traefik) in front of the containers
- [ ] **Volumes** — ensure `nodebyte_postgres` is backed up or mapped to persistent storage

Redis stores short-lived rate-limit windows only; it is intentionally not published
to the host or persisted by the production Compose definition. Keep all backend
replicas on the same `REDIS_URL` so abuse-control budgets remain global.

Refresh tokens are single-use server-side sessions. Replaying a rotated token revokes
the entire session family. Invite and registration secrets are shown once at creation;
only SHA-256 lookup hashes and identifying prefixes are stored afterward.

## API Documentation

The backend auto-generates interactive API documentation:

- **Swagger UI** — `http://localhost:8000/docs`
- **ReDoc** — `http://localhost:8000/redoc`

Documentation is role-filtered: without a token, only public endpoints such as
`/api/register-node` are shown. At the top of `/docs` or `/redoc`, paste a personal
API token from **Dashboard → Settings** and select **Load my endpoints**. Access
tokens also work. The token is held only in memory for that page; **Clear token**
returns to public documentation. Swagger's **Try it out** uses the entered token.

List inventory with `GET /api/teams/{team_id}/nodes` (at least viewer access).
Use `GET /api/teams` to find your team ID. The list returns node IDs and
`parent_node_id`; filter direct children with `parent_id`, and paginate with
`limit` (1–200) and `offset`. To attach a child, send `parent_node_id` when creating
or updating a node. Registration tokens are for registration, not listing inventory.

All endpoints are under `/api/`. Authentication accepts personal API tokens or JWT
access tokens as bearer credentials. Browser refresh tokens use HTTP-only cookies.
Interactive documentation is disabled in production.

## Project Structure

```
nodebyte/
├── backend/              # FastAPI application
│   ├── app/
│   │   ├── api/          # Route handlers
│   │   ├── core/         # Config, security, RBAC
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   └── services/     # Business logic
│   ├── alembic/          # Database migrations
│   ├── scripts/          # create_admin.py, etc.
│   ├── Dockerfile
│   └── entrypoint.sh
├── frontend/             # Next.js application
│   ├── src/
│   │   ├── app/          # Pages (App Router)
│   │   ├── components/   # React components
│   │   └── lib/          # API client, auth context
│   ├── Dockerfile
│   └── entrypoint.sh
├── extension/            # Chrome extension (Manifest V3)
│   ├── manifest.json
│   └── src/
├── scripts/              # Utility scripts
├── docker-compose.yml       # local development
├── docker-compose.prod.yml  # hardened production runtime
└── create-extension.sh
```

## License

[MIT](LICENSE) — DeltaOps Technology, LLC
