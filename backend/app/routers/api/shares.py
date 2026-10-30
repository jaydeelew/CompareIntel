"""Public comparison snapshot API (create, read, unshare)."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ...database import get_db
from ...dependencies import get_current_user
from ...models import User
from ...schemas import (
    CreateShareRequest,
    CreateShareResponse,
    PublicShareResponse,
    UnshareRequest,
)
from ...services.share_snapshots import create_share, get_public_share, to_public_response, unshare

router = APIRouter(tags=["API - Shares"])


@router.post("/shares", response_model=CreateShareResponse, status_code=status.HTTP_201_CREATED)
async def create_shared_comparison(
    payload: CreateShareRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
) -> CreateShareResponse:
    """Save an immutable comparison snapshot and return a short public URL."""
    return create_share(db, payload, current_user)


@router.get("/shares/{slug}", response_model=PublicShareResponse)
async def get_shared_comparison(
    slug: str,
    db: Session = Depends(get_db),
) -> PublicShareResponse:
    """Return a public snapshot. Unpublished or unknown slugs 404."""
    row = get_public_share(db, slug)
    return to_public_response(row)


@router.post("/shares/{slug}/unshare", status_code=status.HTTP_204_NO_CONTENT)
async def unshare_comparison(
    slug: str,
    payload: UnshareRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
) -> None:
    """Unpublish a snapshot. Owner auth or the create-time revoke token is required."""
    body = payload or UnshareRequest()
    unshare(db, slug, revoke_token=body.revoke_token, owner=current_user)
