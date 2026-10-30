"""Server-rendered public permalink pages for shared comparisons."""

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..database import get_db
from ..services.share_page import render_share_html, render_share_not_found_html
from ..services.share_snapshots import get_public_share, to_public_response

router = APIRouter(tags=["Share pages"])


@router.get("/c/{slug}", response_class=HTMLResponse)
async def shared_comparison_page(
    slug: str,
    db: Session = Depends(get_db),
) -> HTMLResponse:
    """Read-only permalink with title, description, and OG/Twitter meta tags."""
    try:
        row = get_public_share(db, slug)
    except StarletteHTTPException:
        return HTMLResponse(content=render_share_not_found_html(), status_code=404)
    snapshot = to_public_response(row)
    return HTMLResponse(content=render_share_html(snapshot), status_code=200)
