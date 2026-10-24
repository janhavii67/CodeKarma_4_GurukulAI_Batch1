from fastapi import APIRouter, Depends
from app.core.permissions import (
    AuthenticatedContext,
    csrf_protect,
    require_permission,
    require_role,
    PERM_KNOWLEDGE_CREATE,
    ROLE_EXPERT,
)

router = APIRouter(prefix="/protected", tags=["Protected Verification"])


@router.get("/expert-action")
def expert_action(
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
):
    return {
        "status": "ok",
        "message": "Authorized expert action executed.",
        "user_id": auth_ctx.user.id,
    }


@router.post("/state-change", dependencies=[Depends(csrf_protect)])
def state_change(
    auth_ctx: AuthenticatedContext = Depends(require_permission(PERM_KNOWLEDGE_CREATE)),
):
    return {
        "status": "ok",
        "message": "CSRF and Permission verified successfully.",
        "user_id": auth_ctx.user.id,
    }
