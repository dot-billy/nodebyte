#!/usr/bin/env bash
# Shared preview/apply transport for authoritative Nodebyte inventory collectors.

nodebyte_sync_batch() {
  local nodes_json="$1" source_key="$2" source_name="$3" source_type="$4"
  local base_url="${NODEBYTE_URL:?Set NODEBYTE_URL}"
  local token="${NODEBYTE_TOKEN:?Set NODEBYTE_TOKEN}"
  local mode="${NODEBYTE_SYNC_MODE:-apply}"
  local retire_missing="${NODEBYTE_RETIRE_MISSING:-0}"
  local reconcile_missing="${NODEBYTE_RECONCILE_MISSING:-1}"
  local interval="${NODEBYTE_EXPECTED_INTERVAL_MINUTES:-1440}"

  if [[ "$mode" != "apply" && "$mode" != "preview" ]]; then
    echo "Error: NODEBYTE_SYNC_MODE must be apply or preview." >&2
    return 2
  fi

  local preview_payload preview_response preview_body preview_code run_id
  preview_payload="$(jq -n \
    --arg token "$token" --arg source_key "$source_key" --arg source_name "$source_name" \
    --arg source_type "$source_type" --argjson expected_interval_minutes "$interval" \
    --argjson reconcile_missing "$([[ "$reconcile_missing" == "1" ]] && echo true || echo false)" \
    --argjson nodes "$nodes_json" \
    '{token: $token, source_key: $source_key, source_name: $source_name,
      source_type: $source_type, expected_interval_minutes: $expected_interval_minutes,
      reconcile_missing: $reconcile_missing, nodes: $nodes}')"

  preview_response="$(curl -sS --connect-timeout 10 --max-time 120 -X POST \
    "${base_url}/api/inventory-sync/preview" -H "Content-Type: application/json" \
    --data-binary @- -w '\n%{http_code}' <<<"$preview_payload")"
  preview_body="${preview_response%$'\n'*}"
  preview_code="${preview_response##*$'\n'}"
  if [[ "$preview_code" != "201" ]]; then
    echo "Inventory preview failed (HTTP $preview_code): $(echo "$preview_body" | jq -r '.detail // .' 2>/dev/null || echo "$preview_body")" >&2
    return 1
  fi

  echo "Preview: $(echo "$preview_body" | jq -r '.summary | "\(.create) create, \(.update) update, \(.unchanged) unchanged, \(.missing) missing"')" >&2
  if [[ "$mode" == "preview" ]]; then
    echo "$preview_body"
    return 0
  fi

  run_id="$(echo "$preview_body" | jq -r '.run_id')"
  local apply_payload apply_response apply_body apply_code
  apply_payload="$(jq -n --arg token "$token" \
    --argjson retire_missing "$([[ "$retire_missing" == "1" ]] && echo true || echo false)" \
    '{token: $token, retire_missing: $retire_missing}')"
  apply_response="$(curl -sS --connect-timeout 10 --max-time 120 -X POST \
    "${base_url}/api/inventory-sync/${run_id}/apply" -H "Content-Type: application/json" \
    --data-binary @- -w '\n%{http_code}' <<<"$apply_payload")"
  apply_body="${apply_response%$'\n'*}"
  apply_code="${apply_response##*$'\n'}"
  if [[ "$apply_code" != "200" ]]; then
    echo "Inventory apply failed (HTTP $apply_code): $(echo "$apply_body" | jq -r '.detail // .' 2>/dev/null || echo "$apply_body")" >&2
    return 1
  fi
  echo "Applied: $(echo "$apply_body" | jq -r '.summary | "\(.created) created, \(.updated) updated, \(.unchanged) unchanged, \(.retired) retired"')" >&2
  echo "$apply_body"
}
