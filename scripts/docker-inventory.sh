#!/usr/bin/env bash
# Nodebyte Docker inventory — register all containers from a Docker host
#
# Usage:
#   NODEBYTE_TOKEN="your-registration-token" \
#   NODEBYTE_URL="https://your-nodebyte-instance" \
#     bash docker-inventory.sh
#
# Optional:
#   NODEBYTE_KIND            — node kind to register as (default: "device")
#   NODEBYTE_TAGS            — comma-separated extra tags (default: none)
#   NODEBYTE_PARENT_HOSTNAME — parent host node hostname (default: host FQDN)
#   DOCKER_ALL               — set to "0" to register only running containers (default: 1)
#
# Notes:
# - Requires: docker, jq, curl
# - Re-running is safe: backend /api/register-node is idempotent (updates by hostname).

set -euo pipefail

BASE_URL="${NODEBYTE_URL:?Set NODEBYTE_URL (e.g. https://nodebyte.example.com)}"
API="${BASE_URL}/api/register-node"
BATCH_API="${BASE_URL}/api/register-nodes"
TOKEN="${NODEBYTE_TOKEN:?Set NODEBYTE_TOKEN before running this script}"
KIND="${NODEBYTE_KIND:-device}"
EXTRA_TAGS="${NODEBYTE_TAGS:-}"
DOCKER_ALL="${DOCKER_ALL:-1}"
NODEBYTE_BATCH="${NODEBYTE_BATCH:-1}"

MAX_NAME_LEN=200
MAX_HOSTNAME_LEN=255

BATCH_ITEMS='[]'

json_error_summary() {
  local body="$1"
  if echo "$body" | jq -e . >/dev/null 2>&1; then
    echo "$body" | jq -r 'if .detail then .detail else . end | tostring'
  else
    echo "$body"
  fi
}

for cmd in docker jq curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd is required but not installed." >&2; exit 1; }
done

HOST="$(hostname)"
HOST_FQDN="$(hostname -f 2>/dev/null || hostname)"
PARENT_HOSTNAME="${NODEBYTE_PARENT_HOSTNAME:-$HOST_FQDN}"

PS_ARGS=(-q)
if [[ "$DOCKER_ALL" == "1" ]]; then
  PS_ARGS+=(-a)
fi

IDS="$(docker ps "${PS_ARGS[@]}" 2>/dev/null || true)"
if [[ -z "${IDS//[[:space:]]/}" ]]; then
  echo "No containers found."
  exit 0
fi

echo "Inspecting containers..."
INSPECT="$(docker inspect $IDS)"
COUNT="$(echo "$INSPECT" | jq 'length')"

echo "Found $COUNT container(s). Registering with Nodebyte..."
echo ""

OK=0
FAIL=0

