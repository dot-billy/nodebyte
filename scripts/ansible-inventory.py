#!/usr/bin/env python3
"""
Ansible dynamic inventory script for Nodebyte.

Usage:
  ansible -i ansible-inventory.py all -m ping
  python3 ansible-inventory.py --list
  python3 ansible-inventory.py --host <hostname>

Environment variables:
  NODEBYTE_URL        Base URL (e.g. https://nodebyte.example.com)
  NODEBYTE_TEAM_ID    Team UUID to export

  Auth (pick one):
    NODEBYTE_TOKEN      Pre-existing JWT access token
    NODEBYTE_EMAIL      Email for login
    NODEBYTE_PASSWORD   Password for login

  Optional:
    NODEBYTE_GROUPS     Comma-separated grouping strategies (kind,tag,parent,subnet)
    NODEBYTE_FILTER_KIND   Comma-separated kinds to include
    NODEBYTE_FILTER_TAGS   Comma-separated tags to filter by
"""

import json
import os
import sys
import urllib.error
import urllib.request


def _env(key, required=True):
    val = os.environ.get(key, "").strip()
    if required and not val:
        sys.stderr.write(f"Error: {key} environment variable is required\n")
        sys.exit(1)
    return val or None


def _api_request(url, token, data=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"HTTP {e.code}: {e.read().decode()}\n")
        sys.exit(1)


def get_token():
    token = _env("NODEBYTE_TOKEN", required=False)
    if token:
        return token
    base = _env("NODEBYTE_URL")
    email = _env("NODEBYTE_EMAIL")
    password = _env("NODEBYTE_PASSWORD")
    resp = _api_request(
        f"{base}/api/auth/login",
        token=None,
        data={"email": email, "password": password},
    )
    return resp["access_token"]


def fetch_inventory(token):
    base = _env("NODEBYTE_URL")
    team_id = _env("NODEBYTE_TEAM_ID")
    params = []
    groups = _env("NODEBYTE_GROUPS", required=False)
    if groups:
        for g in groups.split(","):
            g = g.strip()
            if g:
                params.append(f"groups={urllib.request.quote(g)}")
    kinds = _env("NODEBYTE_FILTER_KIND", required=False)
    if kinds:
        for k in kinds.split(","):
            k = k.strip()
            if k:
                params.append(f"kind={urllib.request.quote(k)}")
    tags = _env("NODEBYTE_FILTER_TAGS", required=False)
    if tags:
        for t in tags.split(","):
            t = t.strip()
            if t:
                params.append(f"tags={urllib.request.quote(t)}")
    qs = f"?{'&'.join(params)}" if params else ""
    url = f"{base}/api/teams/{team_id}/nodes/export/ansible{qs}"
    return _api_request(url, token)


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: ansible-inventory.py --list | --host <hostname>\n")
        sys.exit(1)

    token = get_token()

    if sys.argv[1] == "--list":
        inventory = fetch_inventory(token)
        print(json.dumps(inventory, indent=2))

    elif sys.argv[1] == "--host":
        if len(sys.argv) < 3:
            sys.stderr.write("Usage: ansible-inventory.py --host <hostname>\n")
            sys.exit(1)
        hostname = sys.argv[2]
        inventory = fetch_inventory(token)
        hostvars = inventory.get("_meta", {}).get("hostvars", {}).get(hostname, {})
        print(json.dumps(hostvars, indent=2))

    else:
        sys.stderr.write(f"Unknown argument: {sys.argv[1]}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
