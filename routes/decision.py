"""Unified decisioning endpoints for the agentic surface.

- POST /decision/run  — accepts {mode: policy | agent | deterministic, intent, phone, context}
- POST /agent/run     — agent-only shortcut (same body, mode forced to agent)

Both share the same auth, rate-limit, persistence and memory-update path so
they show up in /console/events alongside legacy /analyze events.
"""

import copy
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, Optional

from flask import Blueprint, Response, jsonify, request, stream_with_context

from config import AppConfig
from database.db import get_active_policy, insert_analyze_event
from services.agents import run_agent_pipeline, run_deterministic_pipeline, run_policy_pipeline
from services.agents.llm_agent import run_llm_pipeline_stream
from services.intent_mapper import CANONICAL_INTENTS, normalize_intent
from services.memory_service import get_cross_sector_memory, write_back_memory
from services.rate_limit import check_rate_limit
from services.request_auth import parse_bearer_api_key, resolve_api_key_request

logger = logging.getLogger(__name__)
CONFIG = AppConfig()

decision_bp = Blueprint("decision", __name__)
agent_bp = Blueprint("agent_run", __name__)

VALID_MODES = {"policy", "agent", "deterministic"}


def _validate(payload: Dict[str, Any]) -> tuple[Optional[Dict[str, Any]], Optional[list[str]]]:
    intent = (payload.get("intent") or "").strip()
    phone = (payload.get("phone") or "").strip()
    mode = (payload.get("mode") or "agent").strip().lower()
    errors: list[str] = []
    if not intent:
        errors.append("intent required")
    if not phone:
        errors.append("phone required")
    if mode not in VALID_MODES:
        errors.append(f"mode must be one of {sorted(VALID_MODES)}")
    if errors:
        return None, errors
    return {
        "intent": intent,
        "phone": phone,
        "mode": mode,
        "context": payload.get("context") or {},
    }, None


def _normalize(parsed: Dict[str, Any]) -> Dict[str, Any]:
    mapping = normalize_intent(parsed.get("intent"), parsed.get("context"))
    out = dict(parsed)
    out["raw_intent"] = mapping["raw_intent"]
    out["intent"] = mapping["primary_intent"]
    out["secondary_intents"] = mapping["secondary_intents"]
    out["intent_mapping"] = {
        "reasoning": mapping.get("intent_mapping_reasoning", ""),
        "confidence": mapping.get("intent_mapping_confidence", 0.0),
        "source": mapping.get("intent_mapping_source", "fallback"),
        "canonical_intents": CANONICAL_INTENTS,
    }
    return out


def _sanitize_signals(signals: Dict[str, Any]) -> Dict[str, Any]:
    out = copy.deepcopy(signals)
    for v in out.values():
        if isinstance(v, dict):
            v.pop("_raw", None)
    return out


