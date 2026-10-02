"""Exercise resource organization against PostgreSQL, including tenant boundaries."""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_current_user
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import Membership, Team, User


@pytest.fixture
def workspace():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL integration checks")
    # Each test gets a separate schema, including all constraints and indexes.
    schema = "knowledge_test_" + uuid.uuid4().hex
    admin = create_async_engine(url, poolclass=NullPool)
    from sqlalchemy import text

    async def create_schema():
        async with admin.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))

    asyncio.run(create_schema())
    engine = create_async_engine(url, poolclass=NullPool, connect_args={"server_settings": {"search_path": schema}})
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    user_id, other_id, viewer_id, team_id, other_team_id = [uuid.uuid4() for _ in range(5)]
    actor = {"id": user_id}

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with sessions() as db:
            db.add_all([User(id=i, email=f"{i}@example.test", password_hash="unused") for i in [user_id, other_id, viewer_id]])
            await db.flush()
            db.add_all([Team(id=team_id, name="Team A", slug="team-a", created_by_id=user_id), Team(id=other_team_id, name="Team B", slug="team-b", created_by_id=other_id)])
            await db.flush()
            db.add_all([Membership(team_id=team_id, user_id=user_id, role="owner"), Membership(team_id=team_id, user_id=viewer_id, role="viewer"), Membership(team_id=other_team_id, user_id=other_id, role="owner")])
            await db.commit()

    asyncio.run(setup())

    async def db_override():
        async with sessions() as db:
            yield db

    async def user_override():
        async with sessions() as db:
            return await db.get(User, actor["id"])

    old = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_user] = user_override
    client = TestClient(app)
    base = f"/api/teams/{team_id}"
    try:
        yield client, base, actor, {"owner": user_id, "other": other_id, "viewer": viewer_id, "other_team": other_team_id}
    finally:
        client.close()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(old)
        async def teardown():
            async with admin.begin() as conn:
                await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            await engine.dispose()
            await admin.dispose()
        asyncio.run(teardown())


