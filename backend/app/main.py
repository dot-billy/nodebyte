from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="Nodebyte API", version="0.1.0")

    origins = [settings.frontend_origin.rstrip("/")]
    if settings.nodebyte_env == "dev":
        origins.extend(["http://localhost:3000", "http://127.0.0.1:3000", "http://100.65.0.5:3000"])
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(set(origins)),
        allow_origin_regex=r"^chrome-extension://.*$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"ok": True}

    app.include_router(api_router)
    return app


app = create_app()