def _aggregate_signals(agent_outputs: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for ao in agent_outputs.values():
        for k, v in (ao.get("signals") or {}).items():
            out[k] = v
    return out


def _execute(payload: Dict[str, Any], mode: str, account_id: Optional[int], api_key_id: Optional[int]) -> tuple[int, Dict[str, Any]]:
    intent = payload["intent"]
    raw_intent = payload.get("raw_intent") or intent
    secondary_intents = payload.get("secondary_intents") or []
    intent_mapping = payload.get("intent_mapping") or {}
    phone = payload["phone"]
    extra_ctx = payload["context"] if isinstance(payload["context"], dict) else {}
    context = {
        "intent": intent,
        "raw_intent": raw_intent,
        "secondary_intents": secondary_intents,
        "intent_mapping": intent_mapping,
        "phone": phone,
        **extra_ctx,
    }

    memory = get_cross_sector_memory(account_id, phone)

    t0 = time.perf_counter()
    if mode == "policy":
        policy_row = get_active_policy(account_id) if account_id is not None else None
        policy_content = policy_row["content"] if policy_row else None
        rules = (policy_content or {}).get("rules") or []
        if not rules:
            return 400, {
                "errors": [
                    "No policy rules are configured. "
                    "Go to the Policies page in the console to create a policy before using policy mode."
                ]
            }
        result = run_policy_pipeline(
            context,
            memory,
            policy_content=policy_content,
            compliance_mode=str(extra_ctx.get("compliance_mode") or "relaxed").lower(),
        )
        agent_outputs = result.get("agent_outputs") or {}
        decision = result.get("decision")
        confidence = float(result.get("confidence") or 0.0)
        risk_score = float(result.get("risk_score") or 0.0)
        reason = result.get("reason") or ""
        memory_influence = result.get("memory_influence") or {}
        selected_agents = result.get("selected_agents") or []
        trace = result.get("trace") or []
        api_calls = result.get("api_calls") or []
        viz = result.get("visualization_payload") or {}
        policy_applied = result.get("policy_applied") or {}
    else:
        if mode == "deterministic":
            result = run_deterministic_pipeline(context, memory)
            policy_applied = {"rule_id": None, "source": "deterministic_mode"}
        else:
            result = run_agent_pipeline(context, memory)
            policy_applied = {"rule_id": None, "source": "agent_mode"}
        agent_outputs = result.get("agent_outputs") or {}
        d = result.get("decision") or {}
        decision = d.get("decision")
        confidence = float(d.get("confidence") or 0.0)
        risk_score = float(d.get("risk_score") or 0.0)
        reason = d.get("reason") or ""
        memory_influence = d.get("memory_influence") or {}
        selected_agents = result.get("selected_agents") or []
        trace = result.get("trace") or []
        api_calls = result.get("api_calls") or []
        viz = result.get("visualization_payload") or {}
    duration_ms = (time.perf_counter() - t0) * 1000.0

    aggregated_signals = _sanitize_signals(_aggregate_signals(agent_outputs))

    # Persist into analyze_events so Activity / metrics surfaces include it.
    ts = datetime.now(timezone.utc).isoformat()
    new_events = []
    risk_out = agent_outputs.get("RiskAgent") or {}
    for ev in (risk_out.get("memory_events") or []):
        new_events.append(ev)

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
            decision_trace={
                "steps": trace,
                "selected_agents": selected_agents,
                "raw_intent": raw_intent,
                "secondary_intents": secondary_intents,
                "intent_mapping": intent_mapping,
            },
            policy_rule_id=policy_applied.get("rule_id"),
            http_status=200,
            idempotency_key=None,
        )
    except Exception:
        logger.exception("Failed to persist /decision/run event")

    # Update cross-sector memory.
    write_back_memory(
        account_id,
        phone,
        intent=intent,
        observed_risk=risk_score,
        decision=str(decision or "ALLOW"),
        new_events=new_events,
    )

    body = {
        "mode": mode,
        "intent": intent,
        "raw_intent": raw_intent,
        "secondary_intents": secondary_intents,
        "intent_mapping": intent_mapping,
        "decision": decision,
        "confidence": confidence,
        "risk_score": risk_score,
        "reason": reason,
        "memory_influence": memory_influence,
        "selected_agents": selected_agents,
        "api_calls": api_calls,
        "trace": trace,
        "visualization_payload": viz,
        "policy_applied": policy_applied,
        "duration_ms": round(duration_ms, 2),
        "reasoning_summary": _summarize(decision, selected_agents, memory_influence),
    }
    return 200, body


def _summarize(decision: Optional[str], selected_agents: list, memory_influence: Dict[str, Any]) -> str:
    agents = ", ".join(selected_agents) if selected_agents else "no agents"
    weight = memory_influence.get("global_risk_weight", 0)
    sector = memory_influence.get("primary_sector", "general")
    return (
        f"Decision={decision or '—'} via {agents}. "
        f"Memory weight={weight} (sector={sector})."
    )


def _auth_and_rate_limit() -> tuple[Optional[int], Optional[int], Optional[Dict[str, Any]], Optional[int]]:
    """Returns (account_id, api_key_id, error_response, error_status)."""
    account_id, api_key_id, key_err = resolve_api_key_request(request)
    raw_key = parse_bearer_api_key(request)
    if CONFIG.REQUIRE_API_KEY and account_id is None:
        return None, None, {"errors": ["Valid API key required"]}, 401
    if raw_key and key_err == "invalid_api_key":
        return None, None, {"errors": ["Invalid API key"]}, 401
    if api_key_id is not None:
        allowed, retry_after = check_rate_limit(api_key_id, CONFIG.RATE_LIMIT_PER_MINUTE)
        if not allowed:
            return None, None, {"errors": ["rate_limited"], "retry_after": retry_after}, 429
    return account_id, api_key_id, None, None


