"""Write rendering-harness replies and describe admin add-model harness failures.

Image generation models never reach this module. Text models are collected with
the six files in rendering-harness/prompts so a later PR satisfies the coverage
gate without a second paid call.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

PROMPT_ORDER = (
    "01-math-basics",
    "02-markdown-formatting",
    "03-code-blocks",
    "04-mixed-markdown-latex",
    "05-complex-scenarios",
    "06-edge-cases-boundaries",
)
ALLOWED_RENDER_STATUSES = {"pass", "not-covered", "source-issue"}
INCOMPLETE_FINISH_REASONS = {"length", "max_tokens", "max_output_tokens"}


class HarnessRenderFailedError(Exception):
    """Offline LatexRenderer assertions failed. The model must not be reported as added."""


class HarnessRenderNotRunError(Exception):
    """Playwright render could not be started. Replies are on disk; no success."""

    def __init__(self, message: str, command: str):
        super().__init__(message)
        self.command = command


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def harness_root() -> Path:
    return project_root() / "rendering-harness"


def prompts_dir() -> Path:
    return harness_root() / "prompts"


def runs_root() -> Path:
    return harness_root() / "runs"


def load_harness_prompts() -> list[dict[str, str]]:
    """Return the six harness prompts in filename order."""
    found: list[dict[str, str]] = []
    for path in sorted(prompts_dir().glob("*.md")):
        found.append({"name": path.stem, "prompt": path.read_text(encoding="utf-8")})
    names = [item["name"] for item in found]
    if names != list(PROMPT_ORDER):
        raise RuntimeError(f"rendering-harness/prompts must be {list(PROMPT_ORDER)}, found {names}")
    return found


def reply_filename(model_id: str, prompt_name: str) -> str:
    return f"{model_id.replace('/', '_')}_{prompt_name}.json"


def _reply_is_complete(data: dict[str, Any]) -> bool:
    response = data.get("response")
    if not isinstance(response, str) or not response.strip():
        return False
    if data.get("truncated") is True:
        return False
    finish = str(data.get("finishReason") or "").lower()
    native = str(data.get("nativeFinishReason") or "").lower()
    return finish not in INCOMPLETE_FINISH_REASONS and native not in INCOMPLETE_FINISH_REASONS


def find_complete_replies(model_id: str, runs_dir: Path | None = None) -> dict[str, Path]:
    """Map each prompt name to a complete saved reply, if one exists."""
    root = runs_dir or runs_root()
    found: dict[str, Path] = {}
    if not root.is_dir():
        return found
    wanted = {reply_filename(model_id, name): name for name in PROMPT_ORDER}
    for batch in sorted(root.iterdir()):
        if not batch.is_dir():
            continue
        search_dirs = [batch, batch / "reruns"]
        for directory in search_dirs:
            if not directory.is_dir():
                continue
            for path in directory.glob("*.json"):
                prompt_name = wanted.get(path.name)
                if prompt_name is None:
                    continue
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    continue
                if data.get("modelId") != model_id or data.get("promptName") != prompt_name:
                    continue
                if _reply_is_complete(data):
                    found[prompt_name] = path
    return found


def replies_to_analysis_responses(replies: dict[str, Path]) -> dict[str, dict[str, Any]]:
    responses: dict[str, dict[str, Any]] = {}
    for prompt_name, path in replies.items():
        data = json.loads(path.read_text(encoding="utf-8"))
        responses[prompt_name] = {
            "prompt": data.get("promptText") or "",
            "prompt_name": prompt_name,
            "response": data.get("response"),
            "timestamp": data.get("timestamp"),
            "success": True,
        }
    return responses


def write_harness_replies(
    model_id: str,
    model_name: str,
    responses: dict[str, dict[str, Any]],
    run_dir: Path,
) -> list[Path]:
    """Write harness-format JSON replies. Does not write screenshots."""
    run_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for prompt_name in PROMPT_ORDER:
        payload_in = responses.get(prompt_name) or {}
        response = payload_in.get("response") or ""
        prompt_text = payload_in.get("prompt") or payload_in.get("promptText") or ""
        record = {
            "modelId": model_id,
            "modelName": model_name,
            "promptName": prompt_name,
            "promptText": prompt_text,
            "promptHash": hashlib.sha256(prompt_text.encode("utf-8")).hexdigest(),
            "response": response,
            "timestamp": payload_in.get("timestamp") or datetime.now(UTC).isoformat(),
            "finishReason": "stop" if str(response).strip() else None,
            "nativeFinishReason": "stop" if str(response).strip() else None,
            "truncated": False,
            "actualCost": None,
            "error": None,
            "source": "setup_model_renderer",
        }
        path = run_dir / reply_filename(model_id, prompt_name)
        path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        written.append(path)
    return written


def _results_cover_model(run_dir: Path, model_id: str) -> bool:
    results_path = run_dir / "results.json"
    if not results_path.is_file():
        return False
    try:
        parsed = json.loads(results_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    by_prompt: dict[str, str] = {}
    for entry in parsed.get("results") or []:
        if entry.get("modelId") != model_id:
            continue
        prompt_name = entry.get("promptName")
        status = entry.get("validationStatus")
        if isinstance(prompt_name, str) and isinstance(status, str):
            by_prompt[prompt_name] = status
    return all(by_prompt.get(name) in ALLOWED_RENDER_STATUSES for name in PROMPT_ORDER)


def render_dir_argument(run_dir: Path) -> str:
    try:
        relative = run_dir.resolve().relative_to(harness_root())
        return relative.as_posix()
    except ValueError:
        return str(run_dir)


def render_only_command(run_dir: Path) -> str:
    return f"npm run harness -- --render-only --render-dir={render_dir_argument(run_dir)}"


def render_saved_replies(run_dir: Path, model_id: str) -> dict[str, Any]:
    """Run offline render-only when npm and harness dependencies are installed.

    Returns state "passed", "failed", or "not-run". Never calls OpenRouter.
    """
    command = render_only_command(run_dir)
    render_dir = render_dir_argument(run_dir)
    if _results_cover_model(run_dir, model_id):
        return {
            "state": "passed",
            "command": command,
            "message": "Saved render results already pass the harness assertions.",
        }

    npm = shutil.which("npm")
    if npm is None or not (harness_root() / "node_modules").is_dir():
        return {
            "state": "not-run",
            "command": command,
            "message": (
                "Offline LatexRenderer check was not executed in this environment. "
                f"From rendering-harness run: {command}"
            ),
        }

    env = os.environ.copy()
    env.pop("OPENROUTER_API_KEY", None)
    proc = subprocess.run(
        [npm, "run", "harness", "--", "--render-only", f"--render-dir={render_dir}"],
        cwd=harness_root(),
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
        env=env,
    )
    if proc.returncode != 0 or not _results_cover_model(run_dir, model_id):
        tail = (proc.stderr or proc.stdout or "render-only failed")[-800:]
        return {
            "state": "failed",
            "command": command,
            "message": f"Rendering harness failed.\n{tail}",
        }
    return {
        "state": "passed",
        "command": command,
        "message": "Offline render passed.",
    }


def regenerate_coverage_manifest() -> subprocess.CompletedProcess[str]:
    npm = shutil.which("npm")
    if npm is None:
        raise RuntimeError("npm is required to update rendering-harness/coverage.json")
    return subprocess.run(
        [npm, "run", "generate-coverage"],
        cwd=harness_root(),
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def remove_model_config(model_id: str) -> None:
    """Drop a renderer config this setup run just wrote, so a failed render can be retried."""
    from scripts.config_helpers import get_config_file_path, load_existing_configs

    configs = load_existing_configs()
    if model_id not in configs:
        return
    del configs[model_id]
    config_path = get_config_file_path()
    config_path.write_text(
        json.dumps(list(configs.values()), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def harness_summary_from_output(stdout: str) -> str:
    """Pull the human-readable harness sentence out of setup stdout."""
    for line in reversed((stdout or "").splitlines()):
        if not line.startswith("HARNESS_RESULT:"):
            continue
        raw = line[len("HARNESS_RESULT:") :]
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return raw.strip()
        message = payload.get("message")
        return str(message) if message else "Harness render passed."
    return ""


def harness_result_line(model_id: str, state: str, message: str, command: str) -> str:
    payload = {"modelId": model_id, "state": state, "message": message, "command": command}
    return "HARNESS_RESULT:" + json.dumps(payload, ensure_ascii=False)


def admin_setup_failure_message(returncode: int, stdout: str, stderr: str) -> str:
    """HTTP/SSE detail when setup does not exit 0. Never claims the model was added."""
    combined = f"{stderr or ''}\n{stdout or ''}"
    command = ""
    for line in combined.splitlines():
        if line.startswith("HARNESS_COMMAND:"):
            command = line.split(":", 1)[1].strip()
            break
    if returncode == 2 or "HARNESS_RENDER_NOT_RUN" in combined:
        instruction = command or "npm run harness -- --render-only --render-dir=<run>"
        return (
            "Rendering harness did not run, so the model was not added to the registry. "
            f"From rendering-harness run `{instruction}`. "
            "Saved replies are reused on the next attempt; that command makes no paid API call."
        )
    if "RENDERING HARNESS FAILED" in combined or returncode != 0:
        tail = (stderr or stdout or "Unknown error").strip()[-800:]
        return f"Rendering harness failed. The model was not added to the registry. {tail}"
    return "Renderer setup failed. The model was not added to the registry."
