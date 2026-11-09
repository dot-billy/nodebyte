"""Exercise the real MCP HTTP transport and authentication after SDK upgrades."""

import asyncio
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

from starlette.testclient import TestClient


class TransportTests(unittest.TestCase):
    def setUp(self):
        # A server owns its session manager; use a fresh instance for each lifespan.
        with patch.dict(os.environ, {
            "NODEBYTE_API_TOKEN": "nb_pat_test_only", "MCP_TOKEN": "test_only",
            "MCP_HOST": "127.0.0.1", "MCP_ALLOWED_HOSTS": "127.0.0.1:*,localhost:*",
            "MCP_ALLOWED_ORIGINS": "", "NODEBYTE_TEAM_ID": "",
        }):
            spec = importlib.util.spec_from_file_location(
                "nodebyte_transport_test", Path(__file__).resolve().parents[1] / "server.py"
            )
            self.server = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.server)

    def tearDown(self):
        asyncio.run(self.server._client.aclose())

    def client(self):
        return TestClient(self.server.create_app(), base_url="http://localhost:8080")

    def headers(self):
        return {
            "Authorization": "Bearer test_only",
            "Accept": "application/json, text/event-stream",
        }

    def initialize(self, client, headers):
        response = client.post("/mcp", headers=headers, json={
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26", "capabilities": {},
                "clientInfo": {"name": "nodebyte-tests", "version": "1"},
            },
        })
        self.assertEqual(response.status_code, 200, response.text)
        if "mcp-session-id" in response.headers:
            headers["Mcp-Session-Id"] = response.headers["mcp-session-id"]
        result = self.result(response)
        headers["MCP-Protocol-Version"] = result["result"]["protocolVersion"]
        ready = client.post("/mcp", headers=headers, json={
            "jsonrpc": "2.0", "method": "notifications/initialized",
        })
        self.assertEqual(ready.status_code, 202, ready.text)
        return result

    def result(self, response):
        if response.headers.get("content-type", "").startswith("application/json"):
            return response.json()
        return json.loads(next(line[6:] for line in response.text.splitlines() if line.startswith("data: ")))

    def test_health_is_public_but_protocol_requires_bearer(self):
        with self.client() as client:
            self.assertEqual(client.get("/healthz").text, "ok")
            for headers in ({}, {"Authorization": "Bearer incorrect"}):
                response = client.post("/mcp", headers=headers, json={})
                self.assertEqual(response.status_code, 401)

    def test_host_and_origin_guards_remain_enabled(self):
        with self.client() as client:
            headers = self.headers()
            response = client.post("/mcp", headers={**headers, "Host": "attacker.example"}, json={})
            self.assertEqual(response.status_code, 421, response.text)
            response = client.post("/mcp", headers={**headers, "Origin": "https://attacker.example"}, json={})
            self.assertEqual(response.status_code, 403, response.text)

    def test_custom_host_allowlist_is_passed_to_transport(self):
        security = self.server._security.model_copy(update={"allowed_hosts": ["nodebyte.example"]})
        with patch.object(self.server, "_security", security), self.client() as client:
            headers = {**self.headers(), "Host": "nodebyte.example"}
            self.initialize(client, headers)
            denied = client.post("/mcp", headers=self.headers(), json={})
            self.assertEqual(denied.status_code, 421)

    def test_initialization_discovery_and_tool_result_keep_wire_contract(self):
        async def backend(method, path, **kwargs):
            self.assertEqual((method, path), ("GET", "/api/teams/team-a/nodes"))
            return [{"id": "node-a", "name": "Example"}]

        with patch.object(self.server, "_req", backend), patch.object(self.server, "_default_team_id", "team-a"), self.client() as client:
            headers = self.headers()
            initialized = self.initialize(client, headers)
            self.assertEqual(initialized["result"]["serverInfo"]["name"], "nodebyte")
            response = client.post("/mcp", headers=headers, json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
            tools = {tool["name"]: tool for tool in self.result(response)["result"]["tools"]}
            self.assertIn("parent_id", tools["list_nodes"]["inputSchema"]["properties"])
            response = client.post("/mcp", headers=headers, json={
                "jsonrpc": "2.0", "id": 3, "method": "tools/call",
                "params": {"name": "list_nodes", "arguments": {}},
            })
            result = self.result(response)["result"]
            self.assertFalse(result.get("isError", False))
            self.assertEqual(result["structuredContent"], {"result": [{"id": "node-a", "name": "Example"}]})

    def test_expected_backend_errors_remain_visible_over_http(self):
        async def denied(*args, **kwargs):
            raise self.server.ToolError("Parent node not found")

        with patch.object(self.server, "_req", denied), patch.object(self.server, "_default_team_id", "team-a"), self.client() as client:
            headers = self.headers()
            self.initialize(client, headers)
            response = client.post("/mcp", headers=headers, json={
                "jsonrpc": "2.0", "id": 4, "method": "tools/call",
                "params": {"name": "add_node", "arguments": {"name": "Example", "upsert": False}},
            })
            result = self.result(response)["result"]
            self.assertTrue(result["isError"])
            self.assertIn("Parent node not found", result["content"][0]["text"])
