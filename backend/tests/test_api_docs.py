from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
import uuid

from fastapi.testclient import TestClient
import pytest

from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import get_db
from app.main import create_app
from app.models.api_token import ApiToken
from app.models.user import User


NODES_PATH = "/api/teams/{team_id}/nodes"


@pytest.fixture
def docs_client():
    app = create_app()
    db = AsyncMock()

    async def fake_db():
        yield db

    app.dependency_overrides[get_db] = fake_db
    with TestClient(app) as client:
        yield client, db


def configure_user(db, *, role="viewer", token_type="personal", superuser=False,
                   revoked=False, expired=False, active=True):
    user = User(id=uuid.uuid4(), email="docs@example.com", is_active=active,
                is_superuser=superuser)
    if token_type == "personal":
        record = ApiToken(
            user=user, user_id=user.id, name="docs", token_hash="test",
            token_prefix="nb_pat_test", last_used_at=datetime.now(UTC),
            revoked_at=datetime.now(UTC) if revoked else None,
            expires_at=datetime.now(UTC) - timedelta(seconds=1) if expired else None,
        )
        token = "nb_pat_docs_test"
    else:
        record = user
        token = create_access_token(user_id=user.id)
    db.execute.side_effect = [
        SimpleNamespace(scalar_one_or_none=lambda: record),
        SimpleNamespace(all=lambda: [(role,)] if role else []),
    ]
    return {"Authorization": f"Bearer {token}"}


def test_anonymous_schema_is_public_and_does_not_query_users(docs_client):
    client, db = docs_client
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "/api/register-node" in response.json()["paths"]
    assert NODES_PATH not in response.json()["paths"]
    db.execute.assert_not_awaited()


@pytest.mark.parametrize("token_type", ["personal", "access"])
@pytest.mark.parametrize("role", ["viewer", "member", "owner"])
def test_schema_accepts_both_token_types_and_preserves_role_filtering(
    docs_client, token_type, role,
):
    client, db = docs_client
    headers = configure_user(db, role=role, token_type=token_type)
    response = client.get("/openapi.json", headers=headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert "Authorization" in response.headers["vary"].split(", ")
    paths = response.json()["paths"]
    assert paths[NODES_PATH]["get"]["summary"] == "List nodes"
    assert "parent_id" in {p["name"] for p in paths[NODES_PATH]["get"]["parameters"]}
    assert ("post" in paths[NODES_PATH]) == (role != "viewer")
    assert not any(path.startswith("/api/admin") for path in paths)
    # The full schema cache must never cause authenticated paths to leak later.
    assert NODES_PATH not in client.get("/openapi.json").json()["paths"]


def test_superuser_docs_include_admin_routes(docs_client):
    client, db = docs_client
    response = client.get("/openapi.json", headers=configure_user(db, superuser=True))
    assert response.status_code == 200
    assert any(path.startswith("/api/admin") for path in response.json()["paths"])


def test_account_without_membership_does_not_see_node_routes(docs_client):
    client, db = docs_client
    response = client.get("/openapi.json", headers=configure_user(db, role=None))
    assert response.status_code == 200
    assert "/api/teams" in response.json()["paths"]
    assert NODES_PATH not in response.json()["paths"]


@pytest.mark.parametrize("state", [{"revoked": True}, {"expired": True}, {"active": False}])
def test_invalid_personal_token_is_rejected(docs_client, state):
    client, db = docs_client
    response = client.get("/openapi.json", headers=configure_user(db, **state))
    assert response.status_code == 401


def test_unrecognized_token_is_rejected(docs_client):
    client, _ = docs_client
    assert client.get("/openapi.json", headers={"Authorization": "Bearer invalid"}).status_code == 401


@pytest.mark.parametrize("path,renderer", [("/docs", "swagger"), ("/redoc", "redoc")])
def test_docs_pages_offer_schema_authentication(docs_client, path, renderer):
    client, _ = docs_client
    response = client.get(path)
    assert response.status_code == 200
    assert "Load my endpoints" in response.text
    assert f'const renderer = "{renderer}";' in response.text
    assert "__RENDERER__" not in response.text


def test_listing_still_requires_authentication(docs_client):
    client, _ = docs_client
    response = client.get(f"/api/teams/{uuid.uuid4()}/nodes")
    assert response.status_code == 401


def test_docs_remain_disabled_in_production(monkeypatch):
    monkeypatch.setattr(settings, "nodebyte_env", "production")
    with TestClient(create_app()) as client:
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert client.get(path).status_code == 404
