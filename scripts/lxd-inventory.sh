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
#   LXC_REMOTE       — lxc remote to query (default: local, i.e. no prefix)

set -euo pipefail

API="${NODEBYTE_URL:?Set NODEBYTE_URL (e.g. https://nodebyte.example.com)}/api/register-node"
TOKEN="${NODEBYTE_TOKEN:?Set NODEBYTE_TOKEN before running this script}"
KIND="${NODEBYTE_KIND:-device}"
EXTRA_TAGS="${NODEBYTE_TAGS:-}"
REMOTE="${LXC_REMOTE:-}"

for cmd in lxc jq curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd is required but not installed." >&2; exit 1; }
done

LXD_HOST="$(hostname)"
LXD_HOST_FQDN="$(hostname -f 2>/dev/null || hostname)"

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

  IP="$(_jq '
    [.state.network? // {} | to_entries[]
     | .value.addresses[]?
     | select(.family == "inet" and .scope == "global")]
    | first | .address // empty
  ')"
  [[ "$IP" == "null" || -z "$IP" ]] && IP=""

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
    '{
      instance_type: $type,
      status: $status,
      arch: $arch,
      profiles: $profiles,
      lxd_host: $lxd_host
    }'
  )"

  HOSTNAME_VAL="${NAME}.${LXD_HOST_FQDN}"

  PAYLOAD="$(jq -n \
    --arg token "$TOKEN" \
    --arg name "$NAME" \
    --arg kind "$KIND" \
    --arg hostname "$HOSTNAME_VAL" \
    --arg ip "$IP" \
    --argjson tags "$TAGS" \
    --argjson meta "$META" \
    '{
      token: $token,
      name: $name,
      kind: $kind,
      hostname: $hostname,
      tags: $tags,
      meta: $meta
    }
    | if .ip == "" then del(.ip) else . end'
  )"

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
done

echo ""
echo "Done. $OK registered, $FAIL failed (out of $COUNT)."
