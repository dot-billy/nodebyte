#!/usr/bin/env bash
# Nodebyte Kubernetes inventory — register cluster resources as inventory nodes
#
# Usage:
#   NODEBYTE_TOKEN="your-registration-token" \
#   NODEBYTE_URL="https://your-nodebyte-instance" \
#     bash kubernetes-inventory.sh
#
# Optional:
#   K8S_CLUSTER_NAME          — cluster name (default: current kubectl context name)
#   K8S_CONTEXT               — kubectl context to use (default: current context)
#   K8S_SKIP_SYSTEM           — set to "1" to skip kube-system, kube-public, kube-node-lease
#   K8S_NAMESPACES            — comma-separated namespace whitelist (default: all)
#   K8S_RESOURCES             — comma-separated resource types to collect
#                               (default: nodes,namespaces,deployments,statefulsets,daemonsets,services,ingresses)
#   NODEBYTE_PARENT_HOSTNAME  — optional parent to nest the cluster under
#   NODEBYTE_TAGS             — comma-separated extra tags appended to all registrations
#
# Notes:
# - Requires: kubectl, jq, curl
# - Re-running is safe: backend /api/register-node is idempotent (updates by hostname).
# - Resources are registered top-down (cluster → nodes/namespaces → workloads/services/ingresses)
#   so parent-child relationships resolve correctly.

set -euo pipefail

BASE_URL="${NODEBYTE_URL:?Set NODEBYTE_URL (e.g. https://nodebyte.example.com)}"
API="${BASE_URL}/api/register-node"
BATCH_API="${BASE_URL}/api/register-nodes"
TOKEN="${NODEBYTE_TOKEN:?Set NODEBYTE_TOKEN before running this script}"
EXTRA_TAGS="${NODEBYTE_TAGS:-}"
NODEBYTE_BATCH="${NODEBYTE_BATCH:-1}"
K8S_SKIP_SYSTEM="${K8S_SKIP_SYSTEM:-0}"
K8S_NAMESPACES="${K8S_NAMESPACES:-}"
K8S_RESOURCES="${K8S_RESOURCES:-nodes,namespaces,deployments,statefulsets,daemonsets,services,ingresses}"

SYSTEM_NAMESPACES="kube-system kube-public kube-node-lease"

MAX_NAME_LEN=200
MAX_HOSTNAME_LEN=255

OK=0
FAIL=0
TOTAL=0
BATCH_ITEMS='[]'

# ── helpers ──────────────────────────────────────────────────────────────────

json_error_summary() {
  local body="$1"
  if echo "$body" | jq -e . >/dev/null 2>&1; then
    echo "$body" | jq -r 'if .detail then .detail else . end | tostring'
  else
    echo "$body"
  fi
}

build_tags() {
  # Usage: build_tags "tag1" "tag2" ...
  local tags='[]'
  for t in "$@"; do
    tags="$(echo "$tags" | jq --arg t "$t" '. + [$t]')"
  done
  if [[ -n "$EXTRA_TAGS" ]]; then
    IFS=',' read -ra ETAGS <<< "$EXTRA_TAGS"
    for t in "${ETAGS[@]}"; do
      t="$(echo "$t" | xargs)"
      [[ -n "$t" ]] && tags="$(echo "$tags" | jq --arg t "$t" '. + [$t]')"
    done
  fi
  echo "$tags"
}

