"""Consumer-facing ChatGPT-style endpoint.

POST /consumer/chat/stream
    Body: { phone: str, prompt: str, history?: [{role, content}, ...] }
    Auth: optional. With a valid Bearer key the call runs in tenant scope —
    full memory + audit row written. Without one, runs anonymously,
    IP-rate-limited, with no memory writes and a sanitised payload.

Three LLM passes per turn:
  1. extract_intent_and_context — turn prose into {intent, phone, context}
  2. run_llm_pipeline_stream    — existing dynamic CAMARA orchestration
  3. frame_consumer_answer_stream — friendly natural-language answer

Each pass is forwarded as SSE events so the chat UI can render live status
pills, the streamed answer, and (for authenticated callers) the structured
trace + decision shape we already use in the simulator.
"""

from __future__ import annotations

import copy
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional, Tuple

from flask import Blueprint, Response, jsonify, request, stream_with_context

from config import AppConfig
from database.db import insert_analyze_event
from services.agents.llm_agent import run_llm_pipeline_stream
from services.consumer_chat import (
    extract_intent_and_context,
    frame_consumer_answer_stream,
)
from services.intent_mapper import normalize_intent
from services.memory_service import get_cross_sector_memory, write_back_memory
from services.rate_limit import check_ip_rate_limit, check_rate_limit
from services.request_auth import parse_bearer_api_key, resolve_api_key_request

logger = logging.getLogger(__name__)
CONFIG = AppConfig()

consumer_bp = Blueprint("consumer", __name__)

MAX_PROMPT_CHARS = 500
MAX_HISTORY_TURNS = 6


def _client_ip() -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip() or "unknown"
    return request.remote_addr or "unknown"


def _sse(event: Dict[str, Any]) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


def _sanitize_signals(signals: Dict[str, Any]) -> Dict[str, Any]:
    out = copy.deepcopy(signals)
    for v in out.values():
        if isinstance(v, dict):
            v.pop("_raw", None)
    return out


