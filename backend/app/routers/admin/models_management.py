"""
Admin model CRUD endpoints.
"""

import asyncio
import json
import logging
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from openai import APIConnectionError, APIError, APITimeoutError, NotFoundError, RateLimitError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...config import settings
from ...database import get_db
from ...dependencies import require_admin_role
from ...llm.registry import get_registry_path, load_registry, reload_registry, save_registry
from ...model_runner import (
    FREE_TIER_MODELS,
    MODELS_BY_PROVIDER,
    OPENROUTER_MODELS,
    UNREGISTERED_TIER_MODELS,
    client,
    refresh_model_token_limits,
)
from ...models import User
from .helpers import log_admin_action

logger = logging.getLogger(__name__)

router = APIRouter()


class AddModelRequest(BaseModel):
    model_id: str
    knowledge_cutoff: str | None = None


class DeleteModelRequest(BaseModel):
    model_id: str


class UpdateModelKnowledgeCutoffRequest(BaseModel):
    model_id: str
    knowledge_cutoff: str | None = None


async def fetch_model_data_from_openrouter(model_id: str) -> dict[str, Any] | None:
    """Fetch model data from OpenRouter's Models API."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            response = await http_client.get(
                "https://openrouter.ai/api/v1/models",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "HTTP-Referer": "https://compareintel.com",
                },
            )

            if response.status_code == 200:
                data = response.json()
                models = data.get("data", [])

                for model in models:
                    if model.get("id") == model_id:
                        return model
    except Exception as e:
        print(f"Error fetching model data from OpenRouter: {e}")

    return None


async def fetch_model_description_from_openrouter(model_id: str) -> str | None:
    """Fetch model description from OpenRouter. Returns first sentence only."""
    model_data = await fetch_model_data_from_openrouter(model_id)
    if not model_data:
        return None

    description = model_data.get("description")
    if description:
        description = description.strip()
        match = re.search(r"([.!?])(?:\s+|$)", description)
        if match:
            end_pos = match.end()
            return description[:end_pos].strip()
        return description

    return None


def calculate_average_cost_per_million_tokens(model_data: dict[str, Any]) -> float | None:
    """Calculate average cost per million tokens from OpenRouter pricing data."""
    pricing = model_data.get("pricing", {})
    if not pricing:
        return None

    try:
        input_price_per_token = float(pricing.get("prompt", 0) or 0)
        output_price_per_token = float(pricing.get("completion", 0) or 0)
    except (ValueError, TypeError):
        return None

    if input_price_per_token == 0 and output_price_per_token == 0:
        return None

    input_price = input_price_per_token * 1_000_000
    output_price = output_price_per_token * 1_000_000

    if input_price > 0 and output_price > 0:
        return (input_price + output_price) / 2
    if input_price > 0:
        return input_price
    if output_price > 0:
        return output_price
    return None


async def classify_model_by_pricing(model_id: str, model_data: dict[str, Any] | None = None) -> str:
    """Classify model into unregistered, free, or paid tier based on OpenRouter pricing."""
    if model_data is None:
        model_data = await fetch_model_data_from_openrouter(model_id)

    if not model_data:
        return "paid"

    avg_cost = calculate_average_cost_per_million_tokens(model_data)

    if avg_cost is None:
        model_name_lower = model_id.lower()
        if ":free" in model_name_lower:
            return "unregistered"
        if any(
            pattern in model_name_lower
            for pattern in ["-mini", "-nano", "-small", "-flash", "-fast", "-medium"]
        ):
            return "free"
        return "paid"

    if avg_cost < 0.5:
        return "unregistered"
    if avg_cost < 3.0:
        return "free"
    return "paid"


def get_model_tier(model_id: str) -> int:
    """Get tier classification: 0=unregistered, 1=free, 2=paid."""
    if model_id in UNREGISTERED_TIER_MODELS:
        return 0
    if model_id in FREE_TIER_MODELS:
        return 1
    return 2


def extract_version_number(model_name: str) -> tuple:
    """Extract version numbers from model name for sorting."""
    version_patterns = [
        r"(\d+)\.(\d+)\.(\d+)",
        r"(\d+)\.(\d+)",
        r"(\d+)",
    ]

    for pattern in version_patterns:
        match = re.search(pattern, model_name)
        if match:
            groups = match.groups()
            if len(groups) == 3:
                return (int(groups[0]), int(groups[1]), int(groups[2]))
            if len(groups) == 2:
                return (int(groups[0]), int(groups[1]), 0)
            if len(groups) == 1:
                return (int(groups[0]), 0, 0)

    return (0, 0, 0)


def sort_models_by_tier_and_version(models: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort models by tier and version."""

    def sort_key(model: dict[str, Any]) -> tuple:
        model_id = model.get("id", "")
        model_name = model.get("name", "")
        tier = get_model_tier(model_id)
        version = extract_version_number(model_name)
        return (tier, version, model_name)

    return sorted(models, key=sort_key)


