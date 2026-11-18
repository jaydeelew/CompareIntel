"""Parse Open Graph, Twitter Card, and schema.org Product JSON-LD from HTML."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from html import unescape
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup


def _meta_content(
    soup: BeautifulSoup, *, prop: str | None = None, name: str | None = None
) -> str | None:
    """Read meta tag content from Open Graph property and/or name attributes."""
    attrs_to_try: list[tuple[str, str]] = []
    if prop:
        attrs_to_try.append(("property", prop))
        attrs_to_try.append(("name", prop))
    if name:
        attrs_to_try.append(("name", name))
    seen: set[tuple[str, str]] = set()
    for attr, val in attrs_to_try:
        key = (attr, val)
        if key in seen:
            continue
        seen.add(key)
        tag = soup.find("meta", attrs={attr: val})
        if tag and tag.get("content"):
            return str(tag["content"]).strip()
    return None


def _first_json_ld_product(soup: BeautifulSoup) -> dict[str, Any] | None:
    for script in soup.find_all("script", type="application/ld+json"):
        raw = script.string or script.get_text()
        if not raw or not raw.strip():
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        items: list[Any]
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            if "@graph" in data and isinstance(data["@graph"], list):
                items = data["@graph"]
            else:
                items = [data]
        else:
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            t = item.get("@type")
            types: list[str] = []
            if isinstance(t, str):
                types = [t]
            elif isinstance(t, list):
                types = [str(x) for x in t]
            if any(x.lower() == "product" for x in types):
                return item
    return None


def _price_from_product(product: dict[str, Any]) -> tuple[str | None, str | None]:
    offers = product.get("offers")
    if isinstance(offers, list):
        offers = offers[0] if offers else None
    if not isinstance(offers, dict):
        return None, None
    price = offers.get("price")
    currency = offers.get("priceCurrency")
    if price is not None:
        price_str = str(price).strip()
    else:
        price_str = None
    currency_str = str(currency).strip() if currency else None
    return price_str, currency_str


def _site_name_from_url(url: str) -> str | None:
    host = urlparse(url).hostname
    if not host:
        return None
    if host.startswith("www."):
        host = host[4:]
    return host


def _resolve_preview_url(page_url: str, raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = unescape(raw.strip())
    if not cleaned:
        return None
    if cleaned.startswith("//"):
        cleaned = "https:" + cleaned
    if cleaned.startswith(("http://", "https://")):
        return cleaned
    return urljoin(page_url, cleaned)


def _image_from_json_ld(value: Any, page_url: str) -> str | None:
    if isinstance(value, str):
        return _resolve_preview_url(page_url, value)
    if isinstance(value, list):
        for item in value:
            resolved = _image_from_json_ld(item, page_url)
            if resolved:
                return resolved
        return None
    if isinstance(value, dict):
        for key in ("contentUrl", "url", "@id"):
            if value.get(key):
                resolved = _resolve_preview_url(page_url, str(value[key]))
                if resolved:
                    return resolved
        if value.get("image"):
            return _image_from_json_ld(value["image"], page_url)
    return None


def parse_link_preview_metadata(html: str, page_url: str) -> dict[str, Any]:
    """Extract preview fields from HTML head metadata."""
    soup = BeautifulSoup(html, "html.parser")

    title = _meta_content(soup, prop="og:title") or _meta_content(soup, name="twitter:title")
    if not title and soup.title and soup.title.string:
        title = soup.title.string.strip()

    site_name = (
        _meta_content(soup, prop="og:site_name")
        or _meta_content(soup, name="application-name")
        or _site_name_from_url(page_url)
    )

    image = (
        _meta_content(soup, prop="og:image:secure_url")
        or _meta_content(soup, prop="og:image:url")
        or _meta_content(soup, prop="og:image")
        or _meta_content(soup, name="twitter:image")
        or _meta_content(soup, name="twitter:image:src")
    )

    description = (
        _meta_content(soup, prop="og:description")
        or _meta_content(soup, name="twitter:description")
        or _meta_content(soup, name="description")
    )

    price = _meta_content(soup, prop="product:price:amount") or _meta_content(
        soup, prop="og:price:amount"
    )
    currency = _meta_content(soup, prop="product:price:currency") or _meta_content(
        soup, prop="og:price:currency"
    )

    product = _first_json_ld_product(soup)
    if product:
        if not title and product.get("name"):
            title = str(product["name"]).strip()
        if not image and product.get("image"):
            image = _image_from_json_ld(product["image"], page_url)
        if not price or not currency:
            p, c = _price_from_product(product)
            price = price or p
            currency = currency or c

    image = _resolve_preview_url(page_url, image)

    fetched_at = datetime.now(UTC).isoformat()

    return {
        "title": title or _site_name_from_url(page_url) or page_url,
        "site_name": site_name,
        "image": image,
        "description": description,
        "price": price,
        "currency": currency,
        "fetched_at": fetched_at,
        "url": page_url,
    }


def truncate_html_head(html: str, max_bytes: int = 1_048_576) -> str:
    """Keep only head-ish content; cap size for parsing."""
    if len(html.encode("utf-8", errors="ignore")) <= max_bytes:
        chunk = html
    else:
        chunk = html[:max_bytes]
    # Prefer content through </head> when present
    match = re.search(r"</head>", chunk, re.IGNORECASE)
    if match:
        return chunk[: match.end()]
    return chunk
