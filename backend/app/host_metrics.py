"""Cheap host metrics for Pulse polling (stdlib only; reads /proc and statvfs)."""

from __future__ import annotations

import os
from typing import Any, Literal

Status = Literal["ok", "warn", "critical"]

MEMORY_WARN_AVAILABLE_PCT = 15.0
MEMORY_CRITICAL_AVAILABLE_PCT = 5.0
SWAP_WARN_USED_PCT = 50.0
SWAP_CRITICAL_USED_PCT = 80.0
DISK_WARN_USED_PCT = 80.0
DISK_CRITICAL_USED_PCT = 90.0

# Root filesystem plus Docker's data dir when it is a distinct volume.
DEFAULT_DISK_PATHS = ("/", "/var/lib/docker")

_STATUS_RANK = {"ok": 0, "warn": 1, "critical": 2}


def worst_status(*statuses: Status) -> Status:
    """Return the most severe status in ``statuses`` (ok < warn < critical)."""
    if not statuses:
        return "ok"
    return max(statuses, key=lambda item: _STATUS_RANK[item])


def classify_memory(
    percent_available: float,
    swap_percent_used: float,
    oom_kill: int | None,
) -> Status:
    """Classify memory pressure from available RAM, swap, and OOM kills.

    Warn when available memory is below 15% or swap used is above 50%.
    Critical when available is below 5%, swap used is above 80%, or the
    OOM killer has fired (``oom_kill`` from ``/proc/vmstat`` is > 0).
    """
    oom_increased = oom_kill is not None and oom_kill > 0
    if (
        percent_available < MEMORY_CRITICAL_AVAILABLE_PCT
        or swap_percent_used > SWAP_CRITICAL_USED_PCT
        or oom_increased
    ):
        return "critical"
    if percent_available < MEMORY_WARN_AVAILABLE_PCT or swap_percent_used > SWAP_WARN_USED_PCT:
        return "warn"
    return "ok"


def classify_swap(percent_used: float) -> Status:
    if percent_used > SWAP_CRITICAL_USED_PCT:
        return "critical"
    if percent_used > SWAP_WARN_USED_PCT:
        return "warn"
    return "ok"


def classify_disk(percent_used: float) -> Status:
    if percent_used > DISK_CRITICAL_USED_PCT:
        return "critical"
    if percent_used > DISK_WARN_USED_PCT:
        return "warn"
    return "ok"


def classify_oom(oom_kill: int | None) -> Status:
    """Critical once the OOM killer has fired since boot (count increased from 0)."""
    if oom_kill is not None and oom_kill > 0:
        return "critical"
    return "ok"


def parse_meminfo(text: str) -> dict[str, int]:
    """Parse ``/proc/meminfo`` into a mapping of field name → kB (integer)."""
    result: dict[str, int] = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        key, rest = line.split(":", 1)
        parts = rest.split()
        if not parts:
            continue
        try:
            result[key.strip()] = int(parts[0])
        except ValueError:
            continue
    return result


def parse_oom_kill(text: str) -> int | None:
    """Return the ``oom_kill`` counter from ``/proc/vmstat``, or None if absent."""
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[0] == "oom_kill":
            try:
                return int(parts[1])
            except ValueError:
                return None
    return None


def parse_uptime_seconds(text: str) -> float | None:
    """Return seconds since boot from ``/proc/uptime``."""
    parts = text.split()
    if not parts:
        return None
    try:
        return float(parts[0])
    except ValueError:
        return None


def _read_text(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return None


def _kb_to_bytes(kilobytes: int) -> int:
    return kilobytes * 1024


def _memory_bytes(fields: dict[str, int]) -> tuple[int, int]:
    total_kb = fields.get("MemTotal", 0)
    if "MemAvailable" in fields:
        available_kb = fields["MemAvailable"]
    else:
        available_kb = fields.get("MemFree", 0) + fields.get("Buffers", 0) + fields.get("Cached", 0)
    return _kb_to_bytes(total_kb), _kb_to_bytes(available_kb)


def _swap_percent_used(fields: dict[str, int]) -> float:
    swap_total_kb = fields.get("SwapTotal", 0)
    if swap_total_kb <= 0:
        return 0.0
    swap_free_kb = fields.get("SwapFree", 0)
    return 100.0 * (swap_total_kb - swap_free_kb) / swap_total_kb


def disk_percent_used(path: str) -> float | None:
    try:
        vfs = os.statvfs(path)
    except OSError:
        return None
    if vfs.f_blocks <= 0:
        return None
    used_blocks = vfs.f_blocks - vfs.f_bfree
    return 100.0 * used_blocks / vfs.f_blocks


def collect_disk_volumes(paths: tuple[str, ...] = DEFAULT_DISK_PATHS) -> list[dict[str, Any]]:
    """Disk usage for unique filesystems among ``paths`` (skips missing paths)."""
    seen_devs: set[int] = set()
    volumes: list[dict[str, Any]] = []
    for path in paths:
        if not os.path.exists(path):
            continue
        try:
            dev = os.stat(path).st_dev
        except OSError:
            continue
        if dev in seen_devs:
            continue
        seen_devs.add(dev)
        percent = disk_percent_used(path)
        if percent is None:
            continue
        volumes.append(
            {
                "path": path,
                "percent_used": round(percent, 2),
                "status": classify_disk(percent),
            }
        )
    return volumes


def _cpu_count() -> int | None:
    try:
        return len(os.sched_getaffinity(0))
    except (AttributeError, OSError):
        return os.cpu_count()


def _load_average() -> list[float] | None:
    try:
        return [round(value, 2) for value in os.getloadavg()]
    except OSError:
        return None


def collect_host_metrics() -> dict[str, Any]:
    """Snapshot host memory, swap, disk, load, CPU, uptime, and OOM kills."""
    meminfo_text = _read_text("/proc/meminfo")
    fields = parse_meminfo(meminfo_text) if meminfo_text is not None else {}
    total_bytes, available_bytes = _memory_bytes(fields)
    if total_bytes > 0:
        percent_available = 100.0 * available_bytes / total_bytes
    else:
        percent_available = 100.0

    swap_percent = _swap_percent_used(fields)

    oom_text = _read_text("/proc/vmstat")
    oom_kill = parse_oom_kill(oom_text) if oom_text is not None else None

    uptime_text = _read_text("/proc/uptime")
    uptime_seconds = parse_uptime_seconds(uptime_text) if uptime_text is not None else None

    disk = collect_disk_volumes()
    memory_status = classify_memory(percent_available, swap_percent, oom_kill)
    swap_status = classify_swap(swap_percent)
    oom_status = classify_oom(oom_kill)
    disk_statuses = [volume["status"] for volume in disk]
    overall = worst_status(memory_status, swap_status, oom_status, *disk_statuses)

    return {
        "memory": {
            "total_bytes": total_bytes,
            "available_bytes": available_bytes,
            "percent_available": round(percent_available, 2),
            "status": memory_status,
        },
        "swap": {
            "percent_used": round(swap_percent, 2),
            "status": swap_status,
        },
        "disk": disk,
        "load_average": _load_average(),
        "cpu_count": _cpu_count(),
        "uptime_seconds": round(uptime_seconds, 2) if uptime_seconds is not None else None,
        "oom_kill": oom_kill,
        "oom_status": oom_status,
        "status": overall,
    }
