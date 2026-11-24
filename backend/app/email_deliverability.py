"""Skip recipients whose domains cannot receive mail.

RFC 2606 and RFC 6761 reserve ``example``, ``test``, ``invalid``, and ``localhost``.
Automated signups also use ``test.com``, which hard-bounces at the mail provider.

``MAIL_UNDELIVERABLE_DOMAINS`` optionally replaces the default suffix list.
A blank value keeps the defaults. Each entry matches that domain and any subdomain.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING, TypeVar

if TYPE_CHECKING:
    from collections.abc import Iterable

logger = logging.getLogger(__name__)

MAIL_UNDELIVERABLE_DOMAINS_ENV = "MAIL_UNDELIVERABLE_DOMAINS"

# Single-label suffixes cover the reserved names and their subdomains:
# test / *.test, example / *.example, invalid / *.invalid, localhost / *.localhost.
DEFAULT_UNDELIVERABLE_DOMAIN_SUFFIXES: tuple[str, ...] = (
    "test.com",
    "example.com",
    "example.net",
    "example.org",
    "localhost",
    "test",
    "example",
    "invalid",
)

T = TypeVar("T")


def undeliverable_domain_suffixes() -> frozenset[str]:
    """Return the active suffix list, honoring a non-blank env override."""
    raw = os.getenv(MAIL_UNDELIVERABLE_DOMAINS_ENV)
    if raw is None or not raw.strip():
        return frozenset(DEFAULT_UNDELIVERABLE_DOMAIN_SUFFIXES)

    suffixes: set[str] = set()
    for part in raw.split(","):
        suffix = part.strip().lower().strip(".")
        if suffix:
            suffixes.add(suffix)
    return frozenset(suffixes)


def address_text(recipient: object) -> str:
    """Return the mailbox from a string or an object with an ``email`` attribute."""
    if isinstance(recipient, str):
        text = recipient.strip()
    else:
        email = getattr(recipient, "email", None)
        text = str(email if email is not None else recipient).strip()
    if "<" in text and text.endswith(">"):
        text = text[text.rfind("<") + 1 : -1].strip()
    return text


def recipient_domain(recipient: object) -> str | None:
    address = address_text(recipient).lower()
    if "@" not in address:
        return None
    domain = address.rsplit("@", 1)[1].strip().rstrip(".")
    if not domain or any(character.isspace() for character in domain):
        return None
    return domain


def is_undeliverable_email(recipient: object) -> bool:
    """True when the recipient's domain is reserved or known to be undeliverable."""
    domain = recipient_domain(recipient)
    if domain is None:
        return False
    for suffix in undeliverable_domain_suffixes():
        if domain == suffix or domain.endswith("." + suffix):
            return True
    return False


def log_undeliverable_recipient(recipient: object, *, subject: str | None = None) -> None:
    address = address_text(recipient)
    if subject:
        logger.info(
            "Skipping email to undeliverable recipient %s (subject=%s)",
            address,
            subject,
        )
        return
    logger.info("Skipping email to undeliverable recipient %s", address)


def log_no_deliverable_recipients(subject: str | None = None) -> None:
    logger.info(
        "Skipping email send; no deliverable recipients (subject=%s)",
        subject or "",
    )


def split_deliverable(
    recipients: Iterable[T],
    *,
    subject: str | None = None,
    log: bool = False,
) -> tuple[list[T], list[T]]:
    """Split recipients into deliverable and skipped, optionally logging skips."""
    deliverable: list[T] = []
    skipped: list[T] = []
    for recipient in recipients:
        if is_undeliverable_email(recipient):
            if log:
                log_undeliverable_recipient(recipient, subject=subject)
            skipped.append(recipient)
        else:
            deliverable.append(recipient)
    return deliverable, skipped
