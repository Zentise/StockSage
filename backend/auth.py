"""One owner, one key. If OWNER_TOKEN is empty (local use) nothing is locked."""

import hmac
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from backend import config


def required() -> bool:
    return bool(config.OWNER_TOKEN)


def check(token: str | None) -> bool:
    if not config.OWNER_TOKEN:
        return True
    return bool(token) and hmac.compare_digest(token.encode(), config.OWNER_TOKEN.encode())


def owner(x_owner_token: Annotated[str | None, Header()] = None) -> None:
    if not check(x_owner_token):
        raise HTTPException(401, "This part is private. Enter your owner key first.")


Owner = Depends(owner)
