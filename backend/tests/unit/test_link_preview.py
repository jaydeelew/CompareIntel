"""Unit tests for link preview metadata, SSRF, and caching."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.unit

from unittest.mock import patch

from app.services.link_preview_cache import (
    get_cached_preview,
    negative_preview_payload,
    set_cached_preview,
)
from app.services.link_preview_metadata import parse_link_preview_metadata
from app.utils.ssrf import (
    SSRFError,
    assert_hostname_resolves_public,
    is_blocked_ip,
    validate_http_url_scheme,
)


class TestBlockedIps:
    def test_blocks_private_ipv4(self) -> None:
        assert is_blocked_ip("10.0.0.1")
        assert is_blocked_ip("192.168.0.1")
        assert is_blocked_ip("127.0.0.1")

    def test_blocks_link_local_and_metadata(self) -> None:
        assert is_blocked_ip("169.254.169.254")
        assert is_blocked_ip("fe80::1")

    def test_allows_public_ipv4(self) -> None:
        assert not is_blocked_ip("8.8.8.8")


class TestUrlValidation:
    def test_rejects_non_http_schemes(self) -> None:
        with pytest.raises(SSRFError):
            validate_http_url_scheme("file:///etc/passwd")

    def test_rejects_localhost_host(self) -> None:
        with pytest.raises(SSRFError):
            validate_http_url_scheme("http://localhost/test")

    def test_resolved_private_ip_blocked(self) -> None:
        with patch("app.utils.ssrf.resolve_hostname_ips", return_value=["127.0.0.1"]):
            with pytest.raises(SSRFError):
                assert_hostname_resolves_public("example.com")


PRODUCT_HTML = """
<html><head>
<title>Shop Item</title>
<meta property="og:title" content="Cool Gadget" />
<meta property="og:site_name" content="Example Shop" />
<meta property="og:image" content="https://cdn.example.com/gadget.jpg" />
<meta property="product:price:amount" content="29.99" />
<meta property="product:price:currency" content="USD" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Cool Gadget","image":"https://cdn.example.com/gadget.jpg","offers":{"@type":"Offer","price":"29.99","priceCurrency":"USD"}}
</script>
</head><body></body></html>
"""


class TestMetadataParsing:
    def test_parses_og_and_json_ld_product(self) -> None:
        data = parse_link_preview_metadata(PRODUCT_HTML, "https://shop.example.com/item")
        assert data["title"] == "Cool Gadget"
        assert data["site_name"] == "Example Shop"
        assert data["image"] == "https://cdn.example.com/gadget.jpg"
        assert data["price"] == "29.99"
        assert data["currency"] == "USD"
        assert data["fetched_at"]


class TestLinkPreviewCache:
    def test_round_trip_cache(self) -> None:
        url = "https://unique-cache-test.example/foo"
        payload = negative_preview_payload(url, "test")
        set_cached_preview(url, payload, success=False)
        cached = get_cached_preview(url)
        assert cached is not None
        assert cached.get("url") == url


@pytest.mark.asyncio
async def test_link_preview_route_uses_cache() -> None:
    from fastapi import Request

    from app.routers.api.link_preview import link_preview

    url = "https://cached-route.example/product"
    payload = {
        "title": "Cached",
        "site_name": "cached-route.example",
        "image": None,
        "description": None,
        "price": None,
        "currency": None,
        "fetched_at": "2026-01-01T00:00:00+00:00",
        "url": url,
    }
    set_cached_preview(url, payload, success=True)

    scope = {"type": "http", "headers": [], "method": "GET", "path": "/"}
    request = Request(scope)
    with (
        patch("app.routers.api.link_preview.check_rate_limit"),
        patch("app.routers.api.link_preview._validate_target_url", return_value=url),
    ):
        result = await link_preview(request=request, url=url, user=None)
    assert result["title"] == "Cached"
