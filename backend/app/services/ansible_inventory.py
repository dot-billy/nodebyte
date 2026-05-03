from __future__ import annotations

import json
import re
import uuid
from ipaddress import IPv4Address, ip_address

from app.models.node import Node


def sanitize_group_name(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9_]", "_", name.lower())
    s = re.sub(r"_+", "_", s).strip("_")
    if not s:
        return ""
    if s[0].isdigit():
        s = "_" + s
    return s


def _extract_subnet(ip_str: str) -> str | None:
    raw = ip_str.split("/")[0]
    try:
        addr = ip_address(raw)
    except ValueError:
        return None
    if not isinstance(addr, IPv4Address):
        return None
    parts = raw.split(".")
    return f"subnet_{parts[0]}_{parts[1]}_{parts[2]}"


def build_ansible_inventory(
    nodes: list[Node],
    *,
    parent_names: dict[uuid.UUID, str],
    group_strategies: set[str] | None = None,
) -> dict:
    if group_strategies is None:
        group_strategies = {"kind", "tag", "parent", "subnet"}

    groups: dict[str, list[str]] = {}
    hostvars: dict[str, dict] = {}
    seen_hostnames: dict[str, int] = {}
    skipped = 0

    for node in nodes:
        ip = (node.ip or "").strip() or None
        hostname = (node.hostname or "").strip() or None

        if not ip and not hostname:
            skipped += 1
            continue

        ansible_host = ip if ip else hostname
        # Strip CIDR notation for ansible_host
        if ansible_host and "/" in ansible_host:
            ansible_host = ansible_host.split("/")[0]

        inv_hostname = hostname if hostname else node.name

        # Disambiguate collisions
        if inv_hostname in seen_hostnames:
            seen_hostnames[inv_hostname] += 1
            inv_hostname = f"{inv_hostname}_{str(node.id)[:8]}"
        else:
            seen_hostnames[inv_hostname] = 1

        hv: dict = {
            "ansible_host": ansible_host,
            "nodebyte_id": str(node.id),
            "nodebyte_kind": node.kind,
            "nodebyte_name": node.name,
            "nodebyte_tags": list(node.tags or []),
        }
        if node.url:
            hv["nodebyte_url"] = node.url
        if node.notes:
            hv["nodebyte_notes"] = node.notes

        for k, v in (node.meta or {}).items():
            if isinstance(v, (str, int, float, bool)):
                hv[f"nodebyte_meta_{k}"] = v
            else:
                hv[f"nodebyte_meta_{k}"] = json.dumps(v)

        hostvars[inv_hostname] = hv

        # --- Grouping ---

        if "kind" in group_strategies:
            gname = f"kind_{sanitize_group_name(node.kind)}"
            if gname:
                groups.setdefault(gname, []).append(inv_hostname)

        if "tag" in group_strategies:
            for tag in (node.tags or []):
                gname = sanitize_group_name(tag)
                if gname:
                    groups.setdefault(f"tag_{gname}", []).append(inv_hostname)

        if "parent" in group_strategies:
            if node.parent_node_id and node.parent_node_id in parent_names:
                pname = sanitize_group_name(parent_names[node.parent_node_id])
                if pname:
                    groups.setdefault(f"parent_{pname}", []).append(inv_hostname)
            else:
                groups.setdefault("ungrouped", []).append(inv_hostname)

        if "subnet" in group_strategies and ip:
            sn = _extract_subnet(ip)
            if sn:
                groups.setdefault(sn, []).append(inv_hostname)

    inventory: dict = {
        "all": {
            "children": sorted(groups.keys()),
        },
        "_meta": {
            "hostvars": hostvars,
        },
    }

    for gname, hosts in groups.items():
        inventory[gname] = {"hosts": sorted(hosts)}

    if skipped:
        inventory["_nodebyte_skipped"] = skipped

    return inventory
