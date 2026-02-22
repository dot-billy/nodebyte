"""Seed 100 random nodes for testing.

Usage:
    NODEBYTE_EMAIL="you@example.com" NODEBYTE_PASSWORD="yourpassword" python3 scripts/seed_nodes.py
"""

import json
import os
import random
import urllib.request

BASE = os.environ.get("NODEBYTE_API_URL", "http://localhost:8000")
EMAIL = os.environ.get("NODEBYTE_EMAIL", "admin@example.com")
PASSWORD = os.environ.get("NODEBYTE_PASSWORD", "password")


def post(path, data, token=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(data).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode())


def get(path, token):
    req = urllib.request.Request(BASE + path)
    req.add_header("Authorization", f"Bearer {token}")
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode())


res = post("/api/auth/login", {"email": EMAIL, "password": PASSWORD})
token = res["access_token"]
print("Logged in.")

teams = get("/api/teams", token)
team_id = teams[0]["id"]
print(f"Team: {teams[0]['name']} ({team_id})")

kinds = ["device", "site", "service", "other"]
adjectives = ["prod", "staging", "dev", "test", "canary", "internal", "edge", "core", "backup", "primary"]
nouns = [
    "web", "api", "db", "cache", "queue", "worker", "proxy", "monitor", "gateway", "vault",
    "auth", "cdn", "mail", "dns", "vpn", "firewall", "lb", "storage", "search", "logs",
]
regions = ["us-east", "us-west", "eu-west", "eu-central", "ap-south", "ap-northeast"]
tag_pool = [
    "linux", "windows", "docker", "k8s", "nginx", "postgres", "redis", "aws", "gcp", "azure",
    "critical", "monitored", "legacy", "new", "ha", "gpu", "arm64", "x86", "ssd", "hdd",
]

for i in range(100):
    adj = random.choice(adjectives)
    noun = random.choice(nouns)
    region = random.choice(regions)
    idx = random.randint(1, 99)
    name = f"{noun}-{adj}-{idx:02d}"

    kind = random.choice(kinds)
    hostname = f"{name}.{region}.internal" if kind in ("device", "service") else None
    ip = f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}" if kind != "site" else None
    url = f"https://{name}.example.com" if kind in ("site", "service") else None
    tags = random.sample(tag_pool, k=random.randint(1, 4))
    tags.append(region)
    notes = random.choice([None, f"Auto-generated node #{i+1}", f"Managed by {adj} team", f"Region: {region}"])

    node = {
        "name": name,
        "kind": kind,
        "hostname": hostname,
        "ip": ip,
        "url": url,
        "tags": tags,
        "notes": notes,
    }
    post(f"/api/teams/{team_id}/nodes", node, token=token)
    if (i + 1) % 25 == 0:
        print(f"  Created {i+1}/100 nodes...")

print("Done! 100 nodes created.")
