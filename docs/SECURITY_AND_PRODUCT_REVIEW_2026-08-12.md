# Nodebyte security and product review — 2026-08-12

## Executive result

The review found active dependency, authentication, abuse-control, and CI assurance
gaps. The implementation branch remediates the high-priority items, introduces
personal API tokens as the selected product improvement, and adds repeatable checks
that prevent the same classes of regression.

Production topology was verified through the Catalyst Backoffice as the active
Docker Compose deployment on `nodebyte-prod` (`nodebyte.tech`), proxied through the
DigitalOcean edge. The exact production Git revision was not available from the
Backoffice record and must be captured during the production deployment proof.

## Security findings and disposition

| Priority | Finding | Disposition |
| --- | --- | --- |
| High | GitHub reported 27 open Dependabot alerts; local audit grouped these into 7 vulnerable npm packages, including Next.js, Sharp, PostCSS, js-yaml, nanoid, and brace-expansion. | Upgraded Next.js to 16.3.0 and refreshed the dependency tree. `npm audit` reports zero vulnerabilities on the branch. |
| High | The MCP server allowed unauthenticated inbound access when `MCP_TOKEN` was unset. | MCP now refuses to start without a non-empty inbound token. |
| High | MCP bound all interfaces with DNS-rebinding protection disabled. | Default bind is `127.0.0.1`; Host/Origin allowlists and DNS-rebinding protection are enabled. |
| High | MCP stored a user password and bypassed Turnstile using a spoofable `NodebyteApp/` User-Agent. | Added revocable personal API tokens; MCP now requires `NODEBYTE_API_TOKEN`; the native User-Agent bypass was removed. |
| High | Node registration endpoints had no abuse control, including the more expensive batch endpoint. | Added separate per-client budgets for single and batch registration. |
| High | Frontend CI was broken after Next.js 16 removed `next lint`; unrelated PRs stayed red. | Migrated CI lint to ESLint's native CLI and current flat config. |
| High | Backend CI used `pytest ... || true`, so missing or failing tests could never fail CI. | Removed the bypass, added security regression tests, and made Python dependency audit part of CI. |
| High | The frontend build image and CI ran on end-of-life Node 20. | Migrated both to Node 22 LTS. |
| Medium | Batch registration returned raw exception strings, which could expose database/internal details. | Server logs retain the traceback; clients receive a generic error. |
| Medium | Dependency update automation was absent. | Added weekly Dependabot coverage for npm, backend/mcp pip, and GitHub Actions. |

## Selected product improvement: personal API tokens

Nodebyte already advertises REST automation, inventory scripts, a browser extension,
and an MCP server, but automation previously required either a registration-only token
or a reusable user password. Personal API tokens make the existing automation surface
practical and safer:

- Tokens use the creator's existing team memberships and RBAC permissions.
- Secrets are generated with high entropy, shown only once, and stored only as hashes.
- Tokens default to 90-day expiration, may be configured for another lifetime, and can
  be revoked independently.
- Token management requires a login-session JWT; one API token cannot mint more tokens.
- Password changes revoke all personal API tokens.
- The Settings UI shows identifying prefixes, expiration, activity, and revocation state.

## Current feature assessment

The product has a coherent foundation: multi-team RBAC, searchable hierarchical
inventory, structured filters, bulk actions, stats, self-registration tokens, batch
registration, Ansible export, cloud/container/Kubernetes inventory scripts, Chrome
bookmark sync, admin management, REST APIs, and MCP access.

The next highest-value product candidates are:

1. **Inventory lifecycle and stale-node workflow** — server-side last-seen filters,
   retired/ignored states, ownership, and review queues. Stats already expose staleness,
   but users cannot act on it as a workflow.
2. **Audit history** — append-only records for node, membership, token, and admin changes,
   with actor and before/after context. This is the largest remaining enterprise/security
   capability gap.
3. **Import preview and reconciliation** — dry-run inventory scripts, show create/update/
   conflict counts, and optionally retire records missing from an authoritative source.
4. **Automation health** — surface registration-token last use, source health, and failed
   syncs so operators know whether inventory is current.

## Known residual risks

- Login and registration rate limiting is process-local memory. A multi-worker or
  multi-replica deployment needs a shared Redis-backed limiter.
- Refresh tokens are rotated but not server-side revocable; a previously issued token
  remains valid until expiry. A session table with reuse detection is the recommended
  next authentication hardening item.
- Registration and invite tokens are stored in plaintext because the UI can re-display
  them. They should adopt the same show-once/hash-at-rest pattern as personal API tokens.
- The frontend Content Security Policy still permits `unsafe-inline` and `unsafe-eval`.
  Tightening it requires nonce-based Next.js/Turnstile integration and browser regression
  testing.
- The extension requests broad HTTP/HTTPS API host permissions to support arbitrary
  self-hosted instances. Optional per-instance host permissions would reduce exposure.

## Required release evidence

- Backend tests and import check pass with no `|| true` masking.
- Alembic upgrades a fresh database through `0005_api_tokens`.
- Frontend lint/build and `npm audit` pass.
- Backend and MCP `pip-audit` checks pass.
- Backend, frontend, and MCP container builds pass.
- A disposable `kverify` deployment proves migration, login, API-token create/use/revoke,
  RBAC, registration throttling, and frontend rendering.
- Production deployment records exact Git revision, Compose container/image state,
  public health, security headers, login, and API-token behavior.
