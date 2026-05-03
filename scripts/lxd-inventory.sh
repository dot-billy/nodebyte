#!/usr/bin/env bash
# Nodebyte LXD inventory — register all containers & VMs from an LXD host
#
# Usage:
#   NODEBYTE_TOKEN="your-registration-token" \
#   NODEBYTE_URL="https://your-nodebyte-instance" \
#     bash lxd-inventory.sh
#
# Optional:
#   NODEBYTE_KIND    — node kind to register as (default: "device")
#   NODEBYTE_TAGS    — comma-separated extra tags (default: none)
#   NODEBYTE_PARENT_HOSTNAME — parent host node hostname (default: host FQDN)
#   LXC_REMOTE       — lxc remote to query (default: local, i.e. no prefix)

set -euo pipefail

BASE_URL="${NODEBYTE_URL:?Set NODEBYTE_URL (e.g. https://nodebyte.example.com)}"
API="${BASE_URL}/api/register-node"
BATCH_API="${BASE_URL}/api/register-nodes"
TOKEN="${NODEBYTE_TOKEN:?Set NODEBYTE_TOKEN before running this script}"
KIND="${NODEBYTE_KIND:-device}"
EXTRA_TAGS="${NODEBYTE_TAGS:-}"
REMOTE="${LXC_REMOTE:-}"
NODEBYTE_BATCH="${NODEBYTE_BATCH:-1}"
BATCH_ITEMS='[]'

for cmd in lxc jq curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd is required but not installed." >&2; exit 1; }
done

LXD_HOST="$(hostname)"
LXD_HOST_FQDN="$(hostname -f 2>/dev/null || hostname)"
PARENT_HOSTNAME="${NODEBYTE_PARENT_HOSTNAME:-$LXD_HOST_FQDN}"

PREFIX=""
[[ -n "$REMOTE" ]] && PREFIX="${REMOTE}:"

echo "Querying LXD instances on ${REMOTE:-local}..."
INSTANCES="$(lxc list "${PREFIX}" --format json 2>/dev/null)"

COUNT="$(echo "$INSTANCES" | jq 'length')"
if [[ "$COUNT" -eq 0 ]]; then
  echo "No instances found."
  exit 0
fi

echo "Found $COUNT instance(s). Registering with Nodebyte..."
echo ""

OK=0
FAIL=0

for row in $(echo "$INSTANCES" | jq -r '.[] | @base64'); do
  _jq() { echo "$row" | base64 -d | jq -r "${1}"; }

  NAME="$(_jq '.name')"
  STATUS="$(_jq '.status')"
  TYPE="$(_jq '.type')"
  ARCH="$(_jq '.architecture')"
  PROFILES="$(_jq '[.profiles[]?] | join(",")')"

  IPS_JSON="$(echo "$row" | base64 -d | jq -c '
    [.state.network? // {} | to_entries[] as $iface
      | ($iface.value.addresses // [])[]
      | select(.address != null)
      | {
          interface: $iface.key,
          family: .family,
          scope: .scope,
          address: .address
        }
    ]'
  )"

  IP="$(echo "$IPS_JSON" | jq -r '
    (map(select(.family == "inet" and .scope == "global") | .address) | first)
    // (map(select(.family == "inet") | .address) | first)
    // ""
  ')"

  TAGS='["lxd"]'
  if [[ "$TYPE" == "container" ]]; then
    TAGS="$(echo "$TAGS" | jq '. + ["container"]')"
  else
    TAGS="$(echo "$TAGS" | jq '. + ["vm"]')"
  fi
  TAGS="$(echo "$TAGS" | jq --arg s "$STATUS" '. + [($s | ascii_downcase)]')"
  if [[ -n "$EXTRA_TAGS" ]]; then
    IFS=',' read -ra ETAGS <<< "$EXTRA_TAGS"
    for t in "${ETAGS[@]}"; do
      t="$(echo "$t" | xargs)"
      [[ -n "$t" ]] && TAGS="$(echo "$TAGS" | jq --arg t "$t" '. + [$t]')"
    done
  fi

  META="$(jq -n \
    --arg type "$TYPE" \
    --arg status "$STATUS" \
    --arg arch "$ARCH" \
    --arg profiles "$PROFILES" \
    --arg lxd_host "$LXD_HOST" \
    --argjson ips "$IPS_JSON" \
    '{
      instance_type: $type,
      status: $status,
      arch: $arch,
      profiles: $profiles,
      lxd_host: $lxd_host,
      ips: $ips
    }'
  )"

  HOSTNAME_VAL="${NAME}.${LXD_HOST_FQDN}"

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
    printf "  %-30s %-12s %-8s %-16s queued\n" "$NAME" "$TYPE" "$STATUS" "${IP:-—}"
  else
    PAYLOAD="$(echo "$NODE_JSON" | jq --arg token "$TOKEN" '. + {token: $token}')"

    printf "  %-30s %-12s %-8s %-16s " "$NAME" "$TYPE" "$STATUS" "${IP:-—}"

    HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD")"

    if [[ "$HTTP_CODE" == "201" ]]; then
      echo "✓ registered"
      OK=$((OK + 1))
    elif [[ "$HTTP_CODE" == "200" ]]; then
      echo "↻ updated"
      OK=$((OK + 1))
    else
      echo "✗ failed (HTTP $HTTP_CODE)"
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
      batch_created="$(echo "$BODY" | jq '.created')"
      batch_updated="$(echo "$BODY" | jq '.updated')"
      batch_skipped="$(echo "$BODY" | jq '.skipped')"
      batch_errors="$(echo "$BODY" | jq '.errors')"
      OK=$((batch_created + batch_updated))
      FAIL=$((batch_skipped + batch_errors))
      echo "  ✓ $batch_created created, $batch_updated updated, $batch_skipped skipped, $batch_errors errors"
    else
      MSG="$(echo "$BODY" | jq -r '.detail // .' 2>/dev/null || echo "$BODY")"
      echo "  ✗ Batch failed (HTTP $HTTP_CODE): $MSG"
      FAIL=$COUNT
    fi
  fi
fi

echo ""
echo "Done. $OK ok, $FAIL failed (out of $COUNT)."
