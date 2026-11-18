"""SSRF protections for outbound HTTP from the API (link preview, image proxy)."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urljoin, urlparse

BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "localhost.localdomain",
        "metadata.google.internal",
        "metadata.google",
    }
)

_BROWSER_UA = (
    "Mozilla/5.0 (compatible; CompareIntel/1.0; +https://compareintel.com) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def browser_user_agent() -> str:
    return _BROWSER_UA


class SSRFError(ValueError):
    """Raised when a URL or resolved address is not allowed."""


def validate_http_url_scheme(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise SSRFError("Only http and https URLs are allowed")
    if not parsed.hostname:
        raise SSRFError("URL must include a hostname")
    host = parsed.hostname.lower().strip(".")
    if host in BLOCKED_HOSTNAMES:
        raise SSRFError("Blocked hostname")
    if host.endswith(".localhost") or host.endswith(".local"):
        raise SSRFError("Blocked hostname")


def is_blocked_ip(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    if (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    ):
        return True
    # AWS/GCP metadata and carrier-grade NAT edge cases
    if addr.version == 4 and str(addr).startswith("169.254."):
        return True
    return False


def resolve_hostname_ips(hostname: str) -> list[str]:
    """Resolve hostname to IP strings (IPv4 and IPv6)."""
    host = hostname.lower().strip(".")
    try:
        # Literal IP
        ipaddress.ip_address(host)
        return [host]
    except ValueError:
        pass

    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise SSRFError(f"DNS resolution failed: {exc}") from exc

    ips: list[str] = []
    for info in infos:
        sockaddr = info[4]
        if sockaddr and sockaddr[0]:
            ips.append(sockaddr[0])
    if not ips:
        raise SSRFError("DNS resolution returned no addresses")
    return list(dict.fromkeys(ips))


def assert_hostname_resolves_public(hostname: str) -> None:
    for ip in resolve_hostname_ips(hostname):
        if is_blocked_ip(ip):
            raise SSRFError(f"Blocked IP address: {ip}")


def validate_outbound_url(url: str) -> str:
    """Validate scheme/host and ensure DNS resolves only to public IPs."""
    validate_http_url_scheme(url)
    parsed = urlparse(url)
    assert_hostname_resolves_public(parsed.hostname or "")
    return url


def normalize_redirect_url(current_url: str, location: str) -> str:
    joined = urljoin(current_url, location.strip())
    validate_http_url_scheme(joined)
    return joined
