"""Server-rendered HTML for public comparison permalinks (OG/Twitter meta)."""

from __future__ import annotations

import html
from typing import TYPE_CHECKING

from .share_snapshots import (
    PUBLIC_OG_IMAGE,
    canonical_share_url,
    share_meta,
)

if TYPE_CHECKING:
    from ..schemas import PublicShareResponse, ShareResponseItem


def _esc(value: str) -> str:
    return html.escape(value, quote=True)


def render_share_html(snapshot: PublicShareResponse) -> str:
    """Return a read-only HTML page with title, description, and OG tags."""
    title, description = share_meta(snapshot.prompt, snapshot.models)
    canonical = canonical_share_url(snapshot.slug)
    model_names = ", ".join(model.name for model in snapshot.models)
    responses_html = "\n".join(_render_response(item) for item in snapshot.responses)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{_esc(title)}</title>
  <meta name="description" content="{_esc(description)}" />
  <meta name="robots" content="noindex, nofollow" />
  <meta name="googlebot" content="noindex, nofollow" />
  <link rel="canonical" href="{_esc(canonical)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="CompareIntel" />
  <meta property="og:url" content="{_esc(canonical)}" />
  <meta property="og:title" content="{_esc(title)}" />
  <meta property="og:description" content="{_esc(description)}" />
  <meta property="og:image" content="{PUBLIC_OG_IMAGE}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{_esc(title)}" />
  <meta name="twitter:description" content="{_esc(description)}" />
  <meta name="twitter:image" content="{PUBLIC_OG_IMAGE}" />
  <style>
    :root {{ color-scheme: light; }}
    body {{
      margin: 0;
      font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #0f172a;
      line-height: 1.6;
    }}
    header {{
      background: #0f172a;
      color: #fff;
      padding: 1.25rem 1.5rem;
    }}
    header a {{ color: #fff; text-decoration: none; font-weight: 700; }}
    main {{ max-width: 880px; margin: 0 auto; padding: 2rem 1rem 4rem; }}
    h1 {{ font-size: 1.75rem; line-height: 1.3; margin: 0 0 0.75rem; }}
    .lede {{ color: #475569; margin-bottom: 1.5rem; }}
    .prompt, .response {{
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1rem;
    }}
    .prompt h2, .response h2 {{ margin: 0 0 0.75rem; font-size: 1.05rem; }}
    pre {{
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      font-family: inherit;
    }}
    .cta {{
      display: inline-block;
      margin-top: 1.5rem;
      padding: 0.9rem 1.5rem;
      background: #2563eb;
      color: #fff !important;
      text-decoration: none;
      border-radius: 0.5rem;
      font-weight: 600;
    }}
    .note {{ color: #64748b; font-size: 0.875rem; margin-top: 1.5rem; }}
  </style>
</head>
<body>
  <header><a href="/">CompareIntel</a></header>
  <main>
    <h1>Shared comparison</h1>
    <p class="lede">Models: {_esc(model_names)}</p>
    <section class="prompt">
      <h2>Prompt</h2>
      <pre>{_esc(snapshot.prompt)}</pre>
    </section>
    {responses_html}
    <a class="cta" href="/">Try your own comparison</a>
    <p class="note">This is a read-only snapshot. It does not include account information.</p>
  </main>
</body>
</html>
"""


def _render_response(item: ShareResponseItem) -> str:
    return (
        '<section class="response">'
        f"<h2>{_esc(item.model_name)}</h2>"
        f"<pre>{_esc(item.content)}</pre>"
        "</section>"
    )


def render_share_not_found_html() -> str:
    """404 HTML for unpublished or unknown share links."""
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Shared comparison not found - CompareIntel</title>
  <meta name="robots" content="noindex, nofollow" />
</head>
<body>
  <h1>Shared comparison not found</h1>
  <p>This link is invalid or is no longer public.</p>
  <p><a href="/">Try your own comparison</a></p>
</body>
</html>
"""
