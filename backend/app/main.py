from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.openapi.utils import get_openapi
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.router import api_router
from app.core.config import settings
from app.core.openapi_filter import VISIBILITY_LEVELS, filter_openapi_schema, resolve_caller_level
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
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    class SecurityHeadersMiddleware(BaseHTTPMiddleware):
        async def dispatch(
            self, request: StarletteRequest, call_next: object
        ) -> StarletteResponse:
            response = await call_next(request)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
            if settings.nodebyte_env != "dev":
                response.headers["Strict-Transport-Security"] = (
                    "max-age=63072000; includeSubDomains"
                )
            return response

    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"ok": True}

    app.include_router(api_router)

    # ------------------------------------------------------------------
    # Role-filtered OpenAPI & docs (disabled in production)
    # ------------------------------------------------------------------
    if settings.nodebyte_env != "production":
        _full_schema: dict | None = None

        @app.get("/openapi.json", include_in_schema=False)
        async def openapi_filtered(
            request: Request,
            db: AsyncSession = Depends(get_db),
        ) -> JSONResponse:
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
            if request.headers.get("authorization") and level == VISIBILITY_LEVELS["public"]:
                raise HTTPException(status_code=401, detail="Invalid or expired docs token")
            return JSONResponse(
                filter_openapi_schema(_full_schema, level),
                headers={"Cache-Control": "private, no-store", "Vary": "Authorization"},
            )

        docs_template = (Path(__file__).parent / "templates" / "api_docs.html").read_text()

        @app.get("/docs", include_in_schema=False)
        async def docs() -> HTMLResponse:
            return HTMLResponse(docs_template.replace("__RENDERER__", "swagger"))

        @app.get("/redoc", include_in_schema=False)
        async def redoc() -> HTMLResponse:
            return HTMLResponse(docs_template.replace("__RENDERER__", "redoc"))

    return app


app = create_app()