@router.get("/models")
async def get_admin_models(
    current_user: User = Depends(require_admin_role("admin")),
) -> dict[str, Any]:
    """Get all models organized by provider for admin panel."""
    return {
        "models": OPENROUTER_MODELS,
        "models_by_provider": MODELS_BY_PROVIDER,
    }


@router.post("/models/validate")
async def validate_model(
    request: Request,
    req: AddModelRequest,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Validate that a model exists in OpenRouter and is callable."""
    model_id = req.model_id.strip()

    if not model_id:
        raise HTTPException(status_code=400, detail="Model ID cannot be empty")

    for provider, models in MODELS_BY_PROVIDER.items():
        for model in models:
            if model["id"] == model_id:
                raise HTTPException(
                    status_code=400, detail=f"Model {model_id} already exists in registry"
                )

    model_data = await fetch_model_data_from_openrouter(model_id)
    if not model_data:
        raise HTTPException(
            status_code=404, detail=f"Model {model_id} not found in OpenRouter's model list"
        )

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: client.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=16,
                timeout=10,
            ),
        )

        log_admin_action(
            db=db,
            admin_user=current_user,
            action_type="validate_model",
            action_description=f"Validated model {model_id} exists in OpenRouter",
            target_user_id=None,
            details={"model_id": model_id, "exists": True},
            request=request,
        )

        return {
            "valid": True,
            "model_id": model_id,
            "message": f"Model {model_id} exists in OpenRouter and is callable",
        }

    except HTTPException:
        raise
    except NotFoundError as e:
        raise HTTPException(
            status_code=404,
            detail=f"Model {model_id} found in OpenRouter's list but API call failed: {str(e)}",
        )
    except (RateLimitError, APITimeoutError, APIConnectionError) as e:
        return {
            "valid": False,
            "model_id": model_id,
            "message": f"Model {model_id} exists in OpenRouter but validation failed due to temporary error: {str(e)}. Please try again later.",
        }
    except APIError as e:
        return {
            "valid": False,
            "model_id": model_id,
            "message": f"Model {model_id} exists in OpenRouter's list but API call failed: {str(e)}. The model may require special access, be in beta, or have other restrictions.",
        }
    except Exception as e:
        return {
            "valid": False,
            "model_id": model_id,
            "message": f"Model {model_id} exists in OpenRouter's list but validation failed: {str(e)}",
        }


@router.post("/models/add")
async def add_model(
    request: Request,
    req: AddModelRequest,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Add a new model to the JSON registry and set up its renderer config."""
    import os

    model_id = req.model_id.strip()

    is_development = os.environ.get("ENVIRONMENT") == "development"
    if not is_development:
        raise HTTPException(
            status_code=403,
            detail="Adding models is only available in development environment. Please add models via development and deploy to production.",
        )

    if not model_id:
        raise HTTPException(status_code=400, detail="Model ID cannot be empty")

    # Check against fresh registry (avoids stale MODELS_BY_PROVIDER from import caching)
    registry = load_registry()
    for provider, models in registry["models_by_provider"].items():
        for model in models:
            if model["id"] == model_id:
                raise HTTPException(
                    status_code=400, detail=f"Model {model_id} already exists in registry"
                )

    if "/" not in model_id:
        raise HTTPException(
            status_code=400, detail="Invalid model ID format. Expected: provider/model-name"
        )

    provider_name = model_id.split("/")[0]
    original_provider = provider_name

    if original_provider.lower() == "meta-llama":
        provider_name = "Meta"
    elif original_provider.lower() == "x-ai":
        provider_name = "xAI"
    elif original_provider.lower() == "openai":
        provider_name = "OpenAI"
    else:
        provider_name = provider_name.replace("-", " ").title().replace(" ", "")
        if provider_name.lower() == "xai":
            provider_name = "xAI"
        elif provider_name.lower() == "openai":
            provider_name = "OpenAI"

    model_name = model_id.split("/")[-1]
    model_name = model_name.replace("-", " ").replace("_", " ").title()

    model_description = await fetch_model_description_from_openrouter(model_id)
    if not model_description:
        model_description = f"{provider_name}'s {model_name} model"

    from ...services.model_capability import get_capability_service

    capability_service = get_capability_service()
    supports_web_search = await capability_service.check_tool_calling_support(model_id)

    try:
        mbp = registry["models_by_provider"]

        for existing_provider in mbp.keys():
            if existing_provider.lower() == provider_name.lower():
                provider_name = existing_provider
                break

        new_model = {
            "id": model_id,
            "name": model_name,
            "description": model_description,
            "category": "Language",
            "provider": provider_name,
            "supports_web_search": supports_web_search,
        }
        if hasattr(req, "available") and not req.available:
            new_model["available"] = False
        if hasattr(req, "knowledge_cutoff") and req.knowledge_cutoff:
            new_model["knowledge_cutoff"] = req.knowledge_cutoff
        elif hasattr(req, "knowledge_cutoff") and req.knowledge_cutoff is None:
            new_model["knowledge_cutoff"] = None

        if provider_name not in mbp:
            mbp[provider_name] = []
        # Defensive check: ensure no duplicate within this provider (idempotent safety)
        existing_ids = [m["id"] for m in mbp[provider_name]]
        if model_id in existing_ids:
            raise HTTPException(
                status_code=400, detail=f"Model {model_id} already exists in {provider_name}"
            )
        mbp[provider_name].append(new_model)
        mbp[provider_name] = sort_models_by_tier_and_version(mbp[provider_name])

        model_data = await fetch_model_data_from_openrouter(model_id)
        tier_classification = await classify_model_by_pricing(model_id, model_data)

        unregistered = list(registry["unregistered_tier_models"])
        free_additional = list(registry["free_tier_additional_models"])

        if tier_classification == "unregistered" and model_id not in unregistered:
            unregistered.append(model_id)
            unregistered.sort()
        elif tier_classification == "free" and model_id not in free_additional:
            free_additional.append(model_id)
            free_additional.sort()

        registry["unregistered_tier_models"] = unregistered
        registry["free_tier_additional_models"] = free_additional
        save_registry(registry)
        reload_registry()

        refresh_model_token_limits(model_id)

        backend_dir = Path(__file__).parent.parent.parent.parent
        script_path = backend_dir / "scripts" / "setup_model_renderer.py"
        result = subprocess.run(
            [sys.executable, str(script_path), model_id],
            capture_output=True,
            text=True,
            timeout=600,
            cwd=str(backend_dir),
        )

        if result.returncode != 0:
            error_msg = result.stderr[:500] if result.stderr else "Unknown error"
            raise HTTPException(
                status_code=500,
                detail=f"Model added but renderer config generation failed: {error_msg}",
            )

        from ...cache import invalidate_models_cache

        invalidate_models_cache()

        log_admin_action(
            db=db,
            admin_user=current_user,
            action_type="add_model",
            action_description=f"Added model {model_id} to system",
            target_user_id=None,
            details={"model_id": model_id, "provider": provider_name},
            request=request,
        )

        return {
            "success": True,
            "model_id": model_id,
            "provider": provider_name,
            "supports_web_search": supports_web_search,
            "message": f"Model {model_id} added successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding model: {str(e)}")


@router.post("/models/add-stream")
async def add_model_stream(
    request: Request,
    req: AddModelRequest,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Add a new model with progress streaming via SSE."""
    import os

    is_development = os.environ.get("ENVIRONMENT") == "development"
    if not is_development:

        async def error_stream():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Adding models is only available in development environment. Please add models via development and deploy to production.'})}\n\n"

        return StreamingResponse(error_stream(), media_type="text/event-stream")

    async def generate_progress_stream():
        model_id = req.model_id.strip()

        if not model_id:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Model ID cannot be empty'})}\n\n"
            return

        registry_path = get_registry_path()
        backend_dir = Path(__file__).parent.parent.parent.parent
        project_root = Path(__file__).parent.parent.parent.parent.parent
        config_path = project_root / "frontend" / "src" / "config" / "model_renderer_configs.json"
        backup_registry_path = registry_path.with_suffix(".json.backup")
        backup_config_path = config_path.with_suffix(".json.backup")

        registry_backup = None
        config_backup = None
        process = None

        disconnect_exceptions = (
            BrokenPipeError,
            ConnectionResetError,
            ConnectionAbortedError,
            OSError,
            TimeoutError,
            httpx.ConnectError,
            httpx.TimeoutException,
            httpx.NetworkError,
            httpx.ConnectTimeout,
            httpx.ReadTimeout,
        )

        try:
            registry_backup = load_registry()
            with open(backup_registry_path, "w", encoding="utf-8") as f:
                json.dump(registry_backup, f, indent=2, ensure_ascii=False)
                f.write("\n")

            if config_path.exists():
                with open(config_path, encoding="utf-8") as f:
                    config_backup = f.read()
                with open(backup_config_path, "w", encoding="utf-8") as f:
                    f.write(config_backup)
            else:
                config_backup = None

            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'validating', 'message': f'Validating model {model_id}...', 'progress': 0})}\n\n"
            except disconnect_exceptions:
                raise

            fresh_registry = load_registry()
            for provider, models in fresh_registry.get("models_by_provider", {}).items():
                for model in models:
                    if model.get("id") == model_id:
                        try:
                            yield f"data: {json.dumps({'type': 'error', 'message': f'Model {model_id} already exists in registry. You can update its knowledge cutoff in the models list below.'})}\n\n"
                        except disconnect_exceptions:
                            raise
                        return

            if "/" not in model_id:
                try:
                    yield f"data: {json.dumps({'type': 'error', 'message': 'Invalid model ID format. Expected: provider/model-name'})}\n\n"
                except disconnect_exceptions:
                    raise
                return

            provider_name = model_id.split("/")[0]
            original_provider = provider_name

            if original_provider.lower() == "meta-llama":
                provider_name = "Meta"
            elif original_provider.lower() == "x-ai":
                provider_name = "xAI"
            elif original_provider.lower() == "openai":
                provider_name = "OpenAI"
            else:
                provider_name = provider_name.replace("-", " ").title().replace(" ", "")
                if provider_name.lower() == "xai":
                    provider_name = "xAI"
                elif provider_name.lower() == "openai":
                    provider_name = "OpenAI"

            model_name = model_id.split("/")[-1]
            model_name = model_name.replace("-", " ").replace("_", " ").title()

            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'fetching', 'message': 'Fetching model description from OpenRouter...', 'progress': 10})}\n\n"
            except disconnect_exceptions:
                raise
            model_description = await fetch_model_description_from_openrouter(model_id)

            if not model_description:
                model_description = f"{provider_name}'s {model_name} model"

            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'checking', 'message': 'Checking web search capability...', 'progress': 15})}\n\n"
            except disconnect_exceptions:
                raise
            from ...services.model_capability import get_capability_service

            capability_service = get_capability_service()
            supports_web_search = await capability_service.check_tool_calling_support(model_id)

            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'adding', 'message': 'Adding model to registry...', 'progress': 20})}\n\n"
            except disconnect_exceptions:
                raise

            registry = load_registry()
            mbp = registry["models_by_provider"]

            for existing_provider in mbp.keys():
                if existing_provider.lower() == provider_name.lower():
                    provider_name = existing_provider
                    break

            new_model = {
                "id": model_id,
                "name": model_name,
                "description": model_description,
                "category": "Language",
                "provider": provider_name,
                "supports_web_search": supports_web_search,
            }
            if hasattr(req, "knowledge_cutoff") and req.knowledge_cutoff:
                new_model["knowledge_cutoff"] = req.knowledge_cutoff
            elif hasattr(req, "knowledge_cutoff") and req.knowledge_cutoff is None:
                new_model["knowledge_cutoff"] = None

            if provider_name not in mbp:
                mbp[provider_name] = []
            mbp[provider_name].append(new_model)
            mbp[provider_name] = sort_models_by_tier_and_version(mbp[provider_name])

            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'classifying', 'message': 'Classifying model tier based on pricing...', 'progress': 25})}\n\n"
            except disconnect_exceptions:
                raise

            try:
                model_data = await fetch_model_data_from_openrouter(model_id)
                tier_classification = await classify_model_by_pricing(model_id, model_data)
            except disconnect_exceptions:
                raise

            unregistered = list(registry["unregistered_tier_models"])
            free_additional = list(registry["free_tier_additional_models"])
            if tier_classification == "unregistered" and model_id not in unregistered:
                unregistered.append(model_id)
                unregistered.sort()
            elif tier_classification == "free" and model_id not in free_additional:
                free_additional.append(model_id)
                free_additional.sort()
            registry["unregistered_tier_models"] = unregistered
            registry["free_tier_additional_models"] = free_additional

            save_registry(registry)
            reload_registry()

            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'classifying', 'message': f'Model classified as {tier_classification} tier', 'progress': 27})}\n\n"
            except disconnect_exceptions:
                raise

            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'setup', 'message': 'Starting renderer configuration setup...', 'progress': 30})}\n\n"
            except disconnect_exceptions:
                raise

            def _has_model_config(mid: str, path: Path) -> bool:
                """Check if model already has a renderer configuration."""
                if not path.exists():
                    return False
                try:
                    with open(path, encoding="utf-8") as f:
                        configs = json.load(f)
                except Exception:
                    return False
                if isinstance(configs, list):
                    return any(c.get("modelId") == mid for c in configs if isinstance(c, dict))
                if isinstance(configs, dict):
                    return mid in configs
                return False

            backend_dir = Path(__file__).parent.parent.parent.parent
            script_path = backend_dir / "scripts" / "setup_model_renderer.py"

            if _has_model_config(model_id, config_path):
                try:
                    yield f"data: {json.dumps({'type': 'progress', 'stage': 'setup', 'message': 'Renderer config already exists, skipping setup...', 'progress': 90})}\n\n"
                except disconnect_exceptions:
                    raise
                process = None
            else:
                process = await asyncio.create_subprocess_exec(
                    sys.executable,
                    str(script_path),
                    model_id,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=str(backend_dir),
                )

            if process is not None:
                stderr_lines = []

                while True:
                    try:
                        line_bytes = await process.stdout.readline()
                    except disconnect_exceptions:
                        if process:
                            try:
                                process.kill()
                            except Exception:
                                pass
                        raise
                    if not line_bytes:
                        break

                    line_str = line_bytes.decode("utf-8").strip()
                    if line_str.startswith("PROGRESS:"):
                        try:
                            progress_json = json.loads(line_str[9:])
                            stage = progress_json.get("stage", "processing")
                            message = progress_json.get("message", "Processing...")
                            script_progress = progress_json.get("progress", 0)

                            if stage == "starting":
                                mapped_progress = 30
                            elif stage == "collecting":
                                mapped_progress = 30 + (script_progress * 0.3)
                            elif stage == "analyzing":
                                mapped_progress = 60 + (script_progress * 0.2)
                            elif stage == "generating":
                                mapped_progress = 80 + (script_progress * 0.1)
                            elif stage == "saving":
                                mapped_progress = 90 + (script_progress * 0.05)
                            else:
                                mapped_progress = 30 + (script_progress * 0.65)

                            try:
                                yield f"data: {json.dumps({'type': 'progress', 'stage': stage, 'message': message, 'progress': mapped_progress})}\n\n"
                            except disconnect_exceptions:
                                if process:
                                    try:
                                        process.kill()
                                    except Exception:
                                        pass
                                raise
                        except json.JSONDecodeError:
                            pass

                stderr_data = await process.stderr.read()
                if stderr_data:
                    stderr_lines = stderr_data.decode("utf-8").split("\n")

                return_code = await process.wait()

                if return_code != 0:
                    error_msg = (
                        "\n".join(stderr_lines[-10:])[:500] if stderr_lines else "Unknown error"
                    )
                    try:
                        yield f"data: {json.dumps({'type': 'error', 'message': f'Renderer config generation failed: {error_msg}'})}\n\n"
                    except disconnect_exceptions:
                        raise
                    return

            try:
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'finalizing', 'message': 'Finalizing model addition...', 'progress': 95})}\n\n"
            except disconnect_exceptions:
                raise

            from ...cache import invalidate_models_cache

            invalidate_models_cache()

            log_admin_action(
                db=db,
                admin_user=current_user,
                action_type="add_model",
                action_description=f"Added model {model_id} to system",
                target_user_id=None,
                details={"model_id": model_id, "provider": provider_name},
                request=request,
            )

            try:
                yield f"data: {json.dumps({'type': 'success', 'message': f'Model {model_id} added successfully', 'model_id': model_id, 'provider': provider_name, 'supports_web_search': supports_web_search, 'progress': 100})}\n\n"
            except disconnect_exceptions:
                raise

            try:
                if backup_registry_path.exists():
                    backup_registry_path.unlink()
                if backup_config_path.exists() and config_backup:
                    backup_config_path.unlink()
            except Exception:
                pass

        except disconnect_exceptions:
            try:
                if process and process.returncode is None:
                    try:
                        process.kill()
                        await process.wait()
                    except Exception:
                        pass

                if registry_backup is not None and backup_registry_path.exists():
                    try:
                        save_registry(registry_backup)
                        reload_registry()
                        backup_registry_path.unlink()
                    except Exception as restore_error:
                        print(f"Error restoring registry backup: {restore_error}", file=sys.stderr)

                if config_backup and backup_config_path.exists():
                    with open(config_path, "w", encoding="utf-8") as f:
                        f.write(config_backup)
                    backup_config_path.unlink()
                else:
                    if config_path.exists():
                        try:
                            with open(config_path, encoding="utf-8") as f:
                                configs = json.load(f)
                            if isinstance(configs, dict) and model_id in configs:
                                del configs[model_id]
                                with open(config_path, "w", encoding="utf-8") as f:
                                    json.dump(configs, f, indent=2)
                        except Exception:
                            pass
            except Exception as cleanup_error:
                print(f"Error during rollback cleanup: {cleanup_error}", file=sys.stderr)
            return
        except HTTPException as e:
            try:
                yield f"data: {json.dumps({'type': 'error', 'message': e.detail})}\n\n"
            except disconnect_exceptions:
                raise
        except Exception as e:
            try:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Error adding model: {str(e)}'})}\n\n"
            except disconnect_exceptions:
                raise
            finally:
                try:
                    if process and process.returncode is None:
                        try:
                            process.kill()
                            await process.wait()
                        except Exception:
                            pass

                    if backup_registry_path.exists() and registry_backup is not None:
                        try:
                            save_registry(registry_backup)
                            reload_registry()
                            backup_registry_path.unlink()
                        except Exception as restore_error:
                            print(
                                f"Error restoring registry backup in finally block: {restore_error}",
                                file=sys.stderr,
                            )

                    if backup_config_path.exists() and config_backup:
                        with open(config_path, "w", encoding="utf-8") as f:
                            f.write(config_backup)
                        backup_config_path.unlink()
                except Exception:
                    pass

    return StreamingResponse(generate_progress_stream(), media_type="text/event-stream")


@router.post("/models/delete")
async def delete_model(
    request: Request,
    req: DeleteModelRequest,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Delete a model from the JSON registry and remove its renderer config."""
    import os

    is_development = os.environ.get("ENVIRONMENT") == "development"
    if not is_development:
        raise HTTPException(
            status_code=403,
            detail="Deleting models is only available in development environment. Please delete models via development and deploy to production.",
        )

    model_id = req.model_id.strip()

    if not model_id:
        raise HTTPException(status_code=400, detail="Model ID cannot be empty")

    model_found = False
    provider_name = None
    for provider, models in MODELS_BY_PROVIDER.items():
        for model in models:
            if model["id"] == model_id:
                model_found = True
                provider_name = provider
                break
        if model_found:
            break

    if not model_found:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found in registry")

    try:
        registry = load_registry()
        mbp = registry["models_by_provider"]

        if provider_name not in mbp:
            raise HTTPException(status_code=404, detail=f"Model {model_id} not found in registry")

        models_list = [m for m in mbp[provider_name] if m["id"] != model_id]
        if len(models_list) == len(mbp[provider_name]):
            raise HTTPException(
                status_code=500, detail=f"Failed to remove model {model_id} from registry"
            )

        mbp[provider_name] = models_list
        if not models_list:
            del mbp[provider_name]

        unregistered = [m for m in registry["unregistered_tier_models"] if m != model_id]
        free_additional = [m for m in registry["free_tier_additional_models"] if m != model_id]
        registry["unregistered_tier_models"] = unregistered
        registry["free_tier_additional_models"] = free_additional

        save_registry(registry)
        reload_registry()

        backend_dir = Path(__file__).parent.parent.parent.parent
        project_root = backend_dir.parent
        frontend_config_path = (
            project_root / "frontend" / "src" / "config" / "model_renderer_configs.json"
        )

        config_removed = False
        if frontend_config_path.exists():
            try:
                with open(frontend_config_path, encoding="utf-8") as f:
                    configs = json.load(f)

                initial_count = len(configs) if isinstance(configs, list) else len(configs)

                if isinstance(configs, list):
                    configs = [c for c in configs if c.get("modelId") != model_id]
                    config_removed = len(configs) < initial_count
                elif isinstance(configs, dict):
                    config_removed = model_id in configs
                    configs.pop(model_id, None)
                    configs = list(configs.values())

                with open(frontend_config_path, "w", encoding="utf-8") as f:
                    json.dump(configs, f, indent=2, ensure_ascii=False)

                if config_removed:
                    logger.info(
                        f"Removed renderer config for {model_id} from {frontend_config_path}"
                    )
            except Exception as e:
                logger.error(
                    f"Failed to remove renderer config for {model_id} from {frontend_config_path}: {e}"
                )
                raise HTTPException(
                    status_code=500,
                    detail=f"Model removed from registry, but failed to remove renderer config: {str(e)}",
                )

        from ...cache import invalidate_models_cache

        invalidate_models_cache()

        log_admin_action(
            db=db,
            admin_user=current_user,
            action_type="delete_model",
            action_description=f"Deleted model {model_id} from system",
            target_user_id=None,
            details={"model_id": model_id, "provider": provider_name},
            request=request,
        )

        return {
            "success": True,
            "model_id": model_id,
            "message": f"Model {model_id} deleted successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting model: {str(e)}")


@router.post("/models/update-knowledge-cutoff")
async def update_model_knowledge_cutoff(
    request: Request,
    req: UpdateModelKnowledgeCutoffRequest,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Update the knowledge cutoff date for a model."""
    model_id = req.model_id.strip()

    if not model_id:
        raise HTTPException(status_code=400, detail="Model ID cannot be empty")

    model_found = False
    provider_name = None

    for provider, models in MODELS_BY_PROVIDER.items():
        for model in models:
            if model["id"] == model_id:
                model_found = True
                provider_name = provider
                break
        if model_found:
            break

    if not model_found:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")

    try:
        registry = load_registry()
        mbp = registry["models_by_provider"]

        if provider_name not in mbp:
            raise HTTPException(
                status_code=500, detail=f"Could not find provider {provider_name} in registry"
            )

        for model in mbp[provider_name]:
            if model["id"] == model_id:
                if req.knowledge_cutoff == "":
                    model.pop("knowledge_cutoff", None)
                elif req.knowledge_cutoff is not None:
                    model["knowledge_cutoff"] = req.knowledge_cutoff
                else:
                    model["knowledge_cutoff"] = None
                break
        else:
            raise HTTPException(status_code=404, detail=f"Model {model_id} not found in registry")

        save_registry(registry)
        reload_registry()

        from ...cache import invalidate_models_cache

        invalidate_models_cache()

        log_admin_action(
            db=db,
            admin_user=current_user,
            action_type="update_model_knowledge_cutoff",
            action_description=f"Updated knowledge cutoff for model {model_id}",
            target_user_id=None,
            details={"model_id": model_id, "knowledge_cutoff": req.knowledge_cutoff or "pending"},
            request=request,
        )

        return {
            "success": True,
            "model_id": model_id,
            "knowledge_cutoff": req.knowledge_cutoff,
            "message": f"Knowledge cutoff updated for {model_id}",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating knowledge cutoff: {str(e)}")
