"""Create, read, and unshare immutable public comparison snapshots."""

from __future__ import annotations

import hashlib
import json
import re
import secrets
from typing import TYPE_CHECKING, Any

from fastapi import HTTPException, status

from ..config.settings import settings
from ..models import SharedComparison
from ..schemas import (
    CreateShareRequest,
    CreateShareResponse,
    PublicShareResponse,
    ShareModelInfo,
    ShareResponseItem,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ..models import User

SLUG_LENGTH = 10
SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
SLUG_PATTERN = re.compile(rf"^[{SLUG_ALPHABET}]{{{SLUG_LENGTH}}}$")
PUBLIC_OG_IMAGE = "https://compareintel.com/brand/CompareIntel-social.png"
PUBLIC_SITE_URL = "https://compareintel.com"


def generate_slug() -> str:
    """Return a short URL-safe public identifier."""
    return "".join(secrets.choice(SLUG_ALPHABET) for _ in range(SLUG_LENGTH))


def hash_revoke_token(token: str) -> str:
    """Hash a revoke token with SHA-256 for storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def snippet(text: str, limit: int = 80) -> str:
    """Collapse whitespace and truncate for titles/descriptions."""
    collapsed = " ".join(text.split())
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: max(0, limit - 1)] + "…"


def share_meta(prompt: str, models: list[ShareModelInfo]) -> tuple[str, str]:
    """Build public title and description for a snapshot."""
    names = ", ".join(model.name for model in models)
    prompt_bit = snippet(prompt, 80)
    title = f"CompareIntel comparison: {prompt_bit}"
    description = f"Side-by-side comparison of {names}. Prompt: {snippet(prompt, 140)}"
    return title, description


def public_share_url(slug: str) -> str:
    """Absolute permalink shown to users and crawlers."""
    if settings.environment == "production":
        return f"{PUBLIC_SITE_URL}/c/{slug}"
    base = settings.frontend_url.rstrip("/")
    return f"{base}/c/{slug}"


def canonical_share_url(slug: str) -> str:
    """Canonical URL for OG tags (always the production host when deployed)."""
    if settings.environment == "production":
        return f"{PUBLIC_SITE_URL}/c/{slug}"
    return public_share_url(slug)


def _snapshot_dict(payload: CreateShareRequest) -> dict[str, Any]:
    return {
        "models": [model.model_dump() for model in payload.models],
        "responses": [item.model_dump() for item in payload.responses],
    }


def _parse_snapshot(raw: str) -> tuple[list[ShareModelInfo], list[ShareResponseItem]]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Shared comparison is corrupted",
        ) from exc
    if not isinstance(data, dict):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Shared comparison is corrupted",
        )
    models = [ShareModelInfo.model_validate(item) for item in data.get("models", [])]
    responses = [ShareResponseItem.model_validate(item) for item in data.get("responses", [])]
    return models, responses


def to_public_response(row: SharedComparison) -> PublicShareResponse:
    """Serialize a stored snapshot without owner or revoke fields."""
    models, responses = _parse_snapshot(row.snapshot_json)
    created_at = row.created_at
    if created_at.tzinfo is None:
        # SQLite stores naive datetimes; keep ISO-8601 output stable.
        created_at = created_at.replace(tzinfo=None)
    return PublicShareResponse(
        slug=row.slug,
        prompt=row.prompt,
        models=models,
        responses=responses,
        created_at=created_at,
    )


def get_public_share(db: Session, slug: str) -> SharedComparison:
    """Load a public snapshot or raise 404."""
    if not SLUG_PATTERN.fullmatch(slug):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shared comparison not found"
        )
    row = db.query(SharedComparison).filter(SharedComparison.slug == slug).first()
    if row is None or not row.is_public:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shared comparison not found"
        )
    return row


def create_share(
    db: Session, payload: CreateShareRequest, owner: User | None
) -> CreateShareResponse:
    """Persist an immutable snapshot and return the public URL plus revoke token."""
    revoke_token = secrets.token_urlsafe(32)
    slug = generate_slug()
    for _ in range(8):
        exists = db.query(SharedComparison.id).filter(SharedComparison.slug == slug).first()
        if exists is None:
            break
        slug = generate_slug()
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not allocate a share URL",
        )

    row = SharedComparison(
        slug=slug,
        prompt=payload.prompt,
        snapshot_json=json.dumps(_snapshot_dict(payload), separators=(",", ":")),
        is_public=True,
        owner_user_id=owner.id if owner is not None else None,
        revoke_token_hash=hash_revoke_token(revoke_token),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return CreateShareResponse(
        slug=row.slug, url=public_share_url(row.slug), revoke_token=revoke_token
    )


def unshare(
    db: Session,
    slug: str,
    *,
    revoke_token: str | None,
    owner: User | None,
) -> None:
    """Unpublish a snapshot. Unshared links return 404."""
    if not SLUG_PATTERN.fullmatch(slug):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shared comparison not found"
        )
    row = db.query(SharedComparison).filter(SharedComparison.slug == slug).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Shared comparison not found"
        )

    token_ok = bool(revoke_token) and secrets.compare_digest(
        row.revoke_token_hash, hash_revoke_token(revoke_token or "")
    )
    owner_ok = owner is not None and row.owner_user_id is not None and owner.id == row.owner_user_id
    if not token_ok and not owner_ok:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to unshare")

    if row.is_public:
        row.is_public = False
        db.commit()