def _aggregate_signals(agent_outputs: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for ao in (agent_outputs or {}).values():
        for k, v in (ao.get("signals") or {}).items():
            out[k] = v
    return out


# ─── Auth resolution ────────────────────────────────────────────────────────


def _auth(allow_anonymous: bool) -> Tuple[Optional[int], Optional[int], Optional[Tuple[Dict[str, Any], int]]]:
    """Return (account_id, api_key_id, error_response).

    When ``allow_anonymous`` is True, missing keys are OK and we return
    (None, None, None). An *invalid* key is still an error.
    """
    raw_key = parse_bearer_api_key(request)
    account_id, api_key_id, key_err = resolve_api_key_request(request)

    if raw_key and key_err == "invalid_api_key":
        return None, None, ({"errors": ["Invalid API key"]}, 401)

    if not allow_anonymous and account_id is None:
        return None, None, ({"errors": ["Valid API key required"]}, 401)

    if api_key_id is not None:
        ok, retry_after = check_rate_limit(api_key_id, CONFIG.RATE_LIMIT_PER_MINUTE)
        if not ok:
            return None, None, ({"errors": ["rate_limited"], "retry_after": retry_after}, 429)
    else:
        ok, retry_after = check_ip_rate_limit(_client_ip(), CONFIG.PUBLIC_RATE_LIMIT_PER_HOUR)
        if not ok:
            return None, None, ({"errors": ["rate_limited"], "retry_after": retry_after}, 429)

    return account_id, api_key_id, None


# ─── Validation ─────────────────────────────────────────────────────────────


def _validate(payload: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[List[str]]]:
    errors: List[str] = []
    prompt = (payload.get("prompt") or "").strip()
    phone = (payload.get("phone") or "").strip()
    history = payload.get("history") or []

    if not prompt:
        errors.append("prompt required")
    if len(prompt) > MAX_PROMPT_CHARS:
        errors.append(f"prompt must be <= {MAX_PROMPT_CHARS} characters")
    if not isinstance(history, list):
        errors.append("history must be an array")
        history = []

    cleaned_history: List[Dict[str, str]] = []
    for item in history[-MAX_HISTORY_TURNS:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "user")
        content = str(item.get("content") or "")
        if role in {"user", "assistant"} and content:
            cleaned_history.append({"role": role, "content": content[:1000]})

    if errors:
        return None, errors
    return {"prompt": prompt, "phone": phone, "history": cleaned_history}, None


# ─── Persistence (authenticated mode only) ──────────────────────────────────


def _persist(
    intent: str,
    phone: str,
    extra_ctx: Dict[str, Any],
    full: Dict[str, Any],
    duration_ms: float,
    account_id: int,
    api_key_id: Optional[int],
) -> None:
    decision = full.get("decision")
    confidence = float(full.get("confidence") or 0.0)
    risk_score = float(full.get("risk_score") or 0.0)
    reason = full.get("reason") or ""
    selected_agents = full.get("selected_agents") or []
    trace = full.get("trace") or []
    api_calls = full.get("api_calls") or []
    agent_outputs = full.get("agent_outputs") or {}
    aggregated_signals = _sanitize_signals(_aggregate_signals(agent_outputs))

    new_events: List[Dict[str, Any]] = []
    risk_out = agent_outputs.get("RiskAgent") or {}
    for ev in (risk_out.get("memory_events") or []):
        new_events.append(ev)

    ts = datetime.now(timezone.utc).isoformat()
    try:
        insert_analyze_event(
            created_at=ts,
            phone=phone,
            intent=intent,
            decision=str(decision or "ALLOW"),
            confidence=confidence,
            risk_score=risk_score,
            reason=str(reason),
            signals=aggregated_signals,
            apis_called=list(api_calls),
            api_errors=[],
            duration_ms=duration_ms,
            policy_version=CONFIG.POLICY_VERSION,
            account_id=account_id,
            api_key_id=api_key_id,
            compliance_mode=str(extra_ctx.get("compliance_mode") or "relaxed").lower(),
            decision_trace={"steps": trace, "selected_agents": selected_agents, "source": "consumer_chat"},
            policy_rule_id=None,
            http_status=200,
            idempotency_key=None,
        )
    except Exception:  # pylint: disable=broad-except
        logger.exception("Failed to persist consumer chat event")

    write_back_memory(
        account_id,
        phone,
        intent=intent,
        observed_risk=risk_score,
        decision=str(decision or "ALLOW"),
        new_events=new_events,
    )


# ─── SSE generator ──────────────────────────────────────────────────────────


def _stream(
    payload: Dict[str, Any],
    account_id: Optional[int],
    api_key_id: Optional[int],
) -> Iterator[str]:
    is_authed = account_id is not None
    prompt = payload["prompt"]
    default_phone = payload["phone"]
    history = payload["history"]

    yield _sse({"type": "understanding"})

    extracted = extract_intent_and_context(prompt, history=history, default_phone=default_phone)
    intent = extracted.get("intent", "fraud_prevention")
    phone = (extracted.get("phone") or "").strip()
    context = extracted.get("context") if isinstance(extracted.get("context"), dict) else {}
    clarification = extracted.get("clarification_needed", "") or ""

    yield _sse({
        "type": "extracted",
        "intent": intent,
        "phone": phone,
        "context": context,
        "clarification_needed": clarification,
    })

    if not phone:
        msg = (
            clarification
            or "I'd love to help — could you include the phone number in your message? "
            "Something like '+233241234567' so I know which number to check."
        )
        yield _sse({"type": "answer_start"})
        for token in msg.split(" "):
            yield _sse({"type": "answer_chunk", "text": token + " "})
        yield _sse({
            "type": "done",
            "decision_summary": {"decision": None, "reason": "missing_phone"},
        })
        return

    mapping = normalize_intent(intent, context)
    intent = mapping["primary_intent"]
    raw_intent = mapping["raw_intent"]
    secondary_intents = mapping["secondary_intents"]
    intent_mapping = {
        "reasoning": mapping.get("intent_mapping_reasoning", ""),
        "confidence": mapping.get("intent_mapping_confidence", 0.0),
        "source": mapping.get("intent_mapping_source", "fallback"),
    }

    pipeline_context = {
        "intent": intent,
        "raw_intent": raw_intent,
        "secondary_intents": secondary_intents,
        "intent_mapping": intent_mapping,
        "phone": phone,
        "context": context,
        **context,
    }
    memory = get_cross_sector_memory(account_id, phone)

    t0 = time.perf_counter()
    full: Optional[Dict[str, Any]] = None
    final_decision: Optional[Dict[str, Any]] = None

    try:
        for event in run_llm_pipeline_stream(pipeline_context, memory):
            etype = event.get("type")
            if etype == "tool_call":
                yield _sse({
                    "type": "tool_call",
                    "step": event.get("step"),
                    "tool": event.get("tool"),
                })
            elif etype == "tool_result":
                # Only forward result bodies in authenticated mode — public
                # callers see just the tool name + degraded flag.
                payload_out: Dict[str, Any] = {
                    "type": "tool_result",
                    "step": event.get("step"),
                    "tool": event.get("tool"),
                    "degraded": bool(event.get("degraded")),
                }
                if is_authed:
                    payload_out["result"] = event.get("result")
                yield _sse(payload_out)
            elif etype == "decision":
                final_decision = {
                    "decision": event.get("decision"),
                    "risk_score": event.get("risk_score"),
                    "confidence": event.get("confidence"),
                    "reason": event.get("reason"),
                    "reasoning_summary": event.get("reasoning_summary"),
                }
                # Per the privacy guardrails: decision/confidence/reason are
                # OK to expose in public mode — only memory blobs, raw API
                # call lists, and per-sector adjustments are hidden.
                yield _sse({"type": "decision", **final_decision})
            elif etype == "memory":
                if is_authed:
                    yield _sse({"type": "memory", "memory_influence": event.get("memory_influence")})
            elif etype == "fallback":
                yield _sse({"type": "fallback", "reason": event.get("reason")})
            elif etype == "trace_step":
                if is_authed:
                    yield _sse({"type": "trace_step", "step": event.get("step")})
            elif etype == "done":
                full = event.get("full_response") or {}
            elif etype == "error":
                yield _sse({"type": "error", "message": str(event.get("message") or "stream error")})
                return
            # other event types ignored
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Consumer chat pipeline failed")
        yield _sse({"type": "error", "message": str(exc)})
        return

    duration_ms = (time.perf_counter() - t0) * 1000.0

    if full is None:
        yield _sse({"type": "error", "message": "Pipeline did not produce a final decision"})
        return

    decision_for_framer = final_decision or {
        "decision": full.get("decision"),
        "risk_score": full.get("risk_score"),
        "confidence": full.get("confidence"),
        "reason": full.get("reason"),
        "reasoning_summary": full.get("reasoning_summary"),
    }

    yield _sse({"type": "answer_start"})
    try:
        for chunk in frame_consumer_answer_stream(decision_for_framer, prompt):
            if chunk:
                yield _sse({"type": "answer_chunk", "text": chunk})
    except Exception:  # pylint: disable=broad-except
        logger.exception("Consumer chat framer failed")
        yield _sse({"type": "answer_chunk", "text": " (and I had to fall back to a brief answer)"})

    # Public summary per the plan: { decision, confidence, reason, signals_checked }.
    # Authenticated callers also receive raw API call list, selected agents, and
    # memory influence — none of which leak in public mode.
    summary: Dict[str, Any] = {
        "decision": decision_for_framer.get("decision"),
        "confidence": decision_for_framer.get("confidence"),
        "reason": decision_for_framer.get("reason"),
        "signals_checked": len(full.get("api_calls") or []),
        "intent": intent,
        "raw_intent": raw_intent,
        "secondary_intents": secondary_intents,
        "intent_mapping": intent_mapping,
    }
    if is_authed:
        summary["phone"] = phone
        summary["risk_score"] = decision_for_framer.get("risk_score")
        summary["reasoning_summary"] = decision_for_framer.get("reasoning_summary")
        summary["api_calls"] = full.get("api_calls") or []
        summary["selected_agents"] = full.get("selected_agents") or []
        summary["memory_influence"] = full.get("memory_influence") or {}

    yield _sse({"type": "done", "decision_summary": summary, "duration_ms": round(duration_ms, 2)})

    if is_authed and account_id is not None:
        try:
            _persist(intent, phone, context, full, duration_ms, account_id, api_key_id)
        except Exception:  # pylint: disable=broad-except
            logger.exception("Persist after consumer chat stream failed")


# ─── Endpoint ───────────────────────────────────────────────────────────────


@consumer_bp.post("/consumer/chat/stream")
def consumer_chat_stream():
    payload_raw = request.get_json(force=True, silent=True) or {}
    parsed, errs = _validate(payload_raw)
    if errs:
        return jsonify({"errors": errs}), 400

    account_id, api_key_id, err = _auth(allow_anonymous=True)
    if err is not None:
        body, status = err
        return jsonify(body), status

    return Response(
        stream_with_context(_stream(parsed, account_id, api_key_id)),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
