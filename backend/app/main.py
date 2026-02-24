from __future__ import annotations

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.router import api_router
from app.core.config import settings
from app.core.openapi_filter import filter_openapi_schema, resolve_caller_level
from app.db.session import get_db


def create_app() -> FastAPI:
    app = FastAPI(
        title="Nodebyte API",
        version="0.1.0",
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
    )

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

    # ------------------------------------------------------------------
    # Role-filtered OpenAPI & docs
    # ------------------------------------------------------------------
    _full_schema: dict | None = None

    @app.get("/openapi.json", include_in_schema=False)
    async def openapi_filtered(
        request: Request,
        db: AsyncSession = Depends(get_db),
    ) -> dict:
        nonlocal _full_schema
        if _full_schema is None:
            _full_schema = get_openapi(
                title=app.title,
                version=app.version,
                routes=app.routes,
            )
        level = await resolve_caller_level(
            request.headers.get("authorization"),
            db,
        )
        return filter_openapi_schema(_full_schema, level)

    @app.get("/docs", include_in_schema=False)
    async def docs() -> str:
        return get_swagger_ui_html(
            openapi_url="/openapi.json",
            title=f"{app.title} – Docs",
        )

    @app.get("/redoc", include_in_schema=False)
    async def redoc() -> str:
        return get_redoc_html(
            openapi_url="/openapi.json",
            title=f"{app.title} – ReDoc",
        )

    return app


app = create_app()