@decision_bp.post("/decision/run")
def decision_run():
    payload = request.get_json(force=True, silent=True) or {}
    parsed, errs = _validate(payload)
    if errs:
        return jsonify({"errors": errs}), 400
    account_id, api_key_id, err_body, err_status = _auth_and_rate_limit()
    if err_body is not None:
        return jsonify(err_body), err_status
    normalized = _normalize(parsed)
    status, body = _execute(normalized, normalized["mode"], account_id, api_key_id)
    return jsonify(body), status


@agent_bp.post("/agent/run")
def agent_run():
    payload = request.get_json(force=True, silent=True) or {}
    payload["mode"] = "agent"
    parsed, errs = _validate(payload)
    if errs:
        return jsonify({"errors": errs}), 400
    account_id, api_key_id, err_body, err_status = _auth_and_rate_limit()
    if err_body is not None:
        return jsonify(err_body), err_status
    normalized = _normalize(parsed)
    status, body = _execute(normalized, "agent", account_id, api_key_id)
    return jsonify(body), status


# ─── Streaming endpoint ──────────────────────────────────────────────────────


def _sse(event: Dict[str, Any]) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


def _persist_and_write_back(
    parsed: Dict[str, Any],
    mode: str,
    account_id: Optional[int],
    api_key_id: Optional[int],
    full: Dict[str, Any],
    duration_ms: float,
) -> None:
    """Persist a streamed decision into analyze_events + update memory.

    Mirrors the persistence half of ``_execute`` so streaming responses still
    show up on the Activity page and influence cross-sector memory.
    """
    intent = parsed["intent"]
    raw_intent = parsed.get("raw_intent") or intent
    secondary_intents = parsed.get("secondary_intents") or []
    intent_mapping = parsed.get("intent_mapping") or {}
    phone = parsed["phone"]
    extra_ctx = parsed["context"] if isinstance(parsed["context"], dict) else {}

    decision = full.get("decision")
    confidence = float(full.get("confidence") or 0.0)
    risk_score = float(full.get("risk_score") or 0.0)
    reason = full.get("reason") or ""
    selected_agents = full.get("selected_agents") or []
    trace = full.get("trace") or []
    api_calls = full.get("api_calls") or []
    agent_outputs = full.get("agent_outputs") or {}
    policy_applied = full.get("policy_applied") or {"rule_id": None, "source": "agent_mode"}
    aggregated_signals = _sanitize_signals(_aggregate_signals(agent_outputs))

    new_events = []
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
            decision_trace={
                "steps": trace,
                "selected_agents": selected_agents,
                "raw_intent": raw_intent,
                "secondary_intents": secondary_intents,
                "intent_mapping": intent_mapping,
            },
            policy_rule_id=policy_applied.get("rule_id"),
            http_status=200,
            idempotency_key=None,
        )
    except Exception:  # pylint: disable=broad-except
        logger.exception("Failed to persist /decision/stream event")

    write_back_memory(
        account_id,
        phone,
        intent=intent,
        observed_risk=risk_score,
        decision=str(decision or "ALLOW"),
        new_events=new_events,
    )


def _stream_agent(
    parsed: Dict[str, Any],
    account_id: Optional[int],
    api_key_id: Optional[int],
) -> Iterator[str]:
    intent = parsed["intent"]
    raw_intent = parsed.get("raw_intent") or intent
    secondary_intents = parsed.get("secondary_intents") or []
    intent_mapping = parsed.get("intent_mapping") or {}
    phone = parsed["phone"]
    extra_ctx = parsed["context"] if isinstance(parsed["context"], dict) else {}
    context = {
        "intent": intent,
        "raw_intent": raw_intent,
        "secondary_intents": secondary_intents,
        "intent_mapping": intent_mapping,
        "phone": phone,
        "context": extra_ctx,
        **extra_ctx,
    }
    memory = get_cross_sector_memory(account_id, phone)

    t0 = time.perf_counter()
    full: Optional[Dict[str, Any]] = None

    try:
        for event in run_llm_pipeline_stream(context, memory):
            if event.get("type") == "done":
                full = event.get("full_response") or {}
                duration_ms = (time.perf_counter() - t0) * 1000.0
                full.setdefault("mode", "agent")
                full.setdefault("intent", intent)
                full.setdefault("raw_intent", raw_intent)
                full.setdefault("secondary_intents", secondary_intents)
                full.setdefault("intent_mapping", intent_mapping)
                full["duration_ms"] = round(duration_ms, 2)
                full.setdefault("policy_applied", {"rule_id": None, "source": "agent_mode"})
                yield _sse({"type": "done", "full_response": full})
            else:
                yield _sse(event)
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Streaming agent run failed")
        yield _sse({"type": "error", "message": str(exc)})
        return

    if full is not None:
        try:
            _persist_and_write_back(parsed, "agent", account_id, api_key_id, full, duration_ms)
        except Exception:  # pylint: disable=broad-except
            logger.exception("Persist after stream failed")