truncate_field() {
  local val="$1" max="$2"
  if (( ${#val} > max )); then
    echo "${val:0:$max}"
  else
    echo "$val"
  fi
}

_build_node_json() {
  local name="$1" kind="$2" hostname="$3" parent_hostname="$4" ip="$5" url="$6" tags="$7" meta="$8"
  name="$(truncate_field "$name" "$MAX_NAME_LEN")"
  hostname="$(truncate_field "$hostname" "$MAX_HOSTNAME_LEN")"
  jq -n \
    --arg name "$name" \
    --arg kind "$kind" \
    --arg hostname "$hostname" \
    --arg parent_hostname "$parent_hostname" \
    --arg ip "$ip" \
    --arg url "$url" \
    --argjson tags "$tags" \
    --argjson meta "$meta" \
    '{
      name: $name,
      kind: $kind,
      hostname: $hostname,
      parent_hostname: $parent_hostname,
      ip: $ip,
      url: $url,
      tags: $tags,
      meta: $meta
    }
    | if .ip == "" then del(.ip) else . end
    | if .url == "" then del(.url) else . end
    | if .parent_hostname == "" then del(.parent_hostname) else . end'
}

register_node() {
  # Usage: register_node <name> <kind> <hostname> <parent_hostname> <ip> <url> <tags_json> <meta_json>
  local name="$1" kind="$2" hostname="$3" parent_hostname="$4" ip="$5" url="$6" tags="$7" meta="$8"

  TOTAL=$((TOTAL + 1))

  local NODE_JSON
  NODE_JSON="$(_build_node_json "$name" "$kind" "$hostname" "$parent_hostname" "$ip" "$url" "$tags" "$meta")"

  if [[ "$NODEBYTE_BATCH" == "1" ]]; then
    BATCH_ITEMS="$(echo "$BATCH_ITEMS" | jq --argjson item "$NODE_JSON" '. + [$item]')"
    printf "  %-40s %-12s queued\n" "$name" "$kind"
    return
  fi

  PAYLOAD="$(echo "$NODE_JSON" | jq --arg token "$TOKEN" '. + {token: $token}')"

  printf "  %-40s %-12s " "$name" "$kind"

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
}

flush_batch() {
  local count
  count="$(echo "$BATCH_ITEMS" | jq 'length')"
  if [[ "$count" == "0" ]]; then
    return
  fi

  echo ""
  echo "Sending batch of $count nodes..."

  PAYLOAD="$(jq -n --arg token "$TOKEN" --argjson nodes "$BATCH_ITEMS" \
    '{token: $token, nodes: $nodes}')"

  RESP="$(curl -sS -X POST "$BATCH_API" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    -w '\n%{http_code}')"

  BODY="${RESP%$'\n'*}"
  HTTP_CODE="${RESP##*$'\n'}"

  if [[ "$HTTP_CODE" == "200" ]]; then
    local created updated skipped errors
    created="$(echo "$BODY" | jq '.created')"
    updated="$(echo "$BODY" | jq '.updated')"
    skipped="$(echo "$BODY" | jq '.skipped')"
    errors="$(echo "$BODY" | jq '.errors')"
    OK=$((created + updated))
    FAIL=$((skipped + errors))
    echo "  ✓ $created created, $updated updated, $skipped skipped, $errors errors"
  else
    MSG="$(json_error_summary "$BODY")"
    echo "  ✗ Batch failed (HTTP $HTTP_CODE): $MSG"
    FAIL=$TOTAL
  fi

  BATCH_ITEMS='[]'
}

should_collect() {
  # Check if a resource type is in K8S_RESOURCES
  local resource="$1"
  echo ",$K8S_RESOURCES," | grep -qi ",$resource,"
}

is_system_namespace() {
  local ns="$1"
  for sys_ns in $SYSTEM_NAMESPACES; do
    [[ "$ns" == "$sys_ns" ]] && return 0
  done
  return 1
}

should_include_namespace() {
  local ns="$1"
  # Skip system namespaces if requested
  if [[ "$K8S_SKIP_SYSTEM" == "1" ]] && is_system_namespace "$ns"; then
    return 1
  fi
  # If whitelist is set, only include listed namespaces
  if [[ -n "$K8S_NAMESPACES" ]]; then
    echo ",$K8S_NAMESPACES," | grep -q ",$ns," || return 1
  fi
  return 0
}

# ── preflight ────────────────────────────────────────────────────────────────

for cmd in kubectl jq curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd is required but not installed." >&2; exit 1; }
done

# Resolve kubectl context and cluster name
KUBECTL_ARGS=()
if [[ -n "${K8S_CONTEXT:-}" ]]; then
  KUBECTL_ARGS+=(--context "$K8S_CONTEXT")
fi

CURRENT_CONTEXT="${K8S_CONTEXT:-$(kubectl config current-context 2>/dev/null || echo "unknown")}"
CLUSTER_NAME="${K8S_CLUSTER_NAME:-$CURRENT_CONTEXT}"
CLUSTER_HOSTNAME="k8s:${CLUSTER_NAME}"
PARENT_HOSTNAME="${NODEBYTE_PARENT_HOSTNAME:-}"

echo "Kubernetes inventory for cluster: $CLUSTER_NAME (context: $CURRENT_CONTEXT)"
echo "Nodebyte URL: $NODEBYTE_URL"
echo ""

# ── cluster ──────────────────────────────────────────────────────────────────

echo "── Cluster ────────────────────────────────────────────────────────"

K8S_VERSION="$(kubectl "${KUBECTL_ARGS[@]}" version -o json 2>/dev/null | jq -r '.serverVersion.gitVersion // "unknown"')"
API_SERVER="$(kubectl "${KUBECTL_ARGS[@]}" cluster-info 2>/dev/null | head -1 | grep -oP 'https?://\S+' | sed 's/\x1b\[[0-9;]*m//g' || echo "")"
NODE_COUNT="$(kubectl "${KUBECTL_ARGS[@]}" get nodes --no-headers 2>/dev/null | wc -l | tr -d ' ')"
NS_COUNT="$(kubectl "${KUBECTL_ARGS[@]}" get namespaces --no-headers 2>/dev/null | wc -l | tr -d ' ')"

CLUSTER_META="$(jq -n \
  --arg k8s_cluster_name "$CLUSTER_NAME" \
  --arg k8s_version "$K8S_VERSION" \
  --arg k8s_context "$CURRENT_CONTEXT" \
  --arg k8s_api_server "$API_SERVER" \
  --arg node_count "$NODE_COUNT" \
  --arg namespace_count "$NS_COUNT" \
  '{
    k8s_cluster_name: $k8s_cluster_name,
    k8s_version: $k8s_version,
    k8s_context: $k8s_context,
    k8s_api_server: $k8s_api_server,
    node_count: ($node_count | tonumber),
    namespace_count: ($namespace_count | tonumber)
  }'
)"

