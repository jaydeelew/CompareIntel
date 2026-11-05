"""Guards for production deploy hardening (rollback, health, env, nginx)."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
BASH = shutil.which("bash") or "/bin/bash"
GIT = shutil.which("git") or "/usr/bin/git"
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

    def test_ssl_conf_redirects_www_to_apex(self):
        text = SSL_CONF.read_text()
        assert "server_name www.compareintel.com;" in text
        assert "return 301 https://compareintel.com$request_uri;" in text
        assert "server_name compareintel.com www.compareintel.com;" in text
        assert "server_name compareintel.com;" in text
        assert (
            "server_name compareintel.com www.compareintel.com;"
            not in text.split("listen 443 ssl;")[-1]
        )


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


PULL_SH = REPO_ROOT / "scripts" / "deploy" / "pull.sh"

_DOCKER_STUB = r"""#!/bin/bash
# Test double for docker. Behaviour is driven by STUB_* environment variables.
if [ "$1" = "compose" ] && [[ " $* " == *" ps -q "* ]]; then
    echo "${STUB_CID-cid123}"
    exit 0
fi
if [ "$1" = "inspect" ]; then
    case "$*" in
        *State.Status*) echo running ;;
        *State.Restarting*) echo false ;;
        *State.Health*) echo "" ;;
        *"{{.Image}}"*) echo "${STUB_RUNNING_ID:-}" ;;
    esac
    exit 0
fi
if [ "$1" = "image" ] && [ "$2" = "inspect" ]; then
    [ -n "${STUB_BUILT_ID:-}" ] || exit 1
    echo "$STUB_BUILT_ID"
    exit 0
fi
if [ "$1" = "exec" ] || [[ " $* " == *" exec "* ]]; then
    if [ "$1" = "exec" ] && [ -n "${STUB_DOCKER_EXEC_OUT:-}" ]; then
        echo "$STUB_DOCKER_EXEC_OUT"
        exit "${STUB_DOCKER_EXEC_RC:-0}"
    fi
    echo "${STUB_EXEC_OUT:-}"
    exit "${STUB_EXEC_RC:-0}"
