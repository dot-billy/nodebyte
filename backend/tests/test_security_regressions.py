from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_mcp_uses_api_token_instead_of_password_bypass() -> None:
    source = (ROOT / "mcp" / "server.py").read_text()

    assert "NODEBYTE_API_TOKEN" in source
    assert "NODEBYTE_PASSWORD" not in source
    assert "NodebyteApp/" not in source

    auth_source = (ROOT / "backend" / "app" / "api" / "routes" / "auth.py").read_text()
    assert "is_native_app" not in auth_source
    assert "NodebyteApp/" not in auth_source


def test_ci_does_not_mask_backend_test_failures() -> None:
    workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text()

    assert "pytest tests/ -v --tb=short || true" not in workflow


def test_codeql_scans_python_and_typescript() -> None:
    workflow = (ROOT / ".github" / "workflows" / "codeql.yml").read_text()

    assert "javascript-typescript" in workflow
    assert "python" in workflow
    assert "security-extended" in workflow


def test_plaintext_invite_and_registration_token_columns_are_gone() -> None:
    invite_model = (ROOT / "backend" / "app" / "models" / "invite.py").read_text()
    registration_model = (
        ROOT / "backend" / "app" / "models" / "registration_token.py"
    ).read_text()

    assert "token_hash" in invite_model
    assert "token_hash" in registration_model
    assert " token:" not in invite_model
    assert " token:" not in registration_model
