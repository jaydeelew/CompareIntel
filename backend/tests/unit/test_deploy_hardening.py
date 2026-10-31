"""Guards for production deploy hardening (rollback, health, env, nginx)."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
BASH = shutil.which("bash") or "/bin/bash"
DEPLOY_SH = REPO_ROOT / "deploy-production.sh"
VERIFY_SH = REPO_ROOT / "scripts" / "deploy" / "verify.sh"
UTILS_SH = REPO_ROOT / "scripts" / "deploy" / "utils.sh"
ENV_SH = REPO_ROOT / "scripts" / "deploy" / "env.sh"
NGINX_SH = REPO_ROOT / "scripts" / "deploy" / "nginx.sh"
ROLLBACK_SH = REPO_ROOT / "scripts" / "deploy" / "rollback.sh"
SSL_CONF = REPO_ROOT / "nginx" / "nginx.ssl.conf"
ENV_EXAMPLE = REPO_ROOT / "backend" / ".env.example"


def _source_and_run(
    script: str, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    merged = os.environ.copy()
    if env:
        merged.update(env)
    return subprocess.run(
        [BASH, "-c", script],
        cwd=REPO_ROOT,
        env=merged,
        capture_output=True,
        text=True,
        check=False,
    )


class TestDeployRollbackOnVerifyFailure:
    def test_rebuild_paths_use_verify_or_rollback(self):
        text = DEPLOY_SH.read_text()
        assert "verify_or_rollback" in text
        assert "deploy_with_rebuild" in text
        # All stack-down rebuilds go through deploy_with_rebuild.
        assert text.count("deploy_with_rebuild") >= 3

    def test_verify_or_rollback_uses_previous_tag_without_migrations(self):
        verify = VERIFY_SH.read_text()
        rollback = ROLLBACK_SH.read_text()
        assert "rollback_to_previous_images" in verify
        assert "no automatic alembic downgrade" in verify
        assert "scripts/rollback/rollback.sh" in rollback
        assert "previous" in rollback
        assert "--with-migrations" not in verify

    def test_verify_returns_instead_of_exiting(self):
        text = VERIFY_SH.read_text()
        assert "return 1" in text
        assert "exit 1" not in text


class TestStrongHealthCheck:
    def test_verify_retries_health_and_fails_if_unhealthy(self):
        text = VERIFY_SH.read_text()
        assert "wait_for_backend_health" in text
        assert "HEALTH_TIMEOUT_SECS" in text
        assert "75" in text
        assert "probe_backend_health" in text
        assert "Backend /health did not become healthy" in text
        assert "backend_is_restarting_or_unhealthy" in text
        assert "OpenRouterConfigError" in text

    def test_service_running_rejects_restarting(self):
        text = UTILS_SH.read_text()
        assert "State.Restarting" in text
        assert "backend_is_restarting_or_unhealthy" in text
        assert "status=running" not in text or "State.Status" in text


class TestBackendEnvCheck:
    def test_example_lists_required_and_warn_keys(self):
        example = ENV_EXAMPLE.read_text()
        assert "OPENROUTER_API_KEY=" in example
        assert "METRICS_TOKEN=" in example
        assert "SPEND_ALERT_EMAIL=" in example
        assert "OPENROUTER_DAILY_SPEND_CAP_USD=" in example
        assert "OPENROUTER_MONTHLY_SPEND_CAP_USD=" in example

    def test_empty_openrouter_key_fails_without_printing_value(self, tmp_path: Path):
        env_file = tmp_path / ".env"
        secret = "sk-or-v1-super-secret-must-not-appear"
        env_file.write_text(f"# leftover={secret}\nOPENROUTER_API_KEY=\nMETRICS_TOKEN=\n")
        log = tmp_path / "deploy.log"
        script = f"""
            set -e
            PROJECT_DIR="{REPO_ROOT}"
            ENV_FILE="{env_file}"
            ENV_EXAMPLE="{ENV_EXAMPLE}"
            LOG_FILE="{log}"
            # shellcheck disable=SC1091
            source "{UTILS_SH}"
            source "{ENV_SH}"
            check_backend_env "{env_file}"
        """
        result = _source_and_run(script)
        assert result.returncode != 0
        combined = result.stdout + result.stderr + log.read_text()
        assert "OPENROUTER_API_KEY" in combined
        assert secret not in combined
        assert "sk-or-v1" not in combined

    def test_set_openrouter_key_passes_and_warns_on_optional(self, tmp_path: Path):
        env_file = tmp_path / ".env"
        secret = "sk-or-v1-super-secret-must-not-appear"
        env_file.write_text(f"OPENROUTER_API_KEY={secret}\n")
        log = tmp_path / "deploy.log"
        script = f"""
            set -e
            PROJECT_DIR="{REPO_ROOT}"
            ENV_FILE="{env_file}"
            ENV_EXAMPLE="{ENV_EXAMPLE}"
            LOG_FILE="{log}"
            source "{UTILS_SH}"
            source "{ENV_SH}"
            check_backend_env "{env_file}"
        """
        result = _source_and_run(script)
        assert result.returncode == 0, result.stdout + result.stderr
        combined = result.stdout + result.stderr + log.read_text()
        assert "OPENROUTER_API_KEY is set" in combined
        assert "METRICS_TOKEN is missing" in combined
        assert "SPEND_ALERT_EMAIL is missing" in combined
        assert "SPEND_CAP_USD is missing" in combined
        assert secret not in combined

    def test_env_hash_detects_change_without_printing_contents(self, tmp_path: Path):
        env_file = tmp_path / ".env"
        hash_file = tmp_path / "env.hash"
        secret = "sk-or-v1-hash-secret-value"
        env_file.write_text(f"OPENROUTER_API_KEY={secret}\n")
        log = tmp_path / "deploy.log"
        script = f"""
            set -e
            PROJECT_DIR="{REPO_ROOT}"
            ENV_FILE="{env_file}"
            ENV_EXAMPLE="{ENV_EXAMPLE}"
            LAST_DEPLOYED_ENV_HASH_FILE="{hash_file}"
            LOG_FILE="{log}"
            source "{UTILS_SH}"
            source "{ENV_SH}"
            record_backend_env_hash "{env_file}"
            detect_backend_env_change "{env_file}"
            [ "$ENV_CHANGED" = false ]
            echo extra=1 >> "{env_file}"
            detect_backend_env_change "{env_file}"
            [ "$ENV_CHANGED" = true ]
        """
        result = _source_and_run(script)
        assert result.returncode == 0, result.stdout + result.stderr
        combined = result.stdout + result.stderr + log.read_text()
        assert secret not in combined
        assert hash_file.is_file()
        assert secret not in hash_file.read_text()


class TestNginxSslSpaRouting:
    def test_ssl_conf_uses_spa_or_404_for_unknown_models(self):
        text = SSL_CONF.read_text()
        assert "location @spa_or_404" in text
        assert "try_files $uri $uri/index.html @spa_or_404;" in text
        assert "if ($uri = /models)" in text
        assert "try_files $uri $uri/ /index.html;" not in text
        assert "location ~ ^/c/[A-Za-z0-9]+$" in text
        assert "location = /internal/metrics/host" in text
        assert "location ~* \\.(js|css)$" in text

    def test_nginx_helper_tests_before_reload(self):
        text = NGINX_SH.read_text()
        assert "nginx -t" in text
        assert "nginx -s reload" in text
        assert "test_nginx_config_before_apply" in text
        assert "reload_nginx_if_conf_changed" in text


class TestDeployWiring:
    def test_pre_deploy_env_check_is_in_system_check(self):
        check = (REPO_ROOT / "scripts" / "deploy" / "check.sh").read_text()
        deploy = DEPLOY_SH.read_text()
        assert "check_backend_env" in check
        assert 'source "$DEPLOY_DIR/env.sh"' in deploy
        assert 'source "$DEPLOY_DIR/nginx.sh"' in deploy
        assert "apply_runtime_config_changes" in deploy
        assert "recreate_backend_if_env_changed" in deploy

    def test_no_code_change_path_still_applies_env_and_nginx(self):
        text = DEPLOY_SH.read_text()
        assert "No code changes" in text
        assert "apply_runtime_config_changes" in text
        assert "reload_nginx_if_conf_changed" in text

    def test_restart_tests_nginx_and_reloads_on_conf_change(self):
        text = DEPLOY_SH.read_text()
        restart = text.split("restart)")[1].split("*)")[0]
        assert "test_nginx_config_before_apply" in restart
        assert "reload_nginx" in restart
        assert "verify_deployment" in restart
