"""Strict leaderboard name matching and cross-board percentile blends.

A leaderboard row may be stored on a lineup model only when the version tokens
match. Hyphen versus dot (``4-6`` and ``4.6``), effort tags (``(High)``,
``thinking``), and snapshot dates (``20251001``) are the same version.
``4.6`` is not ``4.7``, ``5`` is not ``5.5``, ``2.1`` is not ``2.5``, and a
release code such as ``2405`` is not ``2508``.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field

# Words that mark an effort setting or a generic suffix, not a different model.
_STOP = {
    "thinking",
    "reasoning",
    "nonthinking",
    "preview",
    "chat",
    "latest",
    "beta",
    "high",
    "low",
    "instant",
    "fast",
    "instruct",
    "it",
    "hf",
    "the",
    "and",
    "with",
    "model",
    "models",
    "xhigh",
    "minimal",
    "none",
    "default",
    "search",
    "online",
    "exp",
    "medium",
}
# Single-letter fragments that are part of a model id (o3, kimi k3, glm-5v).
_KEEP_SINGLE = {"o", "k", "v"}
# A nickname may drop these brand words and still be the same model
# ("nano-banana-2.1" is "Gemini Nano Banana 2.1"). Product words such as
# "pro" and "mini" are not brands: dropping them would cross models.
_BRAND = {
    "gemini",
    "claude",
    "gpt",
    "openai",
    "google",
    "meta",
    "qwen",
    "mistral",
    "grok",
    "deepseek",
    "kimi",
    "llama",
    "flux",
    "seedream",
    "anthropic",
}


def _expand_spaced_single_digits(text: str) -> str:
    """Turn ``opus 4 6`` into ``opus 4.6``. Leave two-digit numbers alone."""
    previous = None
    current = text
    while current != previous:
        previous = current
        current = re.sub(r"\b(\d)\s+(\d)\b", r"\1.\2", current)
    return current


def _collapse_dot0(token: str) -> str:
    """``4.0`` is the same version as ``4``. ``4.20`` and ``2.5`` stay put."""
    if re.fullmatch(r"\d+\.0+", token):
        return token.split(".", 1)[0]
    return token


def _prepare_label(label: str) -> str:
    s = label.lower().strip()

    # Drop effort-only parentheses. Keep parentheticals that carry a number
    # (Qwen3.8-Max (0902) is a release code, not an effort tag).
    def _paren(match: re.Match[str]) -> str:
        inner = match.group(1)
        # Keep release codes and dotted versions. Drop nicknames ("nano-banana-pro, 2K")
        # and effort tags. Snapshot dates in parentheses are not a different version.
        kept = re.findall(r"\b\d{4}\b|\d+\.\d+", inner)
        if kept:
            return " " + " ".join(kept) + " "
        return " "

    s = re.sub(r"\(([^)]*)\)", _paren, s)
    s = s.replace("*", " ").replace("_", " ").replace("/", " ")
    s = _expand_spaced_single_digits(s)
    # Scale-style claude-opus-4-6 → claude-opus-4.6. Single digits only.
    s = re.sub(r"-(\d)-(\d)(?=-|$|\s|\()", r"-\1.\2", s)
    s = s.replace("-", " ")
    return s


def version_signature(
    label: str,
) -> tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    """Return ``(family, versions, bare_release_codes, snapshot_dates)``.

    Snapshot dates are ``YYYYMMDD`` reduced to ``MMDD``. Bare release codes are
    other 4-digit tokens (``2508``, ``0902``, ``1017``).
    """
    s = _prepare_label(label)
    snapshots: list[str] = []
    for match in re.finditer(r"20(\d{2})(\d{2})(\d{2})", s):
        snapshots.append(match.group(2) + match.group(3))
    s = re.sub(r"20\d{6}", " ", s)
    s = re.sub(r"\b20\d{2}\s+\d{2}\s+\d{2}\b", " ", s)
    # "preview 09 2025" is a snapshot month, not a version.
    s = re.sub(r"\b(?:0[1-9]|1[0-2])\s+20\d{2}\b", " ", s)
    # Parameter counts and image resolutions are not versions (480b, a35b, 4b, 2k).
    s = re.sub(r"\ba\d+b\b", " ", s)
    s = re.sub(r"\b\d+(?:\.\d+)?b\b", " ", s)
    s = re.sub(r"\b\d+k\b", " ", s)

    family: list[str] = []
    versions: list[str] = []
    bare: list[str] = []
    for token in re.findall(r"[a-z]+|\d+\.\d+(?:\.\d+)*|\d+", s):
        if re.fullmatch(r"\d+\.\d+(?:\.\d+)*", token):
            versions.append(_collapse_dot0(token))
            continue
        if re.fullmatch(r"\d{4}", token):
            bare.append(token)
            continue
        if re.fullmatch(r"\d+", token):
            versions.append(token)
            continue
        if token in _STOP:
            continue
        if len(token) == 1 and token not in _KEEP_SINGLE:
            continue
        family.append(token)
    return (
        tuple(sorted(set(family))),
        tuple(sorted(versions)),
        tuple(sorted(set(bare))),
        tuple(sorted(set(snapshots))),
    )


def _dates_compatible(
    bare_a: tuple[str, ...],
    snap_a: tuple[str, ...],
    bare_b: tuple[str, ...],
    snap_b: tuple[str, ...],
) -> bool:
    """Release codes must match. A YYYYMMDD snapshot can stand in for one.

    A snapshot on only one side is ignored when neither side has a bare release
    code (Haiku 4.5-20251001 is still Haiku 4.5). A bare code on only one side
    does not match (Qwen3.8-Max is not Qwen3.8-Max-0902; Codestral 2405 is not
    Codestral 2508).
    """
    if not bare_a and not bare_b:
        return True
    effective_a = bare_a or snap_a
    effective_b = bare_b or snap_b
    return effective_a == effective_b


def signatures_compatible(left: str, right: str, *, extra_drop: set[str] | None = None) -> bool:
    """True when ``left`` and ``right`` are the same model version.

    ``extra_drop`` removes organization tokens that appear on a leaderboard
    slug (``openai_gpt-5``) but not in the lineup id (``gpt-5``).
    """
    drop = extra_drop or set()
    family_a, versions_a, bare_a, snap_a = version_signature(left)
    family_b, versions_b, bare_b, snap_b = version_signature(right)
    family_a = tuple(token for token in family_a if token not in drop)
    family_b = tuple(token for token in family_b if token not in drop)
    if family_a != family_b or versions_a != versions_b:
        return False
    return _dates_compatible(bare_a, snap_a, bare_b, snap_b)


def _org_tokens(model_id: str) -> set[str]:
    provider = model_id.split("/", 1)[0]
    slug = model_id.split("/", 1)[-1]
    org = set(version_signature(provider)[0])
    slug_family = set(version_signature(slug)[0])
    return org - slug_family


def _brand_nickname(label: str, other: str, drop: set[str]) -> bool:
    """True when ``label`` is ``other`` with only brand words omitted."""
    family_a, versions_a, bare_a, snap_a = version_signature(label)
    family_b, versions_b, bare_b, snap_b = version_signature(other)
    family_a = tuple(token for token in family_a if token not in drop)
    family_b = tuple(token for token in family_b if token not in drop)
    if not family_a or versions_a != versions_b:
        return False
    if not _dates_compatible(bare_a, snap_a, bare_b, snap_b):
        return False
    extra = set(family_b) - set(family_a)
    return set(family_a).issubset(family_b) and extra <= _BRAND


def alias_is_same_version(label: str, model_id: str, display_name: str | None = None) -> bool:
    """True when an explicit alias does not cross versions."""
    slug = model_id.split("/", 1)[-1]
    drop = _org_tokens(model_id)
    if signatures_compatible(label, slug, extra_drop=drop):
        return True
    if display_name and signatures_compatible(label, display_name, extra_drop=drop):
        return True
    if _brand_nickname(label, slug, drop):
        return True
    if display_name and _brand_nickname(label, display_name, drop):
        return True
    return False


def match_lineup_name(label: str, model_id_to_name: dict[str, str]) -> str | None:
    """Map one leaderboard label to one lineup model id, or None.

    Returns None when nothing matches or when two lineup models share the
    signature (ambiguous — do not guess).
    """
    hits: list[str] = []
    for model_id, display in model_id_to_name.items():
        slug = model_id.split("/", 1)[-1]
        drop = _org_tokens(model_id)
        if signatures_compatible(label, display, extra_drop=drop) or signatures_compatible(
            label, slug, extra_drop=drop
        ):
            hits.append(model_id)
    unique = list(dict.fromkeys(hits))
    if len(unique) == 1:
        return unique[0]
    return None


def score_percentile(value: float, reference: list[float]) -> float:
    """Percentile of ``value`` inside ``reference`` (0–100, higher is better).

    The top score on a board is 100. Ties share the percentile of "strictly
    below". A one-row board is 100.
    """
    if not reference:
        return 100.0
    if len(reference) == 1:
        return 100.0
    below = sum(1 for other in reference if other < value)
    return 100.0 * below / (len(reference) - 1)


@dataclass
class LeaderboardSlice:
    """Lineup hits plus the full-board score list used for percentiles."""

    scores: dict[str, tuple[float, str]] = field(default_factory=dict)
    reference: list[float] = field(default_factory=list)


def fetch_lmarena_slice(
    config: str,
    category: str,
    source_label: str,
    model_id_to_name: dict[str, str],
    *,
    timeout: float = 30.0,
) -> LeaderboardSlice:
    """Read one Arena leaderboard category from the public Hugging Face dataset.

    Uses the datasets-server filter API (the same public dataset already used
    for Vision and Text-to-Image). Rows from older publish dates in the
    ``latest`` split are ignored. The best Arena Score per lineup model is kept
    when several effort variants exist. ``reference`` is every row on that
    publish date, including models that are not in the lineup, so a percentile
    is the model's place on the public board.
    """
    import httpx

    url = "https://datasets-server.huggingface.co/filter"
    headers = {"User-Agent": "Mozilla/5.0 (compatible; CompareIntel/1.0)"}
    collected: list[dict] = []
    offset = 0
    page_size = 100
    try:
        while True:
            resp = httpx.get(
                url,
                params={
                    "dataset": "lmarena-ai/leaderboard-dataset",
                    "config": config,
                    "split": "latest",
                    "where": f"\"category\"='{category}'",
                    "offset": offset,
                    "length": page_size,
                },
                headers=headers,
                timeout=timeout,
                follow_redirects=True,
            )
            if resp.status_code != 200:
                break
            payload = resp.json()
            rows = payload.get("rows") or []
            for item in rows:
                row = item.get("row") or {}
                if row.get("category") not in (None, category):
                    continue
                collected.append(row)
            total = payload.get("num_rows_total") or 0
            offset += len(rows)
            if not rows or offset >= total:
                break
    except Exception as exc:
        print(
            f"Warning: Could not fetch LMArena {config}/{category}: {exc}",
            file=sys.stderr,
        )
        return LeaderboardSlice()

    if not collected:
        return LeaderboardSlice()

    dates = [row.get("leaderboard_publish_date") or "" for row in collected]
    latest = max(dates)
    current = [row for row in collected if (row.get("leaderboard_publish_date") or "") == latest]
    reference: list[float] = []
    best: dict[str, tuple[float, int, str]] = {}
    for row in current:
        try:
            rating = float(row.get("rating") or 0)
        except (TypeError, ValueError):
            continue
        if rating <= 0:
            continue
        reference.append(rating)
        name = str(row.get("model_name") or "")
        model_id = match_lineup_name(name, model_id_to_name)
        if not model_id:
            continue
        votes = int(row.get("vote_count") or 0)
        previous = best.get(model_id)
        if (
            previous is None
            or rating > previous[0]
            or (rating == previous[0] and votes > previous[1])
        ):
            best[model_id] = (rating, votes, str(row.get("leaderboard_publish_date") or latest))

    scores: dict[str, tuple[float, str]] = {}
    for model_id, (rating, votes, published) in best.items():
        vote_bit = f", {votes} votes" if votes else ""
        evidence = f"{source_label}: Arena Score {rating:.0f} (published {published}{vote_bit})."
        scores[model_id] = (rating, evidence)
    return LeaderboardSlice(scores=scores, reference=reference)


def blend_by_percentile(
    primary: LeaderboardSlice,
    fallback: LeaderboardSlice,
) -> dict[str, tuple[float, str]]:
    """Rank by within-board percentile. The primary board wins on overlap.

    The returned score is the percentile, not the raw benchmark number, so a
    51.90% SWE-Bench result is not sorted against an Arena Score of 1800.
    Evidence keeps the raw source sentence and says which board it came from.
    """
    blended: dict[str, tuple[float, str]] = {}

    def _add(source: LeaderboardSlice) -> None:
        for model_id, (raw, evidence) in source.scores.items():
            if model_id in blended:
                continue
            percentile = score_percentile(raw, source.reference or [raw])
            blended[model_id] = (
                percentile,
                f"Percentile {percentile:.1f}% within this board. {evidence}",
            )

    _add(primary)
    _add(fallback)
    return blended