for row in $(echo "$INSPECT" | jq -r '.[] | @base64'); do
  _jq() { echo "$row" | base64 -d | jq -r "${1}"; }

  NAME_RAW="$(_jq '.Name | ltrimstr("/")')"
  NAME="$NAME_RAW"
  CID="$(_jq '.Id')"
  CID_SHORT="$(echo "$CID" | cut -c1-12)"
  IMAGE="$(_jq '.Config.Image // ""')"
  STATUS="$(_jq '.State.Status // "unknown"')"
  CREATED="$(_jq '.Created // ""')"

  IPS_JSON="$(echo "$row" | base64 -d | jq -c '
    [
      (.NetworkSettings.Networks // {} | to_entries[]? as $net
        | ($net.value.IPAddress // "") as $v4
        | ($net.value.GlobalIPv6Address // "") as $v6
        | (if ($v4 | length) > 0 then { network: $net.key, family: "inet", scope: "container", address: $v4 } else empty end),
          (if ($v6 | length) > 0 then { network: $net.key, family: "inet6", scope: "container", address: $v6 } else empty end)
      )
    ]'
  )"

  IP="$(echo "$IPS_JSON" | jq -r '(map(select(.family == "inet") | .address) | first) // ""')"

  PORTS_JSON="$(echo "$row" | base64 -d | jq -c '(.NetworkSettings.Ports // {})')"
  LABELS_JSON="$(echo "$row" | base64 -d | jq -c '(.Config.Labels // {})')"

  TAGS='["docker","container"]'
  TAGS="$(echo "$TAGS" | jq --arg s "$STATUS" '. + [($s | ascii_downcase)]')"
  if [[ -n "$EXTRA_TAGS" ]]; then
    IFS=',' read -ra ETAGS <<< "$EXTRA_TAGS"
    for t in "${ETAGS[@]}"; do
      t="$(echo "$t" | xargs)"
      [[ -n "$t" ]] && TAGS="$(echo "$TAGS" | jq --arg t "$t" '. + [$t]')"
    done
  fi

  META="$(jq -n \
    --arg docker_host "$HOST" \
    --arg container_id "$CID" \
    --arg container_id_short "$CID_SHORT" \
    --arg container_name "$NAME_RAW" \
    --arg image "$IMAGE" \
    --arg status "$STATUS" \
    --arg created "$CREATED" \
    --argjson ips "$IPS_JSON" \
    --argjson ports "$PORTS_JSON" \
    --argjson labels "$LABELS_JSON" \
    '{
      docker_host: $docker_host,
      container_id: $container_id,
      container_id_short: $container_id_short,
      container_name: $container_name,
      image: $image,
      status: $status,
      created: $created,
      ips: $ips,
      ports: $ports,
      labels: $labels
    }'
  )"

  # Enforce backend constraints:
  # - name max 200 chars
  # - hostname max 255 chars
  if (( ${#NAME} > MAX_NAME_LEN )); then
    NAME="${NAME:0:MAX_NAME_LEN}"
  fi

  HOSTNAME_VAL="${NAME_RAW}.${HOST_FQDN}"
  if (( ${#HOSTNAME_VAL} > MAX_HOSTNAME_LEN )); then
    HOSTNAME_VAL="${CID_SHORT}.${HOST_FQDN}"
  fi
  if (( ${#HOSTNAME_VAL} > MAX_HOSTNAME_LEN )); then
    HOSTNAME_VAL="${CID_SHORT}.${HOST}"
  fi
  if (( ${#HOSTNAME_VAL} > MAX_HOSTNAME_LEN )); then
    HOSTNAME_VAL="${HOSTNAME_VAL:0:MAX_HOSTNAME_LEN}"
  fi

  NODE_JSON="$(jq -n \
    --arg name "$NAME" \
    --arg kind "$KIND" \
    --arg hostname "$HOSTNAME_VAL" \
    --arg parent_hostname "$PARENT_HOSTNAME" \
    --arg ip "$IP" \
    --argjson tags "$TAGS" \
    --argjson meta "$META" \
    '{
      name: $name,
      kind: $kind,
      hostname: $hostname,
      parent_hostname: $parent_hostname,
      tags: $tags,
      meta: $meta
    }
    | if .ip == "" then del(.ip) else . end
    | if .parent_hostname == "" then del(.parent_hostname) else . end'
  )"

  if [[ "$NODEBYTE_BATCH" == "1" ]]; then
    BATCH_ITEMS="$(echo "$BATCH_ITEMS" | jq --argjson item "$NODE_JSON" '. + [$item]')"
    printf "  %-28s %-10s %-16s queued\n" "$NAME" "$STATUS" "${IP:-—}"
  else
    PAYLOAD="$(echo "$NODE_JSON" | jq --arg token "$TOKEN" '. + {token: $token}')"

    printf "  %-28s %-10s %-16s " "$NAME" "$STATUS" "${IP:-—}"

    RESP="$(curl -sS -X POST "$API" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      -w '\n%{http_code}')"

    BODY="${RESP%$'\n'*}"
    HTTP_CODE="${RESP##*$'\n'}"

    if [[ "$HTTP_CODE" == "201" ]]; then
      echo "✓ registered"
      OK=$((OK + 1))
    elif [[ "$HTTP_CODE" == "200" ]]; then
      echo "↻ updated"
      OK=$((OK + 1))
    else
      MSG="$(json_error_summary "$BODY")"
      MSG_ONELINE="$(echo "$MSG" | tr '\n' ' ' | cut -c1-220)"
      echo "✗ failed (HTTP $HTTP_CODE) $MSG_ONELINE"
      FAIL=$((FAIL + 1))
    fi
  fi
done

if [[ "$NODEBYTE_BATCH" == "1" ]]; then
  BATCH_COUNT="$(echo "$BATCH_ITEMS" | jq 'length')"
  if [[ "$BATCH_COUNT" != "0" ]]; then
    echo ""
    echo "Sending batch of $BATCH_COUNT nodes..."

    PAYLOAD="$(jq -n --arg token "$TOKEN" --argjson nodes "$BATCH_ITEMS" \
      '{token: $token, nodes: $nodes}')"

    RESP="$(curl -sS -X POST "$BATCH_API" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      -w '\n%{http_code}')"

    BODY="${RESP%$'\n'*}"
    HTTP_CODE="${RESP##*$'\n'}"

    if [[ "$HTTP_CODE" == "200" ]]; then
      local_created="$(echo "$BODY" | jq '.created')"
      local_updated="$(echo "$BODY" | jq '.updated')"
      local_skipped="$(echo "$BODY" | jq '.skipped')"
      local_errors="$(echo "$BODY" | jq '.errors')"
      OK=$((local_created + local_updated))
      FAIL=$((local_skipped + local_errors))
      echo "  ✓ $local_created created, $local_updated updated, $local_skipped skipped, $local_errors errors"
    else
      MSG="$(json_error_summary "$BODY")"
      echo "  ✗ Batch failed (HTTP $HTTP_CODE): $MSG"
      FAIL=$COUNT
    fi
  fi
fi

echo ""
echo "Done. $OK ok, $FAIL failed (out of $COUNT)."

