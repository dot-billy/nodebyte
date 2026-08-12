# Inventory accountability, reconciliation, and automation health

This release turns Nodebyte's collectors into accountable, source-scoped inventory
workflows.

## Behavior

- Audit events are append-only records without an update API or `updated_at` field.
  They retain actor identifiers, resource identity, before/after snapshots, source and
  sync-run context, and timestamps. Secrets and raw credentials are never recorded.
- A sync preview calculates creates, updates, unchanged records, and missing records
  without mutating nodes. Previews expire after 30 minutes and can be applied once.
- Missing records are scoped to nodes previously owned by the same inventory source.
  Retirement occurs only when `retire_missing=true` is explicitly supplied.
- Owners and admins can review and apply pending previews in the Automation UI. The
  registration token is never sent to the browser.
- Sources report healthy, stale, failing, or never-synced status from their expected
  interval and latest success/failure timestamps.

## Collector controls

| Variable | Default | Effect |
| --- | --- | --- |
| `NODEBYTE_SYNC_MODE` | `apply` | Use `preview` for a non-mutating dry run. |
| `NODEBYTE_RETIRE_MISSING` | `0` | Set to `1` to retire source-owned missing records during apply. |
| `NODEBYTE_RECONCILE_MISSING` | `1` | Set to `0` to omit missing-record comparison. |
| `NODEBYTE_EXPECTED_INTERVAL_MINUTES` | `1440` | Expected collector cadence used by health evaluation. |

## Integrity boundaries

- Registration-token team scope is checked on preview and apply.
- Human apply requires team admin or owner access.
- Apply locks the run row and rejects replay, expiration, or a revoked/expired source
  credential.
- Node changes, sync status, source health, and audit events commit atomically.
- External IDs are unique within a source when present; hostname/name fallback supports
  existing inventories during first adoption.