CLUSTER_TAGS="$(build_tags "kubernetes" "cluster")"

register_node "${CLUSTER_NAME} (cluster)" "cluster" "$CLUSTER_HOSTNAME" "$PARENT_HOSTNAME" "" "$API_SERVER" "$CLUSTER_TAGS" "$CLUSTER_META"
echo ""

# ── K8s Nodes ────────────────────────────────────────────────────────────────

if should_collect "nodes"; then
  echo "── K8s Nodes ──────────────────────────────────────────────────────"

  NODES_JSON="$(kubectl "${KUBECTL_ARGS[@]}" get nodes -o json 2>/dev/null)"

  for row in $(echo "$NODES_JSON" | jq -r '.items[] | @base64'); do
    _jq() { echo "$row" | base64 -d | jq -r "${1}"; }

    NODE_NAME="$(_jq '.metadata.name')"
    NODE_HOSTNAME="k8s:${CLUSTER_NAME}:node:${NODE_NAME}"

    # Extract roles from labels
    ROLES="$(echo "$row" | base64 -d | jq -r '
      [.metadata.labels // {} | to_entries[]
       | select(.key | startswith("node-role.kubernetes.io/"))
       | .key | ltrimstr("node-role.kubernetes.io/")] | if length == 0 then ["worker"] else . end
    ')"

    # Internal IP
    IP="$(echo "$row" | base64 -d | jq -r '
      [.status.addresses[]? | select(.type == "InternalIP") | .address] | first // ""
    ')"

    # Node info
    K8S_NODE_VERSION="$(_jq '.status.nodeInfo.kubeletVersion // ""')"
    OS_IMAGE="$(_jq '.status.nodeInfo.osImage // ""')"
    ARCH="$(_jq '.status.nodeInfo.architecture // ""')"
    CONTAINER_RUNTIME="$(_jq '.status.nodeInfo.containerRuntimeVersion // ""')"

    # Conditions
    CONDITIONS="$(echo "$row" | base64 -d | jq -c '
      [.status.conditions[]? | {(.type): .status}] | add // {}
    ')"

    # Capacity and allocatable
    CAPACITY="$(echo "$row" | base64 -d | jq -c '.status.capacity // {}')"
    ALLOCATABLE="$(echo "$row" | base64 -d | jq -c '.status.allocatable // {}')"

    # Labels and taints
    LABELS="$(echo "$row" | base64 -d | jq -c '.metadata.labels // {}')"
    TAINTS="$(echo "$row" | base64 -d | jq -c '[.spec.taints[]?] // []')"

    META="$(jq -n \
      --arg k8s_cluster "$CLUSTER_NAME" \
      --arg k8s_node_name "$NODE_NAME" \
      --argjson k8s_roles "$ROLES" \
      --arg k8s_version "$K8S_NODE_VERSION" \
      --arg k8s_os "$OS_IMAGE" \
      --arg k8s_arch "$ARCH" \
      --arg k8s_container_runtime "$CONTAINER_RUNTIME" \
      --argjson k8s_conditions "$CONDITIONS" \
      --argjson k8s_capacity "$CAPACITY" \
      --argjson k8s_allocatable "$ALLOCATABLE" \
      --argjson k8s_labels "$LABELS" \
      --argjson k8s_taints "$TAINTS" \
      '{
        k8s_cluster: $k8s_cluster,
        k8s_node_name: $k8s_node_name,
        k8s_roles: $k8s_roles,
        k8s_version: $k8s_version,
        k8s_os: $k8s_os,
        k8s_arch: $k8s_arch,
        k8s_container_runtime: $k8s_container_runtime,
        k8s_conditions: $k8s_conditions,
        k8s_capacity: $k8s_capacity,
        k8s_allocatable: $k8s_allocatable,
        k8s_labels: $k8s_labels,
        k8s_taints: $k8s_taints
      }'
    )"

    # Build tags: kubernetes, k8s-node, plus each role
    ROLE_ARGS=("kubernetes" "k8s-node")
    while IFS= read -r role; do
      [[ -n "$role" ]] && ROLE_ARGS+=("$role")
    done < <(echo "$ROLES" | jq -r '.[]')
    TAGS="$(build_tags "${ROLE_ARGS[@]}")"

    register_node "$NODE_NAME" "device" "$NODE_HOSTNAME" "$CLUSTER_HOSTNAME" "$IP" "" "$TAGS" "$META"
  done
  echo ""
