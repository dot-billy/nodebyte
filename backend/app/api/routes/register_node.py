from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.nodes import NodePublic
from app.schemas.registration_tokens import NodeRegisterRequest
from app.services.registration_tokens import get_registration_token_by_value, register_node_with_token

router = APIRouter(tags=["node-registration"])


@router.post("/register-node", response_model=NodePublic, status_code=201)
async def register_node(
    payload: NodeRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    rt = await get_registration_token_by_value(db, token=payload.token)
    if not rt:
        raise HTTPException(status_code=401, detail="Invalid registration token")

    if not rt.is_usable:
        if not rt.is_active:
            raise HTTPException(status_code=403, detail="This registration token has been revoked")
        if rt.is_expired:
            raise HTTPException(status_code=403, detail="This registration token has expired")
        if rt.is_exhausted:
            raise HTTPException(status_code=403, detail="This registration token has reached its usage limit")

    if rt.allowed_kinds and payload.kind not in rt.allowed_kinds:
        raise HTTPException(
            status_code=400,
            detail=f"This token only allows node kinds: {', '.join(rt.allowed_kinds)}",
        )

    data = payload.model_dump(exclude={"token"})
    node = await register_node_with_token(db, rt=rt, data=data)
    await db.commit()
    return node
