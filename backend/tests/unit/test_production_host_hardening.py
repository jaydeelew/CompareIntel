"""Guards for 2 GB production-host hardening (compose, gunicorn, deploy).

These tests parse repo files rather than talking to Docker, so they run in CI
without a daemon. They exist to keep worker count, memory caps, log rotation,
and post-deploy prune from drifting.
"""

from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
PROD_COMPOSE = REPO_ROOT / "docker-compose.prod.yml"
SSL_COMPOSE = REPO_ROOT / "docker-compose.ssl.yml"
ENTRYPOINT = REPO_ROOT / "backend" / "entrypoint.sh"
DEPLOY_SH = REPO_ROOT / "deploy-production.sh"
UTILS_SH = REPO_ROOT / "scripts" / "deploy" / "utils.sh"
CHECK_SH = REPO_ROOT / "scripts" / "deploy" / "check.sh"
STATUS_SH = REPO_ROOT / "scripts" / "deploy" / "status.sh"


def _load_compose(path: Path) -> dict:
    with path.open() as f:
        return yaml.safe_load(f)


class TestProductionComposeHardening:
    """Memory limits, Redis cap, log rotation, and worker env in prod compose."""

    def test_prod_and_ssl_compose_exist(self):
        assert PROD_COMPOSE.is_file()
        assert SSL_COMPOSE.is_file()

    def test_every_service_caps_json_file_logs(self):
        for path in (PROD_COMPOSE, SSL_COMPOSE):
            data = _load_compose(path)
            services = data["services"]
            assert services, f"{path.name} has no services"
            for name, svc in services.items():
                logging = svc.get("logging") or {}
                assert logging.get("driver") == "json-file", (
                    f"{path.name}:{name} missing json-file driver"
                )
                options = logging.get("options") or {}
                assert options.get("max-size"), f"{path.name}:{name} missing log max-size"
                assert options.get("max-file"), f"{path.name}:{name} missing log max-file"

    def test_every_service_has_memory_limit_and_reservation(self):
        for path in (PROD_COMPOSE, SSL_COMPOSE):
            data = _load_compose(path)
            for name, svc in data["services"].items():
                assert svc.get("mem_limit"), f"{path.name}:{name} missing mem_limit"
                assert svc.get("mem_reservation"), f"{path.name}:{name} missing mem_reservation"

    def test_backend_defaults_to_two_workers(self):
        for path in (PROD_COMPOSE, SSL_COMPOSE):
            env = _load_compose(path)["services"]["backend"].get("environment") or []
            assert any(
                isinstance(item, str) and item.startswith("WEB_CONCURRENCY=") and "2" in item
                for item in env
            ), f"{path.name} backend is missing WEB_CONCURRENCY default of 2"

    def test_redis_maxmemory_and_volatile_lru(self):
        for path in (PROD_COMPOSE, SSL_COMPOSE):
            command = _load_compose(path)["services"]["redis"].get("command") or ""
            assert "--maxmemory" in command, f"{path.name} redis missing maxmemory"
            assert "64mb" in command, f"{path.name} redis maxmemory should fit a 2 GB host"
            assert "volatile-lru" in command, f"{path.name} redis should use volatile-lru"

    def test_container_limits_fit_2gb_host(self):
        """Hard limits must leave room for the kernel and Docker daemon."""
        for path in (PROD_COMPOSE, SSL_COMPOSE):
            total_mb = 0
            for svc in _load_compose(path)["services"].values():
                limit = str(svc["mem_limit"]).lower().rstrip("b")
                if limit.endswith("m"):
                    total_mb += int(float(limit[:-1]))
                elif limit.endswith("g"):
                    total_mb += int(float(limit[:-1]) * 1024)
                else:
                    raise AssertionError(f"unparseable mem_limit {svc['mem_limit']}")
            # 2 GB host ≈ 1900 MB; leave headroom for OS + docker.
            assert total_mb <= 1600, (
                f"{path.name} service mem_limits total {total_mb}MB, too tight for 2 GB"
            )


class TestGunicornEntrypoint:
    def test_entrypoint_reads_web_concurrency(self):
        text = ENTRYPOINT.read_text()
        assert "WEB_CONCURRENCY" in text
        assert "GUNICORN_WORKERS" in text
        assert "WORKERS=2" in text or "WORKERS=$WEB_CONCURRENCY" in text

    def test_entrypoint_recycles_workers_and_has_graceful_timeout(self):
        text = ENTRYPOINT.read_text()
        assert "--max-requests" in text
        assert "--max-requests-jitter" in text
        assert "--graceful-timeout" in text


class TestDeployResourceChecks:
    def test_utils_defines_disk_swap_check_and_prune(self):
        text = UTILS_SH.read_text()
        assert "check_host_resources" in text
        assert "80" in text
        assert "Swap" in text or "swap" in text
        assert "prune_dangling_docker_artifacts" in text
        assert "docker image prune" in text
        assert "docker builder prune" in text
        # Must not wipe running containers or volumes.
        assert "docker system prune" not in text
        assert "docker volume prune" not in text
        assert "docker container prune" not in text

    def test_pre_deploy_and_status_call_resource_check(self):
        assert "check_host_resources" in CHECK_SH.read_text()
        assert "check_host_resources" in STATUS_SH.read_text()

    def test_successful_deploy_prunes_dangling_images(self):
        text = DEPLOY_SH.read_text()
        assert "prune_dangling_docker_artifacts" in text
        # Rebuilds share deploy_with_rebuild, which prunes only after verify.
        assert "deploy_with_rebuild" in text
        rebuild = text.split("deploy_with_rebuild()")[1].split("apply_runtime_config_changes")[0]
        assert "verify_or_rollback" in rebuild
        assert "prune_dangling_docker_artifacts" in rebuild
        assert rebuild.find("verify_or_rollback") < rebuild.find("prune_dangling_docker_artifacts")