fi

# ── Namespaces ───────────────────────────────────────────────────────────────

if should_collect "namespaces"; then
  echo "── Namespaces ─────────────────────────────────────────────────────"

  NS_JSON="$(kubectl "${KUBECTL_ARGS[@]}" get namespaces -o json 2>/dev/null)"

  NAMESPACE_LIST=()

  for row in $(echo "$NS_JSON" | jq -r '.items[] | @base64'); do
    _jq() { echo "$row" | base64 -d | jq -r "${1}"; }

    NS_NAME="$(_jq '.metadata.name')"

    if ! should_include_namespace "$NS_NAME"; then
      continue
    fi

    NAMESPACE_LIST+=("$NS_NAME")
    NS_HOSTNAME="k8s:${CLUSTER_NAME}:ns:${NS_NAME}"
    NS_STATUS="$(_jq '.status.phase // "Active"')"
    NS_LABELS="$(echo "$row" | base64 -d | jq -c '.metadata.labels // {}')"

    META="$(jq -n \
      --arg k8s_cluster "$CLUSTER_NAME" \
      --arg k8s_namespace "$NS_NAME" \
      --arg k8s_status "$NS_STATUS" \
      --argjson k8s_labels "$NS_LABELS" \
      '{
        k8s_cluster: $k8s_cluster,
        k8s_namespace: $k8s_namespace,
        k8s_status: $k8s_status,
        k8s_labels: $k8s_labels
      }'
    )"

    TAG_ARGS=("kubernetes" "namespace")
    if is_system_namespace "$NS_NAME"; then
      TAG_ARGS+=("kube-system")
    fi
    TAGS="$(build_tags "${TAG_ARGS[@]}")"

    register_node "${NS_NAME} (ns)" "namespace" "$NS_HOSTNAME" "$CLUSTER_HOSTNAME" "" "" "$TAGS" "$META"
  done
  echo ""