def _stream_policy(
    parsed: Dict[str, Any],
    account_id: Optional[int],
    api_key_id: Optional[int],
) -> Iterator[str]:
    intent = parsed["intent"]
    raw_intent = parsed.get("raw_intent") or intent
    secondary_intents = parsed.get("secondary_intents") or []
    intent_mapping = parsed.get("intent_mapping") or {}
    phone = parsed["phone"]
    extra_ctx = parsed["context"] if isinstance(parsed["context"], dict) else {}
    context = {
        "intent": intent,
        "raw_intent": raw_intent,
        "secondary_intents": secondary_intents,
        "intent_mapping": intent_mapping,
        "phone": phone,
        **extra_ctx,
    }
    memory = get_cross_sector_memory(account_id, phone)

    yield _sse({"type": "start", "intent": intent, "phone": phone})

    policy_row = get_active_policy(account_id) if account_id is not None else None
    policy_content = policy_row["content"] if policy_row else None
    rules = (policy_content or {}).get("rules") or []
    if not rules:
        yield _sse({
            "type": "error",
            "message": "No policy rules configured. Create one on the Policies page.",
        })
        return

    t0 = time.perf_counter()
    try:
        result = run_policy_pipeline(
            context,
            memory,
            policy_content=policy_content,
            compliance_mode=str(extra_ctx.get("compliance_mode") or "relaxed").lower(),
        )
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Policy pipeline failed")
        yield _sse({"type": "error", "message": str(exc)})
        return

    duration_ms = (time.perf_counter() - t0) * 1000.0

    # Replay the trace one step at a time so the UI animates the same way.
    for step in result.get("trace") or []:
        yield _sse({"type": "trace_step", "step": step})

    yield _sse({
        "type": "decision",
        "decision": result.get("decision"),
        "risk_score": float(result.get("risk_score") or 0.0),
        "confidence": float(result.get("confidence") or 0.0),
        "reason": result.get("reason") or "",
        "reasoning_summary": "",
    })
    yield _sse({"type": "memory", "memory_influence": result.get("memory_influence") or {}})

    full = {
        "mode": "policy",
        "intent": intent,
        "raw_intent": raw_intent,
        "secondary_intents": secondary_intents,
        "intent_mapping": intent_mapping,
        "decision": result.get("decision"),
        "confidence": float(result.get("confidence") or 0.0),
        "risk_score": float(result.get("risk_score") or 0.0),
        "reason": result.get("reason") or "",
        "memory_influence": result.get("memory_influence") or {},
        "selected_agents": result.get("selected_agents") or [],
        "agent_outputs": result.get("agent_outputs") or {},
        "api_calls": result.get("api_calls") or [],
        "trace": result.get("trace") or [],
        "visualization_payload": result.get("visualization_payload") or {},
        "policy_applied": result.get("policy_applied") or {"rule_id": None, "source": "tenant_policy"},
        "duration_ms": round(duration_ms, 2),
        "reasoning_summary": "",
    }
    yield _sse({"type": "done", "full_response": full})

    try:
        _persist_and_write_back(parsed, "policy", account_id, api_key_id, full, duration_ms)
    except Exception:  # pylint: disable=broad-except
        logger.exception("Persist after policy stream failed")


@decision_bp.post("/decision/stream")
def decision_stream():
    payload = request.get_json(force=True, silent=True) or {}
    parsed, errs = _validate(payload)
    if errs:
        return jsonify({"errors": errs}), 400
    account_id, api_key_id, err_body, err_status = _auth_and_rate_limit()
    if err_body is not None:
        return jsonify(err_body), err_status

    normalized = _normalize(parsed)
    if normalized["mode"] == "agent":
        gen = _stream_agent(normalized, account_id, api_key_id)
    elif normalized["mode"] == "policy":
        gen = _stream_policy(normalized, account_id, api_key_id)
    else:
        return jsonify(
            {"errors": ["Streaming supports mode=agent or mode=policy only. Use POST /decision/run for deterministic mode."]}
        ), 400

    return Response(
        stream_with_context(gen),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