fi
exit 0
"""

_CURL_STUB = r"""#!/bin/bash
# nginx answers /health with a static 200 regardless of backend state.
printf 'http=200'
exit 0
"""


def _stub_bin(tmp_path: Path) -> Path:
    bindir = tmp_path / "bin"
    bindir.mkdir()
    for name, body in (("docker", _DOCKER_STUB), ("curl", _CURL_STUB)):
        path = bindir / name
        path.write_text(body)
        path.chmod(0o755)
    return bindir


def _run_verify(
    tmp_path: Path, snippet: str, env: dict[str, str]
) -> subprocess.CompletedProcess[str]:
    bindir = _stub_bin(tmp_path)
    script = f"""
        PROJECT_DIR="{REPO_ROOT}"
        LOG_FILE="{tmp_path / "deploy.log"}"
        source "{UTILS_SH}"
        source "{VERIFY_SH}"
        {snippet}
    """
    return _source_and_run(script, {"PATH": f"{bindir}:{os.environ['PATH']}", **env})


class TestHealthProbeDiagnostics:
    def test_probe_passes_on_healthy_body(self, tmp_path: Path):
        result = _run_verify(
            tmp_path,
            "probe_backend_health",
            {"STUB_EXEC_OUT": '{"status":"healthy","db_connected":true,"duration_ms":3}'},
        )
        assert result.returncode == 0, result.stdout + result.stderr

    def test_unhealthy_status_body_is_not_a_pass(self, tmp_path: Path):
        result = _run_verify(
            tmp_path,
            'probe_backend_health || { echo "REASON=$HEALTH_PROBE_REASON"; exit 3; }',
            {"STUB_EXEC_OUT": '{"status":"unhealthy","error":"db down"}'},
        )
        assert result.returncode == 3, result.stdout + result.stderr
        assert "unhealthy" in result.stdout

    def test_failed_probe_reports_exit_code_and_truncated_redacted_error(self, tmp_path: Path):
        secret = "sk-or-v1-should-never-be-logged-0123456789"
        noise = "x" * 2000
        payload = f"OPENROUTER_API_KEY={secret} Bearer abc.def.ghi {noise}"
        result = _run_verify(
            tmp_path,
            """
            HEALTH_TIMEOUT_SECS=0
            wait_for_backend_health
            """,
            {
                "STUB_EXEC_RC": "137",
                "STUB_EXEC_OUT": payload,
                "HEALTH_POLL_SECS": "1",
            },
        )
        combined = result.stdout + result.stderr + (tmp_path / "deploy.log").read_text()
        assert result.returncode == 1
        assert "did not become healthy within 0s" in combined
        assert "compose exec exit=137" in combined
        assert "docker exec exit=137" in combined
        assert secret not in combined
        assert "abc.def.ghi" not in combined
        assert noise not in combined
        assert "[REDACTED]" in combined

    def test_empty_output_failure_is_still_explained(self, tmp_path: Path):
        result = _run_verify(
            tmp_path,
            'probe_backend_health || echo "REASON=$HEALTH_PROBE_REASON"',
            {"STUB_EXEC_RC": "1", "STUB_EXEC_OUT": ""},
        )
        assert "compose exec exit=1: (no output)" in result.stdout

    def test_nginx_static_health_never_counts_as_backend_healthy(self, tmp_path: Path):
        result = _run_verify(
            tmp_path,
            "probe_backend_health",
            {"STUB_EXEC_RC": "1", "STUB_EXEC_OUT": "probe-error: URLError: refused"},
        )
        assert result.returncode == 1

    def test_never_probes_api_health_through_nginx(self):
        assert "/api/health" not in VERIFY_SH.read_text()
        probe = (
            VERIFY_SH.read_text().split("_probe_backend_via() {")[1].split("nginx_health_diag")[0]
        )
        assert 'out=$("$@" python -c "$BACKEND_HEALTH_PROBE_PY" 2>&1)' in probe


class TestDeployScriptsStaleness:
    def _git_repo(self, tmp_path: Path) -> Path:
        repo = tmp_path / "repo"
        (repo / "scripts" / "deploy").mkdir(parents=True)
        (repo / "scripts" / "deploy" / "verify.sh").write_text("old\n")
        (repo / "README.md").write_text("x\n")
        for cmd in (
            [GIT, "init", "-q"],
            [GIT, "config", "user.email", "t@example.com"],
            [GIT, "config", "user.name", "t"],
            [GIT, "add", "."],
            [GIT, "commit", "-qm", "base"],
        ):
            subprocess.run(cmd, cwd=repo, check=True)
        return repo

    def _head(self, repo: Path) -> str:
        return subprocess.run(
            [GIT, "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True, check=True
        ).stdout.strip()

    def _commit(self, repo: Path, rel: str, content: str) -> None:
        (repo / rel).write_text(content)
        subprocess.run([GIT, "add", "."], cwd=repo, check=True)
        subprocess.run([GIT, "commit", "-qm", "change"], cwd=repo, check=True)

    def _check(self, tmp_path: Path, repo: Path, old: str) -> int:
        script = f"""
            PROJECT_DIR="{repo}"
            LOG_FILE="{tmp_path / "deploy.log"}"
            source "{UTILS_SH}"
            PROJECT_DIR="{repo}"
            source "{PULL_SH}"
            deploy_scripts_changed_since "{old}"
        """
        return _source_and_run(script).returncode

    def test_detects_changed_deploy_scripts(self, tmp_path: Path):
        repo = self._git_repo(tmp_path)
        old = self._head(repo)
        self._commit(repo, "scripts/deploy/verify.sh", "new\n")
        assert self._check(tmp_path, repo, old) == 0

    def test_ignores_unrelated_changes(self, tmp_path: Path):
        repo = self._git_repo(tmp_path)
        old = self._head(repo)
        self._commit(repo, "README.md", "y\n")
        assert self._check(tmp_path, repo, old) != 0

    def test_empty_previous_head_is_not_a_change(self, tmp_path: Path):
        repo = self._git_repo(tmp_path)
        assert self._check(tmp_path, repo, "") != 0

    def test_deploy_reexecs_after_pull_updates_scripts(self):
        text = DEPLOY_SH.read_text()
        assert "deploy_scripts_changed_since" in text
        assert 'exec "$SCRIPT_DIR/deploy-production.sh" rebuild-after-pull' in text
        assert "DEPLOY_REEXEC" in text
        assert "rebuild-after-pull)" in text
        assert text.rstrip().endswith('{ main "$@"; exit $?; }')

    def test_deploy_forces_rebuild_when_head_release_is_not_running(self):
        text = DEPLOY_SH.read_text()
        assert "head_release_not_running" in text
        no_change_idx = text.index('if [ "$CODE_CHANGED" = false ] && head_release_not_running')
        assert no_change_idx < text.index("No code changes")


class TestHeadReleaseNotRunning:
    def _run(self, tmp_path: Path, env: dict[str, str]) -> int:
        bindir = _stub_bin(tmp_path)
        repo = tmp_path / "repo"
        repo.mkdir()
        subprocess.run([GIT, "init", "-q"], cwd=repo, check=True)
        subprocess.run(
            [
                GIT,
                "-c",
                "user.email=t@e.com",
                "-c",
                "user.name=t",
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "c",
            ],
            cwd=repo,
            check=True,
        )
        script = f"""
            LOG_FILE="{tmp_path / "deploy.log"}"
            source "{UTILS_SH}"
            PROJECT_DIR="{repo}"
            source "{PULL_SH}"
            head_release_not_running
        """
        return _source_and_run(script, {"PATH": f"{bindir}:{os.environ['PATH']}", **env}).returncode

    def test_running_old_release_after_rollback_forces_rebuild(self, tmp_path: Path):
        rc = self._run(tmp_path, {"STUB_RUNNING_ID": "sha256:old", "STUB_BUILT_ID": "sha256:new"})
        assert rc == 0

    def test_running_head_release_does_not_force_rebuild(self, tmp_path: Path):
        rc = self._run(tmp_path, {"STUB_RUNNING_ID": "sha256:same", "STUB_BUILT_ID": "sha256:same"})
        assert rc != 0

    def test_head_never_built_forces_rebuild(self, tmp_path: Path):
        rc = self._run(tmp_path, {"STUB_RUNNING_ID": "sha256:old", "STUB_BUILT_ID": ""})
        assert rc == 0

    def test_no_backend_container_defers_to_existing_behaviour(self, tmp_path: Path):
        rc = self._run(tmp_path, {"STUB_CID": "", "STUB_BUILT_ID": "sha256:new"})
        assert rc != 0
