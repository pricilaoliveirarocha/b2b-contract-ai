"""Administrator access.

There are no user accounts yet, so administrator actions are unlocked by a shared secret
(`ADMIN_TOKEN` in .env) sent in the `X-Admin-Token` header. The check happens here, on the
server: hiding buttons in the interface protects nothing. When real logins arrive, replace
`require_admin` with a role check and keep the routes as they are.
"""

from secrets import compare_digest
from typing import Annotated

from fastapi import Header, HTTPException, status

from app.config import get_settings


def require_admin(x_admin_token: Annotated[str | None, Header()] = None) -> None:
    expected = get_settings().admin_token
    if not expected:
        # Fail closed: without a configured token nobody is an administrator.
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Administrator actions are disabled: no ADMIN_TOKEN is configured.",
        )
    # Constant-time comparison so the response time doesn't leak how much of the token matched.
    if not x_admin_token or not compare_digest(x_admin_token.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid administrator token.")
