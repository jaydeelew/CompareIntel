"""Streaming comparison service - generates SSE stream for model comparisons."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from decimal import ROUND_CEILING, Decimal
from typing import TYPE_CHECKING, Any

from openai import OpenAI

from ..config import get_conversation_limit

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
from ..config.settings import settings
from ..credit_manager import get_user_credits
from ..database import SessionLocal
from ..model_runner import (
    MODELS_BY_PROVIDER,
    call_openrouter_streaming,
    clean_model_response,
    estimate_token_count,
    get_min_max_output_tokens,
)
from ..models import AppSettings, Conversation, User
from ..models import ConversationMessage as ConversationMessageModel
from ..rate_limiting import (
    check_anonymous_credits,
    deduct_anonymous_credits,
    deduct_user_credits,
)
from ..routers.api.dev import _default_model_stat
from ..search.factory import SearchProviderFactory

logger = logging.getLogger(__name__)


@dataclass
class StreamContext:
    """Context passed to generate_stream."""

    req: Any
    db: Session
    client_ip: str
    user_timezone: str
    user_location: str | None
    location_source: str | None
    num_models: int
    start_time: datetime
    user_id: int | None
    has_authenticated_user: bool
    is_overage: bool = False
    overage_charge: float = 0.0
    credits_remaining_ref: list[int] = field(default_factory=lambda: [0])
    model_stats: defaultdict[str, dict[str, Any]] = field(
        default_factory=lambda: defaultdict(_default_model_stat)
    )


async def generate_stream(ctx: StreamContext) -> Any:
    """
    Generate streaming response for all models.
    Async generator that yields SSE-formatted events.
    """
    from ..model_runner import count_conversation_tokens

    req = ctx.req
    credits_remaining = ctx.credits_remaining_ref
    model_stats = ctx.model_stats
    model_inactivity_timeout = settings.model_inactivity_timeout

    successful_models = 0
    failed_models = 0
    results_dict = {}
    done_sent: set[str] = set()
    total_input_tokens = 0
    total_output_tokens = 0
    total_effective_tokens = 0
    usage_data_dict = {}
    total_credits_used = Decimal(0)

    is_development = os.environ.get("ENVIRONMENT") == "development"
    use_mock = False

    if ctx.has_authenticated_user and ctx.user_id:
        fresh_db = SessionLocal()
        try:
            fresh_user = fresh_db.query(User).filter(User.id == ctx.user_id).first()
            if fresh_user and fresh_user.mock_mode_enabled:
                if is_development or fresh_user.role in ["admin", "super_admin"]:
                    use_mock = True
        finally:
            fresh_db.close()
    elif not ctx.has_authenticated_user:
        if is_development:
            from ..cache import get_cached_app_settings

            def get_settings():
                return ctx.db.query(AppSettings).first()

            app_settings = get_cached_app_settings(get_settings)
            if app_settings and app_settings.anonymous_mock_mode_enabled:
                use_mock = True

    try:
        model_id = req.models[0] if req.models else None
        input_tokens = estimate_token_count(req.input_data, model_id=model_id)
        if req.conversation_history:
            input_tokens += count_conversation_tokens(req.conversation_history, model_id=model_id)

        effective_max_tokens = get_min_max_output_tokens(req.models)
        credits_limited = False
        credits_per_model = (
            Decimal(credits_remaining[0]) / Decimal(ctx.num_models)
            if ctx.num_models > 0
            else Decimal(0)
        )
        MIN_USABLE_OUTPUT_TOKENS = 300

        if credits_remaining[0] > 0 and credits_per_model < 2:
            effective_tokens_per_model = credits_per_model * Decimal(1000)
            max_output_tokens_calc = (effective_tokens_per_model - Decimal(input_tokens)) / Decimal(
                2.5
            )
            max_output_tokens_int = max(MIN_USABLE_OUTPUT_TOKENS, int(max_output_tokens_calc))
            if (
                max_output_tokens_int == MIN_USABLE_OUTPUT_TOKENS
                and max_output_tokens_calc < MIN_USABLE_OUTPUT_TOKENS
            ):
                logger.info(
                    f"Low credits per model ({credits_per_model:.2f}) - enforcing minimum "
                    f"usable response ({MIN_USABLE_OUTPUT_TOKENS} tokens)."
                )
            original_max_tokens = effective_max_tokens
            effective_max_tokens = min(effective_max_tokens, max_output_tokens_int)
            if effective_max_tokens < original_max_tokens:
                credits_limited = True

        if req.enable_web_search:
            logger.info(f"Web search requested for comparison with models: {req.models}.")

        logger.info(f"[MultiModel] Starting comparison for {len(req.models)} models: {req.models}")
        for mid in req.models:
            yield f"data: {json.dumps({'model': mid, 'type': 'start'})}\n\n"

        chunk_queue = asyncio.Queue()
        loop = asyncio.get_event_loop()
        executor = ThreadPoolExecutor(max_workers=max(len(req.models), 1))
        KEEPALIVE_INTERVAL = 10
        last_keepalive_sent: dict[str, float] = {}

        async def stream_single_model(model_id: str):
            model_content = ""
            chunk_count = 0

            try:
                enable_web_search_for_model = False
                search_provider_instance = None

                if req.enable_web_search:
                    model_supports_web_search = False
                    for provider_models in MODELS_BY_PROVIDER.values():
                        for model in provider_models:
                            if model["id"] == model_id and model.get("supports_web_search"):
                                model_supports_web_search = True
                                break
                        if model_supports_web_search:
                            break

                    if model_supports_web_search:
                        search_provider_instance = SearchProviderFactory.get_active_provider(ctx.db)
                        if search_provider_instance:
                            enable_web_search_for_model = True

                def process_stream_to_queue():
                    content = ""
                    count = 0
                    usage_data = None
                    last_chunk_was_keepalive = False

                    try:
                        logger.info(f"[MultiModel] {model_id}: thread started")
                        filtered_history = []
                        if req.conversation_history:
                            for msg in req.conversation_history:
                                if msg.role == "user":
                                    filtered_history.append(msg)
                                elif msg.role == "assistant":
                                    if msg.model_id is None or msg.model_id == model_id:
                                        filtered_history.append(msg)

                        per_model_client = (
                            None
                            if use_mock
                            else OpenAI(
                                api_key=settings.openrouter_api_key,
                                base_url="https://openrouter.ai/api/v1",
                                default_headers={
                                    "HTTP-Referer": "https://compareintel.com",
                                    "X-Title": "CompareIntel",
                                },
                            )
                        )
                        gen = call_openrouter_streaming(
                            req.input_data,
                            model_id,
                            filtered_history,
                            use_mock,
                            max_tokens_override=effective_max_tokens,
                            credits_limited=credits_limited,
                            enable_web_search=enable_web_search_for_model,
                            search_provider=search_provider_instance,
                            user_timezone=ctx.user_timezone,
                            user_location=ctx.user_location,
                            location_source=ctx.location_source,
                            _client=per_model_client,
                        )

                        logger.info(f"[MultiModel] {model_id}: calling API")
                        try:
                            while True:
                                chunk = next(gen)
                                is_keepalive = False
                                if chunk == " ":
                                    if len(content) == 0:
                                        is_keepalive = True
                                    elif content.rstrip() != content:
                                        is_keepalive = True
                                    elif last_chunk_was_keepalive:
                                        is_keepalive = True

                                if is_keepalive:
                                    last_chunk_was_keepalive = True
                                    asyncio.run_coroutine_threadsafe(
                                        chunk_queue.put({"type": "keepalive", "model": model_id}),
                                        loop,
                                    )
                                else:
                                    last_chunk_was_keepalive = False
                                    content += chunk
                                    count += 1
                                    asyncio.run_coroutine_threadsafe(
                                        chunk_queue.put(
                                            {
                                                "type": "chunk",
                                                "model": model_id,
                                                "content": chunk,
                                                "chunk_count": count,
                                            }
                                        ),
                                        loop,
                                    )
                        except StopIteration as e:
                            usage_data = e.value

                        logger.info(
                            f"[MultiModel] {model_id}: streaming complete, {count} chunks, content_len={len(content)}"
                        )
                        return content, False, usage_data

                    except Exception as e:
                        error_msg = f"Error: {str(e)[:100]}"
                        logger.error(f"[MultiModel] {model_id}: EXCEPTION: {str(e)}", exc_info=True)
                        asyncio.run_coroutine_threadsafe(
                            chunk_queue.put(
                                {"type": "chunk", "model": model_id, "content": error_msg}
                            ),
                            loop,
                        )
                        return error_msg, True, None

                full_content, is_error, usage_data = await loop.run_in_executor(
                    executor, process_stream_to_queue
                )

                if not is_error:
                    model_content = clean_model_response(full_content)
                else:
                    model_content = full_content

                if not is_error and model_content:
                    import re

                    trimmed_content = model_content.strip()
                    backend_error_patterns = [
                        r"^Error:\s*Timeout\s*\(",
                        r"^Error:\s*Rate\s*limit",
                        r"^Error:\s*Model\s*not\s*available",
                        r"^Error:\s*Authentication\s*failed",
                        r"^Error:\s*\d+",
                    ]

                    if trimmed_content.startswith("Error:"):
                        matches_pattern = any(
                            re.match(pattern, trimmed_content, re.IGNORECASE)
                            for pattern in backend_error_patterns
                        )
                        if matches_pattern:
                            is_error = True
                        elif len(trimmed_content) < 100 and not any(
                            c in trimmed_content for c in ".!?"
                        ):
                            is_error = True

                    elif len(trimmed_content) > 200:
                        error_index = trimmed_content.lower().rfind("error:")
                        if error_index >= len(trimmed_content) - 200:
                            error_text = trimmed_content[error_index:]
                            matches_pattern = any(
                                re.match(pattern, error_text, re.IGNORECASE)
                                for pattern in backend_error_patterns
                            )
                            if matches_pattern:
                                is_error = True

                return {
                    "model": model_id,
                    "content": model_content,
                    "error": is_error,
                    "usage": usage_data,
                }

            except Exception as e:
                error_msg = f"Error: {str(e)[:100]}"
                await chunk_queue.put({"type": "chunk", "model": model_id, "content": error_msg})
                return {"model": model_id, "content": error_msg, "error": True, "usage": None}

        try:
            tasks = [asyncio.create_task(stream_single_model(mid)) for mid in req.models]
            task_to_model = {task: mid for task, mid in zip(tasks, req.models)}
            pending_tasks = set(tasks)
            model_last_activity = {mid: time.time() for mid in req.models}

            while pending_tasks or not chunk_queue.empty():
                chunks_processed = False
                current_time = time.time()

                timed_out_tasks = set()
                for task in list(pending_tasks):
                    if task.done():
                        continue
                    mid = task_to_model.get(task)
                    if mid and mid in model_last_activity:
                        time_since_activity = current_time - model_last_activity[mid]
                        if time_since_activity > model_inactivity_timeout:
                            logger.warning(
                                f"Model {mid} timed out after {model_inactivity_timeout}s of inactivity"
                            )
                            task.cancel()
                            timed_out_tasks.add(task)
                            await chunk_queue.put(
                                {
                                    "type": "chunk",
                                    "model": mid,
                                    "content": "Error: Model timed out after 1 minute of inactivity",
                                }
                            )
                            results_dict[mid] = (
                                "Error: Model timed out after 1 minute of inactivity"
                            )
                            done_sent.add(mid)
                            model_stats[mid]["failure"] += 1
                            failed_models += 1
                            yield f"data: {json.dumps({'model': mid, 'type': 'done', 'error': True})}\n\n"
                            if mid in model_last_activity:
                                del model_last_activity[mid]

                pending_tasks -= timed_out_tasks

                while not chunk_queue.empty():
                    try:
                        chunk_data = await asyncio.wait_for(chunk_queue.get(), timeout=0.001)
                        chunk_model_id = chunk_data.get("model")
                        if chunk_model_id:
                            model_last_activity[chunk_model_id] = time.time()

                        if chunk_data["type"] == "chunk":
                            yield f"data: {json.dumps({'model': chunk_data['model'], 'type': 'chunk', 'content': chunk_data['content']})}\n\n"
                            chunks_processed = True
                        elif chunk_data["type"] == "keepalive":
                            yield f"data: {json.dumps({'model': chunk_data['model'], 'type': 'keepalive'})}\n\n"
                            chunks_processed = True
                    except TimeoutError:
                        break

                for task in list(pending_tasks):
                    mid = task_to_model.get(task)
                    if not mid:
                        continue
                    last_activity = model_last_activity.get(mid, 0)
                    if current_time - last_activity >= KEEPALIVE_INTERVAL:
                        last_sent = last_keepalive_sent.get(mid, 0)
                        if current_time - last_sent >= KEEPALIVE_INTERVAL:
                            yield f"data: {json.dumps({'model': mid, 'type': 'keepalive'})}\n\n"
                            last_keepalive_sent[mid] = current_time
                            model_last_activity[mid] = current_time
                            chunks_processed = True

                await asyncio.sleep(0)

                while not chunk_queue.empty():
                    try:
                        chunk_data = await asyncio.wait_for(chunk_queue.get(), timeout=0.001)
                        chunk_model_id = chunk_data.get("model")
                        if chunk_model_id:
                            model_last_activity[chunk_model_id] = time.time()
                        if chunk_data["type"] == "chunk":
                            yield f"data: {json.dumps({'model': chunk_data['model'], 'type': 'chunk', 'content': chunk_data['content']})}\n\n"
                            chunks_processed = True
                        elif chunk_data["type"] == "keepalive":
                            yield f"data: {json.dumps({'model': chunk_data['model'], 'type': 'keepalive'})}\n\n"
                            chunks_processed = True
                    except TimeoutError:
                        break

                done_tasks = set()
                for task in list(pending_tasks):
                    if task.done():
                        logger.info(f"[MultiModel] Task done for model {task_to_model.get(task)}")
                        done_tasks.add(task)
                        pending_tasks.remove(task)

                if done_tasks:
                    await asyncio.sleep(0)
                    while not chunk_queue.empty():
                        try:
                            chunk_data = await asyncio.wait_for(chunk_queue.get(), timeout=0.001)
                            chunk_model_id = chunk_data.get("model")
                            if chunk_model_id:
                                model_last_activity[chunk_model_id] = time.time()
                            if chunk_data["type"] == "chunk":
                                yield f"data: {json.dumps({'model': chunk_data['model'], 'type': 'chunk', 'content': chunk_data['content']})}\n\n"
                                chunks_processed = True
                            elif chunk_data["type"] == "keepalive":
                                yield f"data: {json.dumps({'model': chunk_data['model'], 'type': 'keepalive'})}\n\n"
                                chunks_processed = True
                        except TimeoutError:
                            break

                for task in done_tasks:
                    mid = task_to_model.get(task)
                    if not mid:
                        continue

                    if task.cancelled():
                        continue

                    try:
                        result = await task
                    except asyncio.CancelledError:
                        continue
                    except Exception as e:
                        logger.error(f"Task for model {mid} failed: {e}", exc_info=True)
                        results_dict[mid] = f"Error: {str(e)[:100]}"
                        done_sent.add(mid)
                        failed_models += 1
                        model_stats[mid]["failure"] += 1
                        yield f"data: {json.dumps({'model': mid, 'type': 'done', 'error': True})}\n\n"
                        continue

                    result_model_id = result.get("model")
                    if result_model_id:
                        mid = result_model_id

                    if result["error"]:
                        failed_models += 1
                        model_stats[mid]["failure"] += 1
                        model_stats[mid]["last_error"] = datetime.now().isoformat()
                    else:
                        successful_models += 1
                        model_stats[mid]["success"] += 1
                        model_stats[mid]["last_success"] = datetime.now().isoformat()

                        usage = result.get("usage")
                        if usage:
                            usage_data_dict[mid] = usage
                            total_input_tokens += usage.prompt_tokens
                            total_output_tokens += usage.completion_tokens
                            total_effective_tokens += usage.effective_tokens

                    results_dict[mid] = result["content"]
                    done_sent.add(mid)
                    logger.info(
                        f"[MultiModel] {mid}: sending done event, error={result['error']}, content_len={len(result.get('content', ''))}"
                    )
                    yield f"data: {json.dumps({'model': mid, 'type': 'done', 'error': result['error']})}\n\n"

                if pending_tasks and not chunks_processed:
                    await asyncio.sleep(0.01)
                elif chunks_processed:
                    await asyncio.sleep(0)

        finally:
            executor.shutdown(wait=False)

        logger.info(
            f"[MultiModel] While loop exited. done_sent={done_sent}, pending_tasks remaining={len(pending_tasks)}"
        )
        for mid in req.models:
            if mid not in done_sent:
                is_err = (
                    mid in results_dict
                    and isinstance(results_dict.get(mid, ""), str)
                    and str(results_dict.get(mid, "")).startswith("Error:")
                )
                logger.info(f"[MultiModel] Safety check: sending done for {mid}, error={is_err}")
                yield f"data: {json.dumps({'model': mid, 'type': 'done', 'error': is_err})}\n\n"
            else:
                logger.info(f"[MultiModel] Safety check: {mid} already in done_sent")

        if successful_models > 0:
            if total_effective_tokens > 0:
                total_credits_used = Decimal(total_effective_tokens) / Decimal(1000)
            else:
                total_credits_used = Decimal(successful_models)

            total_credits_used = max(
                Decimal(1),
                total_credits_used.quantize(Decimal("1"), rounding=ROUND_CEILING),
            )
            actual_credits_used = total_credits_used

            if total_credits_used <= 0:
                total_credits_used = Decimal(1)
                actual_credits_used = total_credits_used

            credit_db = SessionLocal()
            try:
                if ctx.user_id:
                    credit_user = credit_db.query(User).filter(User.id == ctx.user_id).first()
                    if credit_user:
                        deduct_user_credits(
                            credit_user,
                            total_credits_used,
                            None,
                            credit_db,
                            description=f"Credits used for {successful_models} model comparison(s) (streaming)",
                        )
                        credit_db.refresh(credit_user)
                        credits_remaining[0] = get_user_credits(ctx.user_id, credit_db)
                else:
                    ip_identifier = f"ip:{ctx.client_ip}"
                    deduct_anonymous_credits(ip_identifier, total_credits_used, ctx.user_timezone)
                    _, ip_credits_remaining, _ = check_anonymous_credits(
                        ip_identifier, Decimal(0), ctx.user_timezone
                    )
                    fingerprint_credits_remaining = ip_credits_remaining
                    if req.browser_fingerprint:
                        fp_identifier = f"fp:{req.browser_fingerprint}"
                        deduct_anonymous_credits(
                            fp_identifier, total_credits_used, ctx.user_timezone
                        )
                        _, fingerprint_credits_remaining, _ = check_anonymous_credits(
                            fp_identifier, Decimal(0), ctx.user_timezone
                        )
                        credits_remaining[0] = min(
                            ip_credits_remaining,
                            fingerprint_credits_remaining,
                        )
                    else:
                        credits_remaining[0] = ip_credits_remaining
            except Exception as e:
                logger.error(f"Credit deduction failed: {e}", exc_info=True)
                if not ctx.user_id:
                    ip_identifier = f"ip:{ctx.client_ip}"
                    _, ip_credits_remaining, _ = check_anonymous_credits(
                        ip_identifier, Decimal(0), ctx.user_timezone
                    )
                    fingerprint_credits_remaining = ip_credits_remaining
                    if req.browser_fingerprint:
                        fp_identifier = f"fp:{req.browser_fingerprint}"
                        _, fingerprint_credits_remaining, _ = check_anonymous_credits(
                            fp_identifier, Decimal(0), ctx.user_timezone
                        )
                        credits_remaining[0] = min(
                            ip_credits_remaining,
                            fingerprint_credits_remaining,
                        )
                    else:
                        credits_remaining[0] = ip_credits_remaining
            finally:
                credit_db.close()
        else:
            if not ctx.user_id:
                ip_identifier = f"ip:{ctx.client_ip}"
                _, ip_credits_remaining, _ = check_anonymous_credits(
                    ip_identifier, Decimal(0), ctx.user_timezone
                )
                fingerprint_credits_remaining = ip_credits_remaining
                if req.browser_fingerprint:
                    fp_identifier = f"fp:{req.browser_fingerprint}"
                    _, fingerprint_credits_remaining, _ = check_anonymous_credits(
                        fp_identifier, Decimal(0), ctx.user_timezone
                    )
                    credits_remaining[0] = min(
                        ip_credits_remaining,
                        fingerprint_credits_remaining,
                    )
                else:
                    credits_remaining[0] = ip_credits_remaining

        if not ctx.user_id and successful_models > 0:
            ip_identifier = f"ip:{ctx.client_ip}"
            _, ip_credits_remaining, _ = check_anonymous_credits(
                ip_identifier, Decimal(0), ctx.user_timezone
            )
            fingerprint_credits_remaining = ip_credits_remaining
            if req.browser_fingerprint:
                fp_identifier = f"fp:{req.browser_fingerprint}"
                _, fingerprint_credits_remaining, _ = check_anonymous_credits(
                    fp_identifier, Decimal(0), ctx.user_timezone
                )
                credits_remaining[0] = min(
                    ip_credits_remaining,
                    fingerprint_credits_remaining,
                )
            else:
                credits_remaining[0] = ip_credits_remaining

        processing_time_ms = int((datetime.now() - ctx.start_time).total_seconds() * 1000)

        metadata = {
            "input_length": len(req.input_data),
            "models_requested": len(req.models),
            "models_successful": successful_models,
            "models_failed": failed_models,
            "timestamp": datetime.now().isoformat(),
            "processing_time_ms": processing_time_ms,
            "credits_used": float(total_credits_used),
            "credits_remaining": int(credits_remaining[0]),
        }

        from ..models import UsageLog

        usage_log = UsageLog(
            user_id=ctx.user_id,
            ip_address=ctx.client_ip,
            browser_fingerprint=req.browser_fingerprint,
            models_used=json.dumps(req.models),
            input_length=len(req.input_data),
            models_requested=len(req.models),
            models_successful=successful_models,
            models_failed=failed_models,
            processing_time_ms=processing_time_ms,
            estimated_cost=len(req.models) * 0.0166,
            is_overage=ctx.is_overage,
            overage_charge=ctx.overage_charge,
            input_tokens=total_input_tokens if total_input_tokens > 0 else None,
            output_tokens=total_output_tokens if total_output_tokens > 0 else None,
            total_tokens=(
                total_input_tokens + total_output_tokens
                if (total_input_tokens > 0 or total_output_tokens > 0)
                else None
            ),
            effective_tokens=total_effective_tokens if total_effective_tokens > 0 else None,
            credits_used=total_credits_used,
        )
        log_db = SessionLocal()
        try:
            log_db.add(usage_log)
            log_db.commit()
        except Exception as e:
            logger.error(f"Failed to commit UsageLog: {e}")
            log_db.rollback()
        finally:
            log_db.close()

        if ctx.user_id and successful_models > 0:

            def save_conversation_to_db():
                conv_db = SessionLocal()
                try:
                    is_follow_up = bool(
                        req.conversation_history and len(req.conversation_history) > 0
                    )
                    existing_conversation: Conversation | None = None

                    if is_follow_up:
                        if req.conversation_id:
                            conversation_by_id = (
                                conv_db.query(Conversation)
                                .filter(
                                    Conversation.id == req.conversation_id,
                                    Conversation.user_id == ctx.user_id,
                                )
                                .first()
                            )
                            if conversation_by_id:
                                existing_conversation = conversation_by_id

                        if not existing_conversation:
                            original_input_data = None
                            for msg in req.conversation_history:
                                if msg.role == "user":
                                    original_input_data = msg.content
                                    break

                            req_models_sorted = sorted(req.models)
                            all_user_conversations = (
                                conv_db.query(Conversation)
                                .filter(Conversation.user_id == ctx.user_id)
                                .order_by(Conversation.updated_at.desc())
                                .all()
                            )

                            for conv in all_user_conversations:
                                try:
                                    conv_models = (
                                        json.loads(conv.models_used) if conv.models_used else []
                                    )
                                    models_match = sorted(conv_models) == req_models_sorted
                                    input_matches = (
                                        original_input_data
                                        and conv.input_data == original_input_data
                                    )
                                    if models_match and input_matches:
                                        existing_conversation = conv
                                        break
                                except (json.JSONDecodeError, TypeError):
                                    continue

                    if existing_conversation:
                        conversation = existing_conversation
                        conversation.updated_at = datetime.now()
                    else:
                        conversation = Conversation(
                            user_id=ctx.user_id,
                            input_data=req.input_data,
                            models_used=json.dumps(req.models),
                        )
                        conv_db.add(conversation)
                        conv_db.flush()

                    user_input_tokens = None
                    actual_prompt_tokens = None
                    if usage_data_dict:
                        first_model_usage = next(iter(usage_data_dict.values()))
                        if first_model_usage:
                            actual_prompt_tokens = first_model_usage.prompt_tokens

                    if actual_prompt_tokens is not None and existing_conversation:
                        previous_user_messages = (
                            conv_db.query(ConversationMessageModel)
                            .filter(
                                ConversationMessageModel.conversation_id == conversation.id,
                                ConversationMessageModel.role == "user",
                            )
                            .all()
                        )
                        previous_assistant_messages = (
                            conv_db.query(ConversationMessageModel)
                            .filter(
                                ConversationMessageModel.conversation_id == conversation.id,
                                ConversationMessageModel.role == "assistant",
                            )
                            .all()
                        )
                        sum_previous_user_tokens = sum(
                            msg.input_tokens
                            for msg in previous_user_messages
                            if msg.input_tokens is not None
                        )
                        sum_previous_assistant_tokens = sum(
                            msg.output_tokens
                            for msg in previous_assistant_messages
                            if msg.output_tokens is not None
                        )
                        sum_previous_tokens = (
                            sum_previous_user_tokens + sum_previous_assistant_tokens
                        )
                        has_previous_messages = (
                            previous_user_messages or previous_assistant_messages
                        )
                        if not has_previous_messages or sum_previous_tokens == 0:
                            if req.models:
                                try:
                                    user_input_tokens = estimate_token_count(
                                        req.input_data, model_id=req.models[0]
                                    )
                                except Exception:
                                    user_input_tokens = estimate_token_count(
                                        req.input_data, model_id=None
                                    )
                            else:
                                user_input_tokens = actual_prompt_tokens - sum_previous_tokens
                                if (
                                    user_input_tokens < 0
                                    or user_input_tokens < len(req.input_data) // 10
                                ):
                                    if req.models:
                                        try:
                                            user_input_tokens = estimate_token_count(
                                                req.input_data, model_id=req.models[0]
                                            )
                                        except Exception:
                                            user_input_tokens = estimate_token_count(
                                                req.input_data, model_id=None
                                            )
                    else:
                        if req.models:
                            try:
                                user_input_tokens = estimate_token_count(
                                    req.input_data, model_id=req.models[0]
                                )
                            except Exception:
                                user_input_tokens = estimate_token_count(
                                    req.input_data, model_id=None
                                )
                        else:
                            user_input_tokens = estimate_token_count(req.input_data, model_id=None)

                    user_msg = ConversationMessageModel(
                        conversation_id=conversation.id,
                        role="user",
                        content=req.input_data,
                        model_id=None,
                        input_tokens=user_input_tokens,
                    )
                    conv_db.add(user_msg)

                    for mid, content in results_dict.items():
                        if not content.startswith("Error:") and content and content.strip():
                            output_tokens = None
                            if mid in usage_data_dict:
                                output_tokens = usage_data_dict[mid].completion_tokens
                            assistant_msg = ConversationMessageModel(
                                conversation_id=conversation.id,
                                role="assistant",
                                content=content,
                                model_id=mid,
                                success=True,
                                processing_time_ms=processing_time_ms,
                                output_tokens=output_tokens,
                            )
                            conv_db.add(assistant_msg)

                    conv_db.commit()

                    user_obj = conv_db.query(User).filter(User.id == ctx.user_id).first()
                    tier = user_obj.subscription_tier if user_obj else "free"
                    display_limit = get_conversation_limit(tier)
                    storage_limit = display_limit

                    all_conversations = (
                        conv_db.query(Conversation)
                        .filter(Conversation.user_id == ctx.user_id)
                        .order_by(Conversation.created_at.desc())
                        .all()
                    )

                    if len(all_conversations) > storage_limit:
                        conversations_to_delete = all_conversations[storage_limit:]
                        for conv_to_delete in conversations_to_delete:
                            conv_db.delete(conv_to_delete)
                        conv_db.commit()

                except Exception as e:
                    logger.error(f"Failed to save conversation to database: {e}", exc_info=True)
                    conv_db.rollback()
                finally:
                    conv_db.close()

            try:
                loop = asyncio.get_running_loop()
                future = loop.run_in_executor(None, save_conversation_to_db)

                def log_executor_error(fut):
                    try:
                        fut.result()
                    except Exception as e:
                        logger.error(f"Exception in save_conversation_to_db executor: {e}")

                future.add_done_callback(log_executor_error)
            except Exception as e:
                logger.error(f"Failed to start save_conversation_to_db executor: {e}")
                try:
                    save_conversation_to_db()
                except Exception as e2:
                    logger.error(f"Fallback synchronous save also failed: {e2}")

        yield f"data: {json.dumps({'type': 'complete', 'metadata': metadata})}\n\n"

    except Exception as e:
        logger.error(f"[MultiModel] Outer exception: {type(e).__name__}: {str(e)}", exc_info=True)
        error_msg = f"Error: {str(e)[:200]}"
        has_partial_results = successful_models > 0 or len(results_dict) > 0

        if has_partial_results:
            processing_time_ms = int((datetime.now() - ctx.start_time).total_seconds() * 1000)
            partial_metadata = {
                "input_length": len(req.input_data),
                "models_requested": len(req.models),
                "models_successful": successful_models,
                "models_failed": failed_models
                + (len(req.models) - successful_models - failed_models),
                "timestamp": datetime.now().isoformat(),
                "processing_time_ms": processing_time_ms,
                "credits_used": float(total_credits_used) if successful_models > 0 else 0.0,
                "credits_remaining": int(credits_remaining[0]),
                "error": error_msg,
            }
            yield f"data: {json.dumps({'type': 'complete', 'metadata': partial_metadata})}\n\n"
        else:
            yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