else
  # Still need namespace list for workloads/services/ingresses
  NAMESPACE_LIST=()
  while IFS= read -r ns; do
    [[ -n "$ns" ]] && should_include_namespace "$ns" && NAMESPACE_LIST+=("$ns")
  done < <(kubectl "${KUBECTL_ARGS[@]}" get namespaces -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | tr ' ' '\n')
fi

# ── Workloads (Deployments, StatefulSets, DaemonSets) ────────────────────────

COLLECT_DEPLOYS=false; should_collect "deployments" && COLLECT_DEPLOYS=true
COLLECT_STS=false; should_collect "statefulsets" && COLLECT_STS=true
COLLECT_DS=false; should_collect "daemonsets" && COLLECT_DS=true

if $COLLECT_DEPLOYS || $COLLECT_STS || $COLLECT_DS; then
  echo "── Workloads ──────────────────────────────────────────────────────"

  for NS in "${NAMESPACE_LIST[@]}"; do
    NS_HOSTNAME="k8s:${CLUSTER_NAME}:ns:${NS}"

    # Deployments
    if $COLLECT_DEPLOYS; then
      DEPLOYS_JSON="$(kubectl "${KUBECTL_ARGS[@]}" get deployments -n "$NS" -o json 2>/dev/null)"

      for row in $(echo "$DEPLOYS_JSON" | jq -r '.items[] | @base64'); do
        _jq() { echo "$row" | base64 -d | jq -r "${1}"; }

        DEP_NAME="$(_jq '.metadata.name')"
        DEP_HOSTNAME="k8s:${CLUSTER_NAME}:ns:${NS}:deploy:${DEP_NAME}"

        REPLICAS_DESIRED="$(_jq '.spec.replicas // 0')"
        REPLICAS_READY="$(_jq '.status.readyReplicas // 0')"
        REPLICAS_AVAILABLE="$(_jq '.status.availableReplicas // 0')"
        STRATEGY="$(_jq '.spec.strategy.type // ""')"
        CONTAINERS="$(echo "$row" | base64 -d | jq -c '[.spec.template.spec.containers[]? | {name, image}]')"
        DEP_LABELS="$(echo "$row" | base64 -d | jq -c '.metadata.labels // {}')"
        SELECTOR="$(echo "$row" | base64 -d | jq -c '.spec.selector.matchLabels // {}')"

        META="$(jq -n \
          --arg k8s_cluster "$CLUSTER_NAME" \
          --arg k8s_namespace "$NS" \
          --arg k8s_workload_type "Deployment" \
          --arg k8s_workload_name "$DEP_NAME" \
          --argjson k8s_replicas_desired "$REPLICAS_DESIRED" \
          --argjson k8s_replicas_ready "$REPLICAS_READY" \
          --argjson k8s_replicas_available "$REPLICAS_AVAILABLE" \
          --arg k8s_strategy "$STRATEGY" \
          --argjson k8s_containers "$CONTAINERS" \
          --argjson k8s_labels "$DEP_LABELS" \
          --argjson k8s_selector "$SELECTOR" \
          '{
            k8s_cluster: $k8s_cluster,
            k8s_namespace: $k8s_namespace,
            k8s_workload_type: $k8s_workload_type,
            k8s_workload_name: $k8s_workload_name,
            k8s_replicas_desired: $k8s_replicas_desired,
            k8s_replicas_ready: $k8s_replicas_ready,
            k8s_replicas_available: $k8s_replicas_available,
            k8s_strategy: $k8s_strategy,
            k8s_containers: $k8s_containers,
            k8s_labels: $k8s_labels,
            k8s_selector: $k8s_selector
          }'
        )"

        TAGS="$(build_tags "kubernetes" "workload" "deployment")"
        register_node "${DEP_NAME} (deploy)" "workload" "$DEP_HOSTNAME" "$NS_HOSTNAME" "" "" "$TAGS" "$META"
      done
    fi

    # StatefulSets
    if $COLLECT_STS; then
      STS_JSON="$(kubectl "${KUBECTL_ARGS[@]}" get statefulsets -n "$NS" -o json 2>/dev/null)"

      for row in $(echo "$STS_JSON" | jq -r '.items[] | @base64'); do
        _jq() { echo "$row" | base64 -d | jq -r "${1}"; }

        STS_NAME="$(_jq '.metadata.name')"
        STS_HOSTNAME="k8s:${CLUSTER_NAME}:ns:${NS}:sts:${STS_NAME}"

        REPLICAS_DESIRED="$(_jq '.spec.replicas // 0')"
        REPLICAS_READY="$(_jq '.status.readyReplicas // 0')"
        CONTAINERS="$(echo "$row" | base64 -d | jq -c '[.spec.template.spec.containers[]? | {name, image}]')"
        STS_LABELS="$(echo "$row" | base64 -d | jq -c '.metadata.labels // {}')"
        SELECTOR="$(echo "$row" | base64 -d | jq -c '.spec.selector.matchLabels // {}')"
        VCT="$(echo "$row" | base64 -d | jq -c '[.spec.volumeClaimTemplates[]? | {name: .metadata.name, storage: .spec.resources.requests.storage}]')"

        META="$(jq -n \
          --arg k8s_cluster "$CLUSTER_NAME" \
          --arg k8s_namespace "$NS" \
          --arg k8s_workload_type "StatefulSet" \
          --arg k8s_workload_name "$STS_NAME" \
          --argjson k8s_replicas_desired "$REPLICAS_DESIRED" \
          --argjson k8s_replicas_ready "$REPLICAS_READY" \
          --argjson k8s_containers "$CONTAINERS" \
          --argjson k8s_labels "$STS_LABELS" \
          --argjson k8s_selector "$SELECTOR" \
          --argjson k8s_volume_claims "$VCT" \
          '{
            k8s_cluster: $k8s_cluster,
            k8s_namespace: $k8s_namespace,
            k8s_workload_type: $k8s_workload_type,
            k8s_workload_name: $k8s_workload_name,
            k8s_replicas_desired: $k8s_replicas_desired,
            k8s_replicas_ready: $k8s_replicas_ready,
            k8s_containers: $k8s_containers,
            k8s_labels: $k8s_labels,
            k8s_selector: $k8s_selector,
            k8s_volume_claims: $k8s_volume_claims
          }'
        )"

        TAGS="$(build_tags "kubernetes" "workload" "statefulset")"
        register_node "${STS_NAME} (sts)" "workload" "$STS_HOSTNAME" "$NS_HOSTNAME" "" "" "$TAGS" "$META"
      done
    fi

    # DaemonSets
    if $COLLECT_DS; then
      DS_JSON="$(kubectl "${KUBECTL_ARGS[@]}" get daemonsets -n "$NS" -o json 2>/dev/null)"

      for row in $(echo "$DS_JSON" | jq -r '.items[] | @base64'); do
        _jq() { echo "$row" | base64 -d | jq -r "${1}"; }

        DS_NAME="$(_jq '.metadata.name')"
        DS_HOSTNAME="k8s:${CLUSTER_NAME}:ns:${NS}:ds:${DS_NAME}"

        DESIRED="$(_jq '.status.desiredNumberScheduled // 0')"
        READY="$(_jq '.status.numberReady // 0')"
        CONTAINERS="$(echo "$row" | base64 -d | jq -c '[.spec.template.spec.containers[]? | {name, image}]')"
        DS_LABELS="$(echo "$row" | base64 -d | jq -c '.metadata.labels // {}')"
        SELECTOR="$(echo "$row" | base64 -d | jq -c '.spec.selector.matchLabels // {}')"

        META="$(jq -n \
          --arg k8s_cluster "$CLUSTER_NAME" \
          --arg k8s_namespace "$NS" \
          --arg k8s_workload_type "DaemonSet" \
          --arg k8s_workload_name "$DS_NAME" \
          --argjson k8s_desired "$DESIRED" \
          --argjson k8s_ready "$READY" \
          --argjson k8s_containers "$CONTAINERS" \
          --argjson k8s_labels "$DS_LABELS" \
          --argjson k8s_selector "$SELECTOR" \
          '{
            k8s_cluster: $k8s_cluster,
            k8s_namespace: $k8s_namespace,
            k8s_workload_type: $k8s_workload_type,
            k8s_workload_name: $k8s_workload_name,
            k8s_desired: $k8s_desired,
            k8s_ready: $k8s_ready,
            k8s_containers: $k8s_containers,
            k8s_labels: $k8s_labels,
            k8s_selector: $k8s_selector
          }'
        )"

        TAGS="$(build_tags "kubernetes" "workload" "daemonset")"
        register_node "${DS_NAME} (ds)" "workload" "$DS_HOSTNAME" "$NS_HOSTNAME" "" "" "$TAGS" "$META"
      done
    fi
  done
  echo ""
