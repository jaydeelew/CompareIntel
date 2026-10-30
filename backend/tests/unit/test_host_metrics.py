"""Unit tests for host metrics collection and GET /internal/metrics/host."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.config import settings
from app.host_metrics import (
    classify_disk,
    classify_memory,
    classify_oom,
    classify_swap,
    collect_disk_volumes,
    collect_host_metrics,
    parse_meminfo,
    parse_oom_kill,
    parse_uptime_seconds,
    worst_status,
)

pytestmark = pytest.mark.unit

MEMINFO_SAMPLE = """\
MemTotal:        2048000 kB
MemFree:          200000 kB
MemAvailable:     512000 kB
Buffers:           50000 kB
Cached:           100000 kB
SwapTotal:        512000 kB
SwapFree:         256000 kB
"""

TOKEN = "test-metrics-token-not-for-production"


class TestClassification:
    def test_memory_ok_at_boundaries(self):
        assert classify_memory(15.0, 50.0, 0) == "ok"
        assert classify_memory(15.0, 50.0, None) == "ok"

    def test_memory_warn_when_available_below_15(self):
        assert classify_memory(14.99, 0.0, 0) == "warn"

    def test_memory_warn_when_swap_above_50(self):
        assert classify_memory(80.0, 50.01, 0) == "warn"

    def test_memory_critical_when_available_below_5(self):
        assert classify_memory(4.99, 0.0, 0) == "critical"

    def test_memory_critical_when_swap_above_80(self):
        assert classify_memory(80.0, 80.01, 0) == "critical"

    def test_memory_critical_when_oom_kills_increased(self):
        assert classify_memory(80.0, 0.0, 1) == "critical"

    def test_swap_thresholds(self):
        assert classify_swap(50.0) == "ok"
        assert classify_swap(50.01) == "warn"
        assert classify_swap(80.0) == "warn"
        assert classify_swap(80.01) == "critical"

    def test_disk_thresholds(self):
        assert classify_disk(80.0) == "ok"
        assert classify_disk(80.01) == "warn"
        assert classify_disk(90.0) == "warn"
        assert classify_disk(90.01) == "critical"

    def test_oom_status(self):
        assert classify_oom(None) == "ok"
        assert classify_oom(0) == "ok"
        assert classify_oom(1) == "critical"

    def test_worst_status(self):
        assert worst_status("ok", "ok") == "ok"
        assert worst_status("ok", "warn") == "warn"
        assert worst_status("warn", "critical", "ok") == "critical"


class TestParsers:
    def test_parse_meminfo(self):
        fields = parse_meminfo(MEMINFO_SAMPLE)
        assert fields["MemTotal"] == 2048000
        assert fields["MemAvailable"] == 512000
        assert fields["SwapTotal"] == 512000

    def test_parse_oom_kill_ignores_related_fields(self):
        text = "oom_kill_allocstall 2\noom_kill 3\n"
        assert parse_oom_kill(text) == 3

    def test_parse_oom_kill_missing(self):
        assert parse_oom_kill("pgpgin 1\n") is None

    def test_parse_uptime(self):
        assert parse_uptime_seconds("12345.67 89012.34\n") == pytest.approx(12345.67)

    def test_parse_uptime_invalid(self):
        assert parse_uptime_seconds("") is None
        assert parse_uptime_seconds("not-a-number") is None

    def test_parse_meminfo_skips_bad_lines(self):
        fields = parse_meminfo("no-colon\nFoo:\nBar: not-int kB\nBaz: 12 kB\n")
        assert fields == {"Baz": 12}

    def test_parse_oom_kill_invalid_value(self):
        assert parse_oom_kill("oom_kill not-an-int\n") is None


class TestCollectHostMetrics:
    def test_collect_returns_expected_keys(self):
        snapshot = collect_host_metrics()
        assert "memory" in snapshot
        assert "swap" in snapshot
        assert "disk" in snapshot
        assert "load_average" in snapshot
        assert "cpu_count" in snapshot
        assert "uptime_seconds" in snapshot
        assert "oom_kill" in snapshot
        assert "oom_status" in snapshot
        assert snapshot["status"] in ("ok", "warn", "critical")
        assert snapshot["memory"]["status"] in ("ok", "warn", "critical")
        assert snapshot["swap"]["status"] in ("ok", "warn", "critical")
        assert isinstance(snapshot["memory"]["total_bytes"], int)
        assert isinstance(snapshot["memory"]["available_bytes"], int)
        assert isinstance(snapshot["memory"]["percent_available"], float)
        assert isinstance(snapshot["swap"]["percent_used"], float)
        assert snapshot["cpu_count"] is None or snapshot["cpu_count"] >= 1
        assert isinstance(snapshot["disk"], list)
        assert any(volume["path"] == "/" for volume in snapshot["disk"])
        for volume in snapshot["disk"]:
            assert volume["status"] in ("ok", "warn", "critical")
            assert 0.0 <= volume["percent_used"] <= 100.0

    def test_swap_zero_when_no_swap(self, monkeypatch):
        monkeypatch.setattr(
            "app.host_metrics._read_text",
            lambda path: {
                "/proc/meminfo": (
                    "MemTotal: 1000 kB\nMemAvailable: 500 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n"
                ),
                "/proc/vmstat": "oom_kill 0\n",
                "/proc/uptime": "10.0 20.0\n",
            }.get(path),
        )
        snapshot = collect_host_metrics()
        assert snapshot["swap"]["percent_used"] == 0.0
        assert snapshot["swap"]["status"] == "ok"
        assert snapshot["oom_kill"] == 0
        assert snapshot["oom_status"] == "ok"
        assert snapshot["memory"]["percent_available"] == 50.0

    def test_memavailable_fallback(self, monkeypatch):
        monkeypatch.setattr(
            "app.host_metrics._read_text",
            lambda path: {
                "/proc/meminfo": (
                    "MemTotal: 1000 kB\nMemFree: 100 kB\nBuffers: 50 kB\nCached: 50 kB\n"
                    "SwapTotal: 100 kB\nSwapFree: 100 kB\n"
                ),
                "/proc/vmstat": "oom_kill 0\n",
                "/proc/uptime": "1.0 1.0\n",
            }.get(path),
        )
        snapshot = collect_host_metrics()
        # 200 kB available of 1000 kB = 20%
        assert snapshot["memory"]["percent_available"] == 20.0

    def test_disk_skips_missing_and_dedupes_same_device(self, monkeypatch, tmp_path):
        root = tmp_path / "root"
        docker = tmp_path / "docker"
        missing = tmp_path / "missing"
        root.mkdir()
        docker.mkdir()
        monkeypatch.setattr(
            "app.host_metrics.disk_percent_used",
            lambda path: 42.0 if str(path).startswith(str(tmp_path)) else None,
        )
        volumes = collect_disk_volumes((str(root), str(docker), str(missing)))
        # Same tmpfs/device in tests → one volume
        assert len(volumes) == 1
        assert volumes[0]["percent_used"] == 42.0
        assert volumes[0]["status"] == "ok"

    def test_disk_separate_devices(self, monkeypatch, tmp_path):
        a = tmp_path / "a"
        b = tmp_path / "b"
        a.mkdir()
        b.mkdir()
        monkeypatch.setattr(
            "app.host_metrics.os.stat", lambda path: SimpleNamespace(st_dev=hash(path))
        )
        monkeypatch.setattr("app.host_metrics.disk_percent_used", lambda path: 81.0)
        volumes = collect_disk_volumes((str(a), str(b)))
        assert len(volumes) == 2
        assert all(volume["status"] == "warn" for volume in volumes)


class TestHostMetricsEndpoint:
    def test_unset_token_returns_404(self, client, monkeypatch):
        monkeypatch.setattr(settings, "metrics_token", None)
        response = client.get("/internal/metrics/host")
        assert response.status_code == 404

    def test_unset_token_returns_404_even_with_bearer(self, client, monkeypatch):
        monkeypatch.setattr(settings, "metrics_token", None)
        response = client.get(
            "/internal/metrics/host",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        assert response.status_code == 404

    def test_missing_header_returns_401(self, client, monkeypatch):
        monkeypatch.setattr(settings, "metrics_token", TOKEN)
        response = client.get("/internal/metrics/host")
        assert response.status_code == 401

    def test_wrong_token_returns_401(self, client, monkeypatch):
        monkeypatch.setattr(settings, "metrics_token", TOKEN)
        response = client.get(
            "/internal/metrics/host",
            headers={"Authorization": "Bearer definitely-the-wrong-token"},
        )
        assert response.status_code == 401

    def test_wrong_length_token_returns_401(self, client, monkeypatch):
        monkeypatch.setattr(settings, "metrics_token", TOKEN)
        response = client.get(
            "/internal/metrics/host",
            headers={"Authorization": "Bearer short"},
        )
        assert response.status_code == 401

    def test_non_bearer_scheme_returns_401(self, client, monkeypatch):
        monkeypatch.setattr(settings, "metrics_token", TOKEN)
        response = client.get(
            "/internal/metrics/host",
            headers={"Authorization": f"Basic {TOKEN}"},
        )
        assert response.status_code == 401

    def test_valid_token_returns_metrics(self, client, monkeypatch):
        monkeypatch.setattr(settings, "metrics_token", TOKEN)
        response = client.get(
            "/internal/metrics/host",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "memory" in data
        assert "percent_available" in data["memory"]
        assert "status" in data["memory"]
        assert "percent_used" in data["swap"]
        assert "status" in data["swap"]
        assert isinstance(data["disk"], list)
        assert "load_average" in data
        assert "cpu_count" in data
        assert "uptime_seconds" in data
        assert "oom_kill" in data
        assert data["status"] in ("ok", "warn", "critical")

    def test_bearer_scheme_is_case_insensitive(self, client, monkeypatch):
        monkeypatch.setattr(settings, "metrics_token", TOKEN)
        response = client.get(
            "/internal/metrics/host",
            headers={"Authorization": f"bearer {TOKEN}"},
        )
        assert response.status_code == 200

    def test_endpoint_hidden_from_openapi(self, client):
        response = client.get("/openapi.json")
        assert response.status_code == 200
        paths = response.json().get("paths", {})
        assert "/internal/metrics/host" not in paths
        assert not any(path.startswith("/internal/") for path in paths)
