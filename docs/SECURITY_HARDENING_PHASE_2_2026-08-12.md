# Nodebyte security hardening phase 2 — 2026-08-12

## Outcome

This release closes every explicitly deferred item from the first review and ships the
recommended stale-inventory workflow:

- Redis-backed, fail-closed sliding-window limits shared by all backend replicas.
- Stateful refresh-session rotation, logout/password/admin revocation, and refresh-token
  reuse detection that revokes the full session family.
- Show-once invite and registration secrets with SHA-256 lookup hashes at rest.
- A stale-inventory review queue with configurable age, bulk keep/ignore/retire actions,
  optional team-member ownership, reviewer attribution, and automatic reactivation when
  an agent checks in again.
- Per-request nonce-based production CSP. All application pages render dynamically so
  Next.js applies the nonce to framework and inline scripts. Production script policy no
  longer needs `unsafe-inline` or `unsafe-eval`; inline styles remain allowed for the
  current Tailwind/Next.js stack.
- Clean React/ESLint output with the six prior warnings fixed rather than suppressed.
- GitHub CodeQL scanning for Python and JavaScript/TypeScript on pull requests, pushes to
  `master`, and a weekly schedule using the extended security query suite.

## Data migration

Alembic revision `0006_security_sessions`:

1. Creates `refresh_sessions` with session family, token hash, rotation, revocation, IP,
   and user-agent metadata.
2. Hashes every existing invite and registration token in the same transaction, stores
   an identifying prefix, and removes the plaintext columns. Existing links remain valid.
3. Adds node lifecycle, review, and owner fields with team/status and last-seen indexes.

The migration is one-way with respect to secret recovery: a downgrade can restore the
old schema shape but cannot recover plaintext from a secure hash. Take a database backup
before deployment.

## Runtime contract

- Redis is required. Authentication and node-registration endpoints return 503 if the
  shared limiter cannot enforce a budget; they do not silently fail open.
- Redis holds ephemeral limiter state only. PostgreSQL remains the system of record.
- Registration and invite secrets are returned only by their create response. List
  responses expose `token_prefix`, never the credential.
- Refresh-token rotation accepts each token once. Reuse returns 401 and invalidates the
  replacement token and all other sessions in that family.
- Active nodes become due for review when never seen or older than the selected threshold.
  An active decision defers the item for one threshold interval. Ignored and retired
  nodes are excluded from the default inventory view. A registration update restores a
  node to active and clears its prior review marker.

## Verification record

- Backend unit/regression suite: 11 passed.
- PostgreSQL migration from `0005_api_tokens` with existing plaintext test records:
  hashes matched, raw columns were absent, old lookup values remained usable, and the
  lifecycle default was active.
- Two independent backend processes sharing Redis: requests 1–30 reached application
  authentication; request 31 was globally rejected with 429.
- Refresh flow: initial rotation succeeded; replay returned the reuse-specific 401; the
  successor then returned 401 because its family had been revoked.
- Stale workflow: a 45-day-old registered node appeared in the 30-day queue, accepted an
  ignored decision, and returned to active after the same agent hostname checked in.
- Invite/registration workflow: create responses contained a one-time secret, list
  responses did not, database hashes matched, and submitted secrets still resolved.
- Frontend ESLint and production build passed. Runtime HTML had a matching CSP nonce on
  all 12 script elements, with `strict-dynamic`, `frame-ancestors 'none'`, and no
  production `unsafe-inline`/`unsafe-eval` script allowance.

## Operational checks

```bash
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --wait --remove-orphans
docker compose -f docker-compose.prod.yml ps
```

After rollout, confirm that `backend`, `frontend`, `db`, and `redis` are healthy; Redis
has no published port; `alembic_version` is `0006_security_sessions`; public health is
200; production CSP contains a fresh nonce on separate requests; and CodeQL completes
for both configured languages.