fi

# ── Services ─────────────────────────────────────────────────────────────────

if should_collect "services"; then
  echo "── Services ───────────────────────────────────────────────────────"

  for NS in "${NAMESPACE_LIST[@]}"; do
    NS_HOSTNAME="k8s:${CLUSTER_NAME}:ns:${NS}"

    SVC_JSON="$(kubectl "${KUBECTL_ARGS[@]}" get services -n "$NS" -o json 2>/dev/null)"

    for row in $(echo "$SVC_JSON" | jq -r '.items[] | @base64'); do
      _jq() { echo "$row" | base64 -d | jq -r "${1}"; }

      SVC_NAME="$(_jq '.metadata.name')"
      SVC_HOSTNAME="k8s:${CLUSTER_NAME}:ns:${NS}:svc:${SVC_NAME}"
      SVC_TYPE="$(_jq '.spec.type // "ClusterIP"')"
      CLUSTER_IP="$(_jq '.spec.clusterIP // ""')"
      EXTERNAL_IPS="$(echo "$row" | base64 -d | jq -c '[.spec.externalIPs[]?] // []')"
      PORTS="$(echo "$row" | base64 -d | jq -c '[.spec.ports[]? | {port, targetPort, protocol, nodePort}]')"
      SVC_SELECTOR="$(echo "$row" | base64 -d | jq -c '.spec.selector // {}')"
      SVC_LABELS="$(echo "$row" | base64 -d | jq -c '.metadata.labels // {}')"

      # Use LoadBalancer IP if available, else ClusterIP
      LB_IP="$(echo "$row" | base64 -d | jq -r '[.status.loadBalancer.ingress[]? | .ip // ""] | first // ""')"
      IP="${LB_IP:-$CLUSTER_IP}"
      [[ "$IP" == "None" ]] && IP=""

      META="$(jq -n \
        --arg k8s_cluster "$CLUSTER_NAME" \
        --arg k8s_namespace "$NS" \
        --arg k8s_service_name "$SVC_NAME" \
        --arg k8s_service_type "$SVC_TYPE" \
        --arg k8s_cluster_ip "$CLUSTER_IP" \
        --argjson k8s_external_ips "$EXTERNAL_IPS" \
        --argjson k8s_ports "$PORTS" \
        --argjson k8s_selector "$SVC_SELECTOR" \
        --argjson k8s_labels "$SVC_LABELS" \
        '{
          k8s_cluster: $k8s_cluster,
          k8s_namespace: $k8s_namespace,
          k8s_service_name: $k8s_service_name,
          k8s_service_type: $k8s_service_type,
          k8s_cluster_ip: $k8s_cluster_ip,
          k8s_external_ips: $k8s_external_ips,
          k8s_ports: $k8s_ports,
          k8s_selector: $k8s_selector,
          k8s_labels: $k8s_labels
        }'
      )"

      SVC_TYPE_LOWER="$(echo "$SVC_TYPE" | tr '[:upper:]' '[:lower:]')"
      TAGS="$(build_tags "kubernetes" "k8s-service" "$SVC_TYPE_LOWER")"
      register_node "${SVC_NAME} (svc)" "service" "$SVC_HOSTNAME" "$NS_HOSTNAME" "$IP" "" "$TAGS" "$META"
    done
  done
  echo ""