def resource(client, base, name="Runbook", **fields):
    response = client.post(base + "/nodes", json={"name": name, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def collection(client, base, name="Home lab"):
    response = client.post(base + "/collections", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def test_optional_many_to_many_collections_and_safe_deletion(workspace):
    client, base, _, _ = workspace
    node = resource(client, base, kind="document", summary="Useful on its own")
    assert client.get(base + "/collections", params={"node_id": node["id"]}).json() == []
    groups = [collection(client, base, name) for name in ["Home lab", "Operations"]]
    for group in groups:
        endpoint = f'{base}/collections/{group["id"]}/nodes/{node["id"]}'
        assert client.put(endpoint).status_code == 204
        assert client.put(endpoint).status_code == 204
        assert client.get(f'{base}/collections/{group["id"]}').json()["resource_count"] == 1
    assert len(client.get(base + "/collections", params={"node_id": node["id"]}).json()) == 2
    assert client.delete(f'{base}/collections/{groups[0]["id"]}').status_code == 204
    assert client.get(f'{base}/nodes/{node["id"]}').status_code == 200
    assert len(client.get(base + "/collections", params={"node_id": node["id"]}).json()) == 1
    assert client.delete(f'{base}/nodes/{node["id"]}').status_code == 204
    assert client.get(f'{base}/collections/{groups[1]["id"]}').json()["resource_count"] == 0


def test_links_are_bidirectional_idempotent_and_cleaned_on_delete(workspace):
    client, base, _, _ = workspace
    device, doc = resource(client, base, "NAS"), resource(client, base, "Backups", kind="document")
    left, right = device["id"], doc["id"]
    assert client.put(f"{base}/nodes/{left}/links/{right}").status_code == 204
    assert client.put(f"{base}/nodes/{right}/links/{left}").status_code == 204
    assert [n["id"] for n in client.get(f"{base}/nodes/{left}/links").json()] == [right]
    assert [n["id"] for n in client.get(f"{base}/nodes/{right}/links").json()] == [left]
    assert client.put(f"{base}/nodes/{left}/links/{left}").status_code == 400
    assert client.delete(f"{base}/nodes/{right}/links/{left}").status_code == 204
    assert client.get(f"{base}/nodes/{left}/links").json() == []
    client.put(f"{base}/nodes/{left}/links/{right}")
    client.delete(f"{base}/nodes/{right}")
    assert client.get(f"{base}/nodes/{left}/links").json() == []


def test_cross_team_resources_and_collections_are_not_exposed(workspace):
    client, base, actor, ids = workspace
    own = resource(client, base)
    own_group = collection(client, base)
    actor["id"] = ids["other"]
    other_base = f'/api/teams/{ids["other_team"]}'
    foreign = resource(client, other_base)
    group = collection(client, other_base)
    actor["id"] = ids["owner"]
    assert client.get(other_base + "/collections").status_code == 404
    assert client.get(f'{base}/collections/{group["id"]}').status_code == 404
    assert client.get(base + "/nodes", params={"collection_id": group["id"]}).status_code == 404
    assert client.put(f'{base}/collections/{own_group["id"]}/nodes/{foreign["id"]}').status_code == 404
    assert client.put(f'{base}/collections/{group["id"]}/nodes/{own["id"]}').status_code == 404
    assert client.put(f'{base}/nodes/{own["id"]}/links/{foreign["id"]}').status_code == 404
    assert client.get(f'{base}/nodes/{foreign["id"]}/links').status_code == 404


def test_viewer_can_read_but_cannot_curate(workspace):
    client, base, actor, ids = workspace
    node, related = resource(client, base), resource(client, base, "Another")
    group = collection(client, base)
    actor["id"] = ids["viewer"]
    assert client.get(base + "/collections").status_code == 200
    assert client.get(f'{base}/nodes/{node["id"]}/links').status_code == 200
    assert client.post(base + "/collections", json={"name": "Forbidden"}).status_code == 403
    assert client.put(f'{base}/collections/{group["id"]}', json={"name": "Forbidden"}).status_code == 403
    for method in [client.put, client.delete]:
        assert method(f'{base}/collections/{group["id"]}/nodes/{node["id"]}').status_code == 403
        assert method(f'{base}/nodes/{node["id"]}/links/{related["id"]}').status_code == 403
    assert client.delete(f'{base}/collections/{group["id"]}').status_code == 403
    assert client.patch(f'{base}/nodes/{node["id"]}', json={"summary": "Forbidden"}).status_code == 403


def test_search_dates_and_resource_scopes(workspace):
    client, base, _, _ = workspace
    date = "2026-09-23T09:15:00-04:00"
    doc = resource(client, base, "Recovery", kind="document", summary="Restore snapshots", notes="Keep the recovery keys offline", tags=["Storage"], document_updated_at=date)
    device = resource(client, base, "NAS", kind="device")
    group = collection(client, base)
    client.put(f'{base}/collections/{group["id"]}/nodes/{doc["id"]}')
    for query in ["snapshots", "offline", "Storage"]:
        assert [r["id"] for r in client.get(base + "/nodes", params={"q": query}).json()] == [doc["id"]]
    assert [r["id"] for r in client.get(base + "/nodes", params={"scope": "inventory"}).json()] == [device["id"]]
    assert [r["id"] for r in client.get(base + "/nodes", params={"scope": "knowledge", "collection_id": group["id"]}).json()] == [doc["id"]]
    updated = client.patch(f'{base}/nodes/{doc["id"]}', json={"summary": "Edited summary"}).json()
    assert datetime.fromisoformat(updated["document_updated_at"]) == datetime.fromisoformat(doc["document_updated_at"])
    assert updated["notes"] == doc["notes"]
    # A saved document does not become a stale infrastructure node.
    assert doc["id"] not in [r["id"] for r in client.get(base + "/nodes/stale-review").json()["nodes"]]


def test_collection_validation_and_pagination(workspace):
    client, base, _, _ = workspace
    assert client.post(base + "/collections", json={"name": "   "}).status_code == 422
    for name in ["Gamma", "Alpha", "Beta"]:
        collection(client, base, name)
    assert [c["name"] for c in client.get(base + "/collections", params={"limit": 1, "offset": 1}).json()] == ["Beta"]
