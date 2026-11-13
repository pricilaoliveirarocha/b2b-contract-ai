from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/session", responses={401: {"description": "Invalid token"}, 403: {"description": "Admin disabled"}})
def admin_session(_: Annotated[None, Depends(require_admin)]) -> dict[str, bool]:
    """Lets the interface check a token before showing administrator tools."""
    return {"admin": True}
