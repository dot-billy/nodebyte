from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.rate_limit import (
    rate_limit_register_node,
    rate_limit_register_nodes_batch,
)
from app.db.session import get_db
from app.models.node import Node
from app.schemas.nodes import NodePublic
from app.schemas.registration_tokens import (
    BatchNodeRegisterRequest,
    BatchNodeRegisterResponse,
    BatchNodeResult,
    NodeRegisterRequest,
)
from app.services.registration_tokens import (
    get_registration_token_by_value,
    register_or_update_node_with_token,
)

router = APIRouter(tags=["node-registration"])
logger = logging.getLogger(__name__)


async def _validate_token(db: AsyncSession, token: str):
    rt = await get_registration_token_by_value(db, token=token)
    if not rt:
        raise HTTPException(status_code=401, detail="Invalid registration token")
    if not rt.is_active:
        raise HTTPException(status_code=403, detail="This registration token has been revoked")
    if rt.is_expired:
        raise HTTPException(status_code=403, detail="This registration token has expired")
    return rt


@router.post("/register-node", response_model=NodePublic, status_code=201)
async def register_node(
    payload: NodeRegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_register_node),
):
    rt = await _validate_token(db, payload.token)

    if rt.allowed_kinds and payload.kind not in rt.allowed_kinds:
        raise HTTPException(
            status_code=400,
            detail=f"This token only allows node kinds: {', '.join(rt.allowed_kinds)}",
        )

    data = payload.model_dump(exclude={"token"})
    allow_create = not rt.is_exhausted
    node, created = await register_or_update_node_with_token(db, rt=rt, data=data, allow_create=allow_create)
    if node is None:
        raise HTTPException(status_code=403, detail="This registration token has reached its usage limit")

    if not created:
        response.status_code = 200

    await db.commit()
    result = await db.execute(
        select(Node)
        .options(joinedload(Node.owner), joinedload(Node.reviewed_by))
        .where(Node.id == node.id)
        .execution_options(populate_existing=True)
    )
    registered = result.scalar_one()
    await db.refresh(registered, attribute_names=["owner", "reviewed_by"])
    return registered


@router.post("/register-nodes", response_model=BatchNodeRegisterResponse)
async def register_nodes_batch(
    request: Request,
    payload: BatchNodeRegisterRequest,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_register_nodes_batch),
):
    rt = await _validate_token(db, payload.token)

    created = 0
    updated = 0
    skipped = 0
    errors = 0
    results: list[BatchNodeResult] = []

    for item in payload.nodes:
        if rt.allowed_kinds and item.kind not in rt.allowed_kinds:
            errors += 1
            results.append(BatchNodeResult(
                name=item.name, hostname=item.hostname, status="error",
                detail=f"Kind '{item.kind}' not allowed by this token",
            ))
            continue

        data = item.model_dump()
        allow_create = not rt.is_exhausted
        try:
            node, was_created = await register_or_update_node_with_token(
                db, rt=rt, data=data, allow_create=allow_create,
            )
        except Exception:
            logger.exception("Node registration failed for batch item")
            errors += 1
            results.append(BatchNodeResult(
                name=item.name, hostname=item.hostname, status="error",
                detail="Registration failed",
            ))
            continue

        if node is None:
            skipped += 1
            results.append(BatchNodeResult(
                name=item.name, hostname=item.hostname, status="skipped",
                detail="Token has reached its usage limit",
            ))
            continue

        if was_created:
            created += 1
        else:
            updated += 1
        results.append(BatchNodeResult(
            name=item.name, hostname=item.hostname,
            status="created" if was_created else "updated",
            node_id=node.id,
        ))

    await db.commit()

    return BatchNodeRegisterResponse(
        created=created, updated=updated, skipped=skipped, errors=errors,
        results=results,
    )
