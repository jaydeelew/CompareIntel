"""No-login, token-based unsubscribe for CompareIntel's no-reply notification emails.

Covers the "newly added models" notification and any peer bulk/no-reply emails
sent to users (as opposed to essential, user-initiated transactional emails
like email verification or password reset, which are not gated by this
preference). The single `UserPreference.email_notifications` flag already
used by the user-facing Settings page is reused as the source of truth, so
unsubscribing here and re-enabling it from Settings while logged in stay in
sync.
"""

from __future__ import annotations

import html
from typing import TYPE_CHECKING, Any
from urllib.parse import quote

from ..auth import create_unsubscribe_token, verify_unsubscribe_token
from ..config.settings import settings

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ..models import User

# Same production host used for other backend-rendered public links (see
# app/services/share_snapshots.py). Kept as a local constant (rather than an
# import) to avoid coupling this module to the sharing feature.
PUBLIC_SITE_URL = "https://compareintel.com"

# Mounted under both /api/v1 and /api (see app/main.py); either resolves to the
# same handler, so the shorter /api path is used for the link shown to users.
UNSUBSCRIBE_API_PATH = "/api/auth/unsubscribe"


class UnsubscribeTokenError(Exception):
    """Raised when an unsubscribe token is missing, malformed, expired, or stale."""


def _public_api_base_url() -> str:
    if settings.environment == "production":
        return PUBLIC_SITE_URL
    return settings.frontend_url.rstrip("/")


def build_unsubscribe_url(user_id: int, email: str) -> str:
    """Return an absolute, no-login unsubscribe link for one recipient."""
    token = create_unsubscribe_token(user_id, email)
    return f"{_public_api_base_url()}{UNSUBSCRIBE_API_PATH}?token={quote(token)}"


def unsubscribe_email_block(user_id: int, email: str) -> dict[str, Any]:
    """Return SMTP headers plus HTML/plain-text footer snippets for one recipient.

    - `headers` adds List-Unsubscribe / List-Unsubscribe-Post so mail clients
      (Gmail, Outlook, etc.) can offer native one-click unsubscribe (RFC 8058).
    - `html` / `text` are ready-to-insert footer fragments for the HTML body and
      the plain-text alternative part, respectively.
    """
    url = build_unsubscribe_url(user_id, email)
    escaped_url = html.escape(url, quote=True)
    return {
        "headers": {
            "List-Unsubscribe": f"<{url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        "html": (
            '<p style="margin-top:24px;text-align:center;font-size:12px;color:#999 !important;">'
            f'<a href="{escaped_url}" style="color:#999 !important;text-decoration:underline;">'
            "Unsubscribe</a> from these notification emails.</p>"
        ),
        "text": f"\n\nUnsubscribe from these notification emails: {url}\n",
    }


def resolve_unsubscribe_token(token: str | None) -> tuple[int, str]:
    """Return the (user_id, email) a valid unsubscribe token was issued for.

    Raises UnsubscribeTokenError for a missing, malformed, or expired token.
    """
    if not token:
        raise UnsubscribeTokenError("Missing unsubscribe token")

    payload = verify_unsubscribe_token(token)
    if not payload:
        raise UnsubscribeTokenError("Invalid or expired unsubscribe link")

    sub = payload.get("sub")
    email = payload.get("email")
    if not sub or not email:
        raise UnsubscribeTokenError("Invalid or expired unsubscribe link")

    try:
        user_id = int(sub)
    except (TypeError, ValueError) as exc:
        raise UnsubscribeTokenError("Invalid or expired unsubscribe link") from exc

    return user_id, str(email)


def set_email_notifications(db: Session, user_id: int, email: str, enabled: bool) -> User | None:
    """Persist the opt-in/opt-out notification preference for `user_id`.

    Returns the updated User, or None if the id/email pair no longer matches a
    real account (e.g. the account was deleted, or the email changed since the
    token was issued).
    """
    from ..models import User, UserPreference

    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.email.lower() != email.lower():
        return None

    preferences = user.preferences
    if not preferences:
        preferences = UserPreference(user_id=user.id)
        db.add(preferences)
        db.flush()

    preferences.email_notifications = enabled
    db.commit()
    db.refresh(user)
    return user


def _page(title: str, heading: str, message_html: str, extra_html: str = "") -> str:
    """Minimal, self-contained confirmation/error page (no external assets)."""
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(title)}</title>
  <meta name="robots" content="noindex, nofollow" />
  <style>
    :root {{ color-scheme: light; }}
    body {{
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Arial, "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #0f172a;
    }}
    .card {{
      max-width: 440px;
      margin: 24px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 2rem;
      text-align: center;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }}
    h1 {{ font-size: 1.35rem; margin: 0 0 0.75rem; color: #1e40af; }}
    p {{ color: #475569; line-height: 1.6; margin: 0.5rem 0; }}
    a {{ color: #0ea5e9; text-decoration: none; font-weight: 600; }}
    a:hover {{ text-decoration: underline; }}
    .muted {{ font-size: 0.85rem; color: #94a3b8; margin-top: 1.5rem; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>{html.escape(heading)}</h1>
    <p>{message_html}</p>
    {extra_html}
  </div>
</body>
</html>
"""


def render_unsubscribed_page(resubscribe_href: str) -> str:
    """Confirmation page shown immediately after a successful unsubscribe."""
    safe_href = html.escape(resubscribe_href, quote=True)
    return _page(
        title="Unsubscribed - CompareIntel",
        heading="You've been unsubscribed",
        message_html=(
            "You will no longer receive new-model and similar notification emails "
            "from CompareIntel. Account security emails (like password resets) are unaffected."
        ),
        extra_html=(
            f'<p class="muted">Didn\'t mean to? <a href="{safe_href}">Resubscribe</a>.</p>'
        ),
    )


def render_resubscribed_page() -> str:
    """Confirmation page shown after successfully undoing an unsubscribe."""
    return _page(
        title="Resubscribed - CompareIntel",
        heading="You're resubscribed",
        message_html=("You'll start receiving notification emails from CompareIntel again."),
    )


def render_invalid_token_page() -> str:
    """Error page shown for a missing, malformed, or expired unsubscribe link."""
    return _page(
        title="Unsubscribe link expired - CompareIntel",
        heading="This unsubscribe link is invalid or has expired",
        message_html=(
            "This can happen if the link was already used, or is very old. Email "
            '<a href="mailto:support@compareintel.com">support@compareintel.com</a> '
            "and we'll unsubscribe you by hand."
        ),
    )
