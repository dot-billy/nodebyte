from fastapi import APIRouter

from app.api.routes import admin, auth, invites, members, nodes, register_node, registration_tokens, teams

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(teams.router)
api_router.include_router(nodes.router)
api_router.include_router(members.router)
api_router.include_router(invites.router)
api_router.include_router(registration_tokens.router)
api_router.include_router(register_node.router)
api_router.include_router(admin.router)

