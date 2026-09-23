"""Exercise MCP tool discovery and requests sent to the REST API."""

import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

import httpx


with patch.dict(os.environ, {
    "NODEBYTE_API_TOKEN": "nb_pat_test_only",
    "MCP_TOKEN": "test_only",
    "NODEBYTE_TEAM_ID": "",
}):
    spec = importlib.util.spec_from_file_location(
        "nodebyte_mcp_server", Path(__file__).resolve().parents[1] / "server.py"
    )
    server = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(server)


class NodeToolsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.requests = []
        self.responses = []

        def respond(request):
            self.requests.append(request)
            status, body = self.responses.pop(0)
            return httpx.Response(status, json=body)

        self.client = httpx.AsyncClient(
            base_url="https://nodebyte.test",
            headers={"Authorization": "Bearer nb_pat_test_only"},
            transport=httpx.MockTransport(respond),
        )
        self.client_patch = patch.object(server, "_client", self.client)
        self.team_patch = patch.object(server, "_default_team_id", "team-a")
        self.client_patch.start()
        self.team_patch.start()

    async def asyncTearDown(self):
        self.client_patch.stop()
        self.team_patch.stop()
        await self.client.aclose()

    async def call(self, tool_name, **arguments):
        return await server.mcp.call_tool(tool_name, arguments)

    async def test_discovery_exposes_listing_and_relationship_arguments(self):
        tools = {tool.name: tool for tool in await server.mcp.list_tools()}
        listing = tools["list_nodes"].inputSchema["properties"]
        self.assertTrue({"parent_id", "is_orphan", "limit", "offset"} <= listing.keys())
        for name in ("add_node", "update_node"):
            self.assertIn("parent_node_id", tools[name].inputSchema["properties"])

    async def test_list_returns_ids_and_relationships_using_default_team(self):
        nodes = [{"id": "child-id", "parent_node_id": "parent-id", "name": "VM"}]
        self.responses = [(200, nodes)]
        _, structured = await self.call("list_nodes")
        self.assertEqual(structured, {"result": nodes})
        request = self.requests[0]
        self.assertEqual(request.method, "GET")
        self.assertEqual(request.url.path, "/api/teams/team-a/nodes")
        self.assertEqual(dict(request.url.params), {"limit": "50", "offset": "0"})
        self.assertEqual(request.headers["Authorization"], "Bearer nb_pat_test_only")

    async def test_list_forwards_team_parent_pagination_and_filters(self):
        self.responses = [(200, [])]
        await self.call(
            "list_nodes", team_id="team-b", parent_id="parent-id",
            kind=["device", "service"], tags=["prod", "linux"],
            has_url=False, is_orphan=False, limit=200, offset=200,
        )
        request = self.requests[0]
        self.assertEqual(request.url.path, "/api/teams/team-b/nodes")
        params = request.url.params
        self.assertEqual(params["parent_id"], "parent-id")
        self.assertEqual(params["offset"], "200")
        self.assertEqual(params["limit"], "200")
        self.assertEqual(params.get_list("kind"), ["device", "service"])
        self.assertEqual(params.get_list("tags"), ["prod", "linux"])
        self.assertEqual(params["has_url"], "false")
        self.assertEqual(params["is_orphan"], "false")

    async def test_list_resolves_first_team_when_no_default_is_configured(self):
        self.responses = [(200, [{"id": "first-team"}]), (200, [])]
        with patch.object(server, "_default_team_id", None):
            await self.call("list_nodes", is_orphan=True)
        self.assertEqual(self.requests[0].url.path, "/api/teams")
        self.assertEqual(self.requests[1].url.path, "/api/teams/first-team/nodes")
        self.assertEqual(self.requests[1].url.params["is_orphan"], "true")

    async def test_search_combines_text_and_parent_filter(self):
        self.responses = [(200, [])]
        await self.call("search_nodes", q="database", parent_id="parent-id")
        self.assertEqual(self.requests[0].url.params["q"], "database")
        self.assertEqual(self.requests[0].url.params["parent_id"], "parent-id")

    async def test_add_attaches_parent_on_create_and_upsert(self):
        for upsert in (False, True):
            with self.subTest(upsert=upsert):
                self.requests.clear()
                self.responses = (
                    [(200, [{"id": "child-id", "hostname": "vm.example"}])]
                    if upsert else []
                ) + [(200, {"id": "child-id", "parent_node_id": "parent-id"})]
                await self.call(
                    "add_node", name="VM", hostname="vm.example", upsert=upsert,
                    team_id="team-b", parent_node_id="parent-id",
                )
                request = self.requests[-1]
                self.assertEqual(request.method, "PATCH" if upsert else "POST")
                self.assertEqual(request.url.path, "/api/teams/team-b/nodes" + (
                    "/child-id" if upsert else ""
                ))
                self.assertEqual(json.loads(request.content)["parent_node_id"], "parent-id")

    async def test_bulk_add_forwards_parent_for_create_and_update(self):
        self.responses = [
            (200, []), (201, {"id": "new-child"}),
            (200, [{"id": "existing-child", "name": "Existing VM"}]),
            (200, {"id": "existing-child"}),
        ]
        content = await self.call("add_nodes", nodes=[
            {"name": "New VM", "parent_node_id": "parent-id"},
            {"name": "Existing VM", "parent_node_id": "parent-id"},
        ])
        self.assertEqual(json.loads(content[0].text), {"created": 1, "updated": 1, "errors": []})
        for request in (self.requests[1], self.requests[3]):
            self.assertEqual(json.loads(request.content)["parent_node_id"], "parent-id")

    async def test_update_moves_parent_and_omission_preserves_relationship(self):
        for extra in ({"parent_node_id": "new-parent"}, {}, {"parent_node_id": None}):
            with self.subTest(extra=extra):
                self.responses = [(200, {"id": "child-id"})]
                await self.call("update_node", node_id="child-id", name="Renamed", **extra)
                request = self.requests[-1]
                self.assertEqual(request.method, "PATCH")
                body = json.loads(request.content)
                if extra.get("parent_node_id"):
                    self.assertEqual(body["parent_node_id"], "new-parent")
                else:
                    self.assertNotIn("parent_node_id", body)

    async def test_upserts_without_parent_do_not_clear_existing_relationship(self):
        for name, arguments in (
            ("add_node", {"name": "VM"}),
            ("add_nodes", {"nodes": [{"name": "VM"}]}),
        ):
            with self.subTest(tool=name):
                self.responses = [
                    (200, [{"id": "child-id", "name": "VM", "parent_node_id": "parent-id"}]),
                    (200, {"id": "child-id", "parent_node_id": "parent-id"}),
                ]
                await self.call(name, **arguments)
                self.assertEqual(self.requests[-1].method, "PATCH")
                self.assertNotIn("parent_node_id", json.loads(self.requests[-1].content))

    async def test_backend_denials_and_parent_validation_errors_are_propagated(self):
        for tool, arguments, status, detail in (
            ("list_nodes", {"team_id": "other-team"}, 403, "Not a team member"),
            ("list_nodes", {"limit": 201}, 422, "Invalid limit"),
            ("add_node", {"name": "VM", "upsert": False,
                          "parent_node_id": "other-team-parent"}, 400, "Parent node not found"),
            ("update_node", {"node_id": "child-id", "parent_node_id": "child-id"},
             400, "A node cannot be its own parent"),
        ):
            with self.subTest(tool=tool, detail=detail):
                self.responses = [(status, {"detail": detail})]
                with self.assertRaisesRegex(Exception, detail):
                    await self.call(tool, **arguments)


if __name__ == "__main__":
    unittest.main()