fi

# ── Ingresses ────────────────────────────────────────────────────────────────

if should_collect "ingresses"; then
  echo "── Ingresses ──────────────────────────────────────────────────────"

  for NS in "${NAMESPACE_LIST[@]}"; do
    NS_HOSTNAME="k8s:${CLUSTER_NAME}:ns:${NS}"

    ING_JSON="$(kubectl "${KUBECTL_ARGS[@]}" get ingresses -n "$NS" -o json 2>/dev/null || echo '{"items":[]}')"

    for row in $(echo "$ING_JSON" | jq -r '.items[] | @base64'); do
      _jq() { echo "$row" | base64 -d | jq -r "${1}"; }

      ING_NAME="$(_jq '.metadata.name')"
      ING_HOSTNAME="k8s:${CLUSTER_NAME}:ns:${NS}:ing:${ING_NAME}"
      ING_CLASS="$(_jq '.spec.ingressClassName // (.metadata.annotations["kubernetes.io/ingress.class"] // "")')"

      # Rules
      RULES="$(echo "$row" | base64 -d | jq -c '[.spec.rules[]? | {host, paths: [.http.paths[]? | {path, backend: ((.backend.service.name // "") + ":" + ((.backend.service.port.number // .backend.service.port.name // "") | tostring))}]}]')"

      # TLS
      TLS="$(echo "$row" | base64 -d | jq -c '[.spec.tls[]?] // []')"

      # LB IP
      LB_IP="$(echo "$row" | base64 -d | jq -r '[.status.loadBalancer.ingress[]? | .ip // ""] | first // ""')"

      # First host as URL
      FIRST_HOST="$(echo "$row" | base64 -d | jq -r '[.spec.rules[]? | .host // ""] | map(select(. != "")) | first // ""')"
      URL=""
      if [[ -n "$FIRST_HOST" ]]; then
        HAS_TLS="$(echo "$row" | base64 -d | jq -r 'if (.spec.tls // [] | length) > 0 then "yes" else "no" end')"
        if [[ "$HAS_TLS" == "yes" ]]; then
          URL="https://${FIRST_HOST}"
        else
          URL="http://${FIRST_HOST}"
        fi
      fi

      ING_LABELS="$(echo "$row" | base64 -d | jq -c '.metadata.labels // {}')"

      META="$(jq -n \
        --arg k8s_cluster "$CLUSTER_NAME" \
        --arg k8s_namespace "$NS" \
        --arg k8s_ingress_name "$ING_NAME" \
        --arg k8s_ingress_class "$ING_CLASS" \
        --argjson k8s_rules "$RULES" \
        --argjson k8s_tls "$TLS" \
        --arg k8s_load_balancer_ip "$LB_IP" \
        --argjson k8s_labels "$ING_LABELS" \
        '{
          k8s_cluster: $k8s_cluster,
          k8s_namespace: $k8s_namespace,
          k8s_ingress_name: $k8s_ingress_name,
          k8s_ingress_class: $k8s_ingress_class,
          k8s_rules: $k8s_rules,
          k8s_tls: $k8s_tls,
          k8s_load_balancer_ip: $k8s_load_balancer_ip,
          k8s_labels: $k8s_labels
        }'
      )"

      TAGS="$(build_tags "kubernetes" "ingress")"
      register_node "${ING_NAME} (ing)" "ingress" "$ING_HOSTNAME" "$NS_HOSTNAME" "$LB_IP" "$URL" "$TAGS" "$META"
    done
  done
  echo ""
fi

# ── Flush batch ─────────────────────────────────────────────────────────────

if [[ "$NODEBYTE_BATCH" == "1" ]]; then
  flush_batch
fi

# ── Summary ──────────────────────────────────────────────────────────────────

echo "Done. $OK ok, $FAIL failed (out of $TOTAL)."
