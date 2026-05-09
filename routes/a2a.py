"""A2A (Agent-to-Agent) endpoint for NetIQ.

Implements the surface defined by Google's A2A protocol so any A2A-aware agent
can discover NetIQ via its Agent Card and invoke its skills:

* ``GET  /.well-known/agent.json``    — public Agent Card (no auth)
* ``POST /a2a/tasks/send``            — synchronous task execution
* ``POST /a2a/tasks/sendSubscribe``   — SSE streaming task execution
* ``POST /a2a/tasks/get``             — fetch a previously executed task

The skills map onto the same pipelines used by ``/decision/run`` so an A2A
caller and a REST caller see identical decisions and audit trails.

A2A message shape (subset)::

    {
      "id": "task-uuid",                      # client-generated task id
      "sessionId": "session-uuid",            # optional
      "message": {
        "role": "user",
        "parts": [
          { "type": "data", "data": {
              "skill": "decide",
              "intent": "fraud_prevention",
              "phone": "+233...",
              "mode": "agent",
              "context": {"amount": 500}
          } }
        ]
      }
    }

Why A2A in addition to MCP?
    MCP tools are typically called by a single LLM agent. A2A is for agent-to-
    agent collaboration: a fintech's fraud agent can ask NetIQ's agent for a
    decision as one peer to another, with structured artifacts and streaming
    status updates. This is the protocol Telefónica and Nokia are jointly
    piloting; supporting it positions NetIQ as drop-in for that vision.
"""

from __future__ import annotations

import copy
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional, Tuple

from flask import Blueprint, Response, jsonify, request, stream_with_context

from config import AppConfig
from database.db import get_active_policy, get_connection, insert_analyze_event
from services.agents import run_agent_pipeline, run_policy_pipeline
from services.agents.llm_agent import run_llm_pipeline_stream
from services.intent_mapper import CANONICAL_INTENTS, normalize_intent
from services.memory_service import get_cross_sector_memory, write_back_memory
from services.rate_limit import check_rate_limit
from services.request_auth import parse_bearer_api_key, resolve_api_key_request

logger = logging.getLogger(__name__)
CONFIG = AppConfig()

a2a_bp = Blueprint("a2a", __name__)

AGENT_NAME = "NetIQ"
AGENT_VERSION = "0.1.0"
AGENT_DESCRIPTION = (
    "Network-aware risk decisioning over Nokia Network as Code. Given a phone "
    "number and an intent, NetIQ orchestrates the right CAMARA APIs (SIM swap, "
    "device swap, KYC match, location, QoS, reachability, ...), fuses them with "
    "cross-sector phone-number memory, and returns a structured business decision "
    "(ALLOW | VERIFY | BLOCK | PRIORITIZE | DEGRADE) with confidence, trace, and "
    "memory influence."
)

VALID_MODES = {"policy", "agent"}


# ─── Agent Card ──────────────────────────────────────────────────────────────

@a2a_bp.get("/.well-known/agent.json")
def agent_card():
    base = (request.host_url or "").rstrip("/")
    return jsonify({
        "name": AGENT_NAME,
        "description": AGENT_DESCRIPTION,
        "version": AGENT_VERSION,
        "url": f"{base}/a2a",
        "documentationUrl": f"{base}/console/docs",
        "provider": {
            "organization": "NetIQ",
            "url": base or None,
        },
        "capabilities": {
            "streaming": True,
            "pushNotifications": False,
            "stateTransitionHistory": True,
        },
        "authentication": {
            "schemes": ["Bearer"],
            "credentials": "Issue an API key at /console/keys.",
        },
        "defaultInputModes": ["text", "data"],
        "defaultOutputModes": ["text", "data"],
        "skills": [
            {
                "id": "decide",
                "name": "Make risk decision",
                "description": (
                    "Run NetIQ's full network-aware decision pipeline. The caller "
                    "can provide any intent phrase and a "
                    "phone number; NetIQ chooses CAMARA APIs internally and returns "
                    "a structured decision with confidence, trace, and memory."
                ),
                "tags": ["risk", "fraud", "decision", "kyc", "telecom"],
                "inputModes": ["data"],
                "outputModes": ["data", "text"],
                "examples": [
                    'Block this transaction if the SIM was swapped recently. Phone +233241234567, amount 500.',
                    'Should I onboard +254712345678?',
                ],
            },
            {
                "id": "evaluate_policy",
                "name": "Evaluate against tenant policy",
                "description": (
                    "Run the request through the tenant's saved deterministic policy "
                    "engine only. Errors clearly if no rules are configured."
                ),
                "tags": ["policy", "rules", "compliance"],
                "inputModes": ["data"],
                "outputModes": ["data", "text"],
            },
            {
                "id": "lookup_phone_history",
                "name": "Lookup phone trust history",
                "description": (
                    "Read NetIQ's cross-sector memory for a phone number: global "
                    "risk, sector scores, recent events, and trust trajectory."
                ),
                "tags": ["memory", "history", "trust"],
                "inputModes": ["data"],
                "outputModes": ["data"],
            },
        ],
    })


# ─── Auth + rate limit (shared) ──────────────────────────────────────────────


def _auth_and_rate_limit() -> Tuple[Optional[int], Optional[int], Optional[Tuple[Dict[str, Any], int]]]:
    account_id, api_key_id, key_err = resolve_api_key_request(request)
    raw_key = parse_bearer_api_key(request)
    if CONFIG.REQUIRE_API_KEY and account_id is None:
        return None, None, ({"error": {"code": -32001, "message": "Valid API key required"}}, 401)
    if raw_key and key_err == "invalid_api_key":
        return None, None, ({"error": {"code": -32001, "message": "Invalid API key"}}, 401)
    if api_key_id is not None:
        allowed, retry_after = check_rate_limit(api_key_id, CONFIG.RATE_LIMIT_PER_MINUTE)
        if not allowed:
            return None, None, (
                {"error": {"code": -32002, "message": "rate_limited", "data": {"retry_after": retry_after}}},
                429,
            )
    return account_id, api_key_id, None


# ─── A2A request parsing ─────────────────────────────────────────────────────


def _extract_skill_payload(message: Dict[str, Any]) -> Tuple[Optional[str], Dict[str, Any]]:
    """Pull the skill name + arguments out of an A2A message.

    Accepts ``data`` parts directly, and also accepts a ``text`` part that is
    pure JSON for easy curl-based testing.
    """
    parts = (message or {}).get("parts") or []
    skill: Optional[str] = None
    payload: Dict[str, Any] = {}
    for part in parts:
        if not isinstance(part, dict):
            continue
        ptype = part.get("type")
        if ptype == "data" and isinstance(part.get("data"), dict):
            payload.update(part["data"])
        elif ptype == "text" and isinstance(part.get("text"), str):
            txt = part["text"].strip()
            if txt.startswith("{") and txt.endswith("}"):
                try:
                    payload.update(json.loads(txt))
                except json.JSONDecodeError:
                    pass
    skill = payload.pop("skill", None) or payload.pop("skill_id", None)
    if not skill:
        skill = "decide"  # default
    return skill, payload


def _parse_task_request(body: Dict[str, Any]) -> Tuple[Dict[str, Any], Optional[List[str]]]:
    """Validate the inbound A2A task body and produce a normalised dict."""
    errors: List[str] = []
    task_id = (body.get("id") or body.get("taskId") or "").strip()
    if not task_id:
        task_id = f"task-{uuid.uuid4().hex[:12]}"

    session_id = body.get("sessionId") or body.get("session_id") or None
    message = body.get("message") or {}
    skill, args = _extract_skill_payload(message)

    intent = (args.get("intent") or "").strip()
    phone = (args.get("phone") or "").strip()
    mode = (args.get("mode") or "agent").strip().lower()
    extra_ctx = args.get("context") or {}
    if not isinstance(extra_ctx, dict):
        extra_ctx = {}

    if skill not in {"decide", "evaluate_policy", "lookup_phone_history"}:
        errors.append(f"unknown skill: {skill}")
    if skill == "evaluate_policy":
        mode = "policy"
    if skill in {"decide", "evaluate_policy"}:
        if not intent:
            errors.append("intent required")
        if mode not in VALID_MODES:
            errors.append(f"mode must be one of {sorted(VALID_MODES)}")
    if not phone:
        errors.append("phone required")

    if errors:
        return {}, errors

    return {
        "task_id": task_id,
        "session_id": session_id,
        "skill": skill,
        "intent": intent,
        "phone": phone,
        "mode": mode,
        "context": extra_ctx,
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


# ─── Synchronous task execution ──────────────────────────────────────────────


def _execute_decision(
    parsed: Dict[str, Any],
    account_id: Optional[int],
    api_key_id: Optional[int],
) -> Dict[str, Any]:
    intent = parsed["intent"]
    raw_intent = parsed.get("raw_intent") or intent
    secondary_intents = parsed.get("secondary_intents") or []
    intent_mapping = parsed.get("intent_mapping") or {}
    phone = parsed["phone"]
    mode = parsed["mode"]
    extra_ctx = parsed["context"]
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
            raise _A2AError(
                "No policy rules configured. Create one at /console/policies before using policy mode."
            )
        result = run_policy_pipeline(
            context,
            memory,
            policy_content=policy_content,
            compliance_mode=str(extra_ctx.get("compliance_mode") or "relaxed").lower(),
        )
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
        agent_outputs = result.get("agent_outputs") or {}
    else:
        result = run_agent_pipeline(context, memory)
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
        policy_applied = {"rule_id": None, "source": "agent_mode"}
    duration_ms = (time.perf_counter() - t0) * 1000.0

    aggregated_signals = _sanitize_signals(_aggregate_signals(agent_outputs))
    new_events: List[Dict[str, Any]] = []
    risk_out = agent_outputs.get("RiskAgent") or {}
    for ev in (risk_out.get("memory_events") or []):
        new_events.append(ev)

    ts = datetime.now(timezone.utc).isoformat()
    event_id: Optional[int] = None
    try:
        event_id = insert_analyze_event(
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
                "source": "a2a",
                "raw_intent": raw_intent,
                "secondary_intents": secondary_intents,
                "intent_mapping": intent_mapping,
            },
            policy_rule_id=policy_applied.get("rule_id"),
            http_status=200,
            idempotency_key=parsed["task_id"],
        )
    except Exception:  # pylint: disable=broad-except
        logger.exception("Failed to persist /a2a/tasks/send event")

    write_back_memory(
        account_id,
        phone,
        intent=intent,
        observed_risk=risk_score,
        decision=str(decision or "ALLOW"),
        new_events=new_events,
    )

    return {
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
        "event_id": event_id,
        "intent": intent,
        "raw_intent": raw_intent,
        "secondary_intents": secondary_intents,
        "intent_mapping": intent_mapping,
        "mode": mode,
    }


def _execute_lookup(
    parsed: Dict[str, Any],
    account_id: Optional[int],
) -> Dict[str, Any]:
    phone = parsed["phone"]
    memory = get_cross_sector_memory(account_id, phone)
    return {
        "phone": phone,
        "global_risk_score": memory.get("global_risk_score", 0.0),
        "sector_scores": memory.get("sector_scores", {}),
        "events": (memory.get("events") or [])[-15:],
        "trust_trajectory": (memory.get("trust_trajectory") or [])[-15:],
        "decision_count": memory.get("decision_count", 0),
    }


@a2a_bp.post("/a2a/tasks/send")
def tasks_send():
    account_id, api_key_id, err = _auth_and_rate_limit()
    if err is not None:
        body, status = err
        return jsonify(body), status

    body = request.get_json(force=True, silent=True) or {}
    parsed, errs = _parse_task_request(body)
    if errs:
        return jsonify(_failed_task(body.get("id"), "; ".join(errs))), 400

    try:
        if parsed["skill"] == "lookup_phone_history":
            result = _execute_lookup(parsed, account_id)
            text_summary = (
                f"Phone {parsed['phone']} — global risk score "
                f"{result.get('global_risk_score', 0):.1f}/100, "
                f"{result.get('decision_count', 0)} prior decisions."
            )
        else:
            parsed = _normalize(parsed)
            result = _execute_decision(parsed, account_id, api_key_id)
            text_summary = (
                f"Decision: {result.get('decision')} (confidence "
                f"{result.get('confidence', 0):.2f}, risk "
                f"{result.get('risk_score', 0):.1f}). {result.get('reason', '')}"
            )
    except _A2AError as exc:
        return jsonify(_failed_task(parsed.get("task_id"), str(exc))), 400

    return jsonify(_completed_task(parsed["task_id"], parsed.get("session_id"), result, text_summary, parsed["skill"]))


# ─── Streaming task execution ────────────────────────────────────────────────


def _sse(event: Dict[str, Any]) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


def _status_update(task_id: str, state: str, *, final: bool = False, message: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "type": "TaskStatusUpdateEvent",
        "id": task_id,
        "status": {
            "state": state,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": message,
        },
        "final": final,
    }


def _artifact_update(task_id: str, name: str, parts: List[Dict[str, Any]], *, last_chunk: bool = False) -> Dict[str, Any]:
    return {
        "type": "TaskArtifactUpdateEvent",
        "id": task_id,
        "artifact": {
            "name": name,
            "parts": parts,
            "lastChunk": last_chunk,
        },
    }


def _stream_decide(
    parsed: Dict[str, Any],
    account_id: Optional[int],
    api_key_id: Optional[int],
) -> Iterator[str]:
    task_id = parsed["task_id"]
    intent = parsed["intent"]
    raw_intent = parsed.get("raw_intent") or intent
    secondary_intents = parsed.get("secondary_intents") or []
    intent_mapping = parsed.get("intent_mapping") or {}
    phone = parsed["phone"]
    mode = parsed["mode"]
    extra_ctx = parsed["context"]

    yield _sse(_status_update(task_id, "submitted"))

    if mode == "policy":
        # Reuse the synchronous policy path for simplicity, then surface the
        # trace step-by-step so streaming consumers see the same shape.
        try:
            yield _sse(_status_update(task_id, "working"))
            result = _execute_decision(parsed, account_id, api_key_id)
        except _A2AError as exc:
            yield _sse(_status_update(
                task_id,
                "failed",
                final=True,
                message={
                    "role": "agent",
                    "parts": [{"type": "text", "text": str(exc)}],
                },
            ))
            return

        for step in result.get("trace") or []:
            yield _sse(_artifact_update(
                task_id,
                "trace_step",
                [{"type": "data", "data": step}],
            ))

        yield _sse(_artifact_update(
            task_id,
            "decision",
            [{"type": "data", "data": result}],
            last_chunk=True,
        ))
        text = (
            f"Decision: {result.get('decision')} (confidence "
            f"{result.get('confidence', 0):.2f})."
        )
        yield _sse(_status_update(
            task_id,
            "completed",
            final=True,
            message={
                "role": "agent",
                "parts": [{"type": "text", "text": text}],
            },
        ))
        return

    # Agent mode — stream live from the LLM pipeline.
    yield _sse(_status_update(task_id, "working"))

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
            etype = event.get("type")
            if etype == "tool_call":
                yield _sse(_artifact_update(
                    task_id,
                    "tool_call",
                    [{"type": "data", "data": {"tool": event.get("tool"), "args": event.get("args"), "step": event.get("step")}}],
                ))
            elif etype == "tool_result":
                yield _sse(_artifact_update(
                    task_id,
                    "tool_result",
                    [{"type": "data", "data": {"tool": event.get("tool"), "result": event.get("result"), "step": event.get("step")}}],
                ))
            elif etype == "decision":
                yield _sse(_artifact_update(
                    task_id,
                    "decision",
                    [{"type": "data", "data": {
                        "decision": event.get("decision"),
                        "risk_score": event.get("risk_score"),
                        "confidence": event.get("confidence"),
                        "reason": event.get("reason"),
                        "reasoning_summary": event.get("reasoning_summary"),
                    }}],
                ))
            elif etype == "memory":
                yield _sse(_artifact_update(
                    task_id,
                    "memory",
                    [{"type": "data", "data": event.get("memory_influence") or {}}],
                ))
            elif etype == "done":
                full = event.get("full_response") or {}
            elif etype == "error":
                yield _sse(_status_update(
                    task_id,
                    "failed",
                    final=True,
                    message={
                        "role": "agent",
                        "parts": [{"type": "text", "text": str(event.get("message") or "stream error")}],
                    },
                ))
                return
            # ignore other event types
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("/a2a streaming failed")
        yield _sse(_status_update(
            task_id,
            "failed",
            final=True,
            message={
                "role": "agent",
                "parts": [{"type": "text", "text": str(exc)}],
            },
        ))
        return

    duration_ms = (time.perf_counter() - t0) * 1000.0

    if full is None:
        yield _sse(_status_update(
            task_id,
            "failed",
            final=True,
            message={
                "role": "agent",
                "parts": [{"type": "text", "text": "Agent stream did not produce a final decision"}],
            },
        ))
        return

    full.setdefault("mode", "agent")
    full.setdefault("intent", intent)
    full.setdefault("raw_intent", raw_intent)
    full.setdefault("secondary_intents", secondary_intents)
    full.setdefault("intent_mapping", intent_mapping)
    full["duration_ms"] = round(duration_ms, 2)
    full.setdefault("policy_applied", {"rule_id": None, "source": "agent_mode"})

    # Persist + memory write-back so streamed A2A decisions also show up in
    # /console/events alongside REST and MCP decisions.
    try:
        _persist_streamed(parsed, full, duration_ms, account_id, api_key_id)
    except Exception:  # pylint: disable=broad-except
        logger.exception("Persist after a2a stream failed")

    yield _sse(_artifact_update(
        task_id,
        "result",
        [{"type": "data", "data": full}],
        last_chunk=True,
    ))
    text = (
        f"Decision: {full.get('decision')} (confidence "
        f"{float(full.get('confidence') or 0):.2f}). {full.get('reason', '')}"
    )
    yield _sse(_status_update(
        task_id,
        "completed",
        final=True,
        message={
            "role": "agent",
            "parts": [{"type": "text", "text": text}],
        },
    ))


def _persist_streamed(
    parsed: Dict[str, Any],
    full: Dict[str, Any],
    duration_ms: float,
    account_id: Optional[int],
    api_key_id: Optional[int],
) -> None:
    intent = parsed["intent"]
    raw_intent = parsed.get("raw_intent") or intent
    secondary_intents = parsed.get("secondary_intents") or []
    intent_mapping = parsed.get("intent_mapping") or {}
    phone = parsed["phone"]
    extra_ctx = parsed["context"]
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

    new_events: List[Dict[str, Any]] = []
    risk_out = agent_outputs.get("RiskAgent") or {}
    for ev in (risk_out.get("memory_events") or []):
        new_events.append(ev)

    ts = datetime.now(timezone.utc).isoformat()
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
            "source": "a2a_stream",
            "raw_intent": raw_intent,
            "secondary_intents": secondary_intents,
            "intent_mapping": intent_mapping,
        },
        policy_rule_id=policy_applied.get("rule_id"),
        http_status=200,
        idempotency_key=parsed["task_id"],
    )

    write_back_memory(
        account_id,
        phone,
        intent=intent,
        observed_risk=risk_score,
        decision=str(decision or "ALLOW"),
        new_events=new_events,
    )


@a2a_bp.post("/a2a/tasks/sendSubscribe")
def tasks_send_subscribe():
    account_id, api_key_id, err = _auth_and_rate_limit()
    if err is not None:
        body, status = err
        return jsonify(body), status

    body = request.get_json(force=True, silent=True) or {}
    parsed, errs = _parse_task_request(body)
    if errs:
        return jsonify(_failed_task(body.get("id"), "; ".join(errs))), 400

    if parsed["skill"] == "lookup_phone_history":
        # Lookup is synchronous; fake a single SSE frame so callers using
        # tasks/sendSubscribe get a uniform interface.
        def _gen() -> Iterator[str]:
            try:
                result = _execute_lookup(parsed, account_id)
            except _A2AError as exc:
                yield _sse(_status_update(parsed["task_id"], "failed", final=True, message={
                    "role": "agent", "parts": [{"type": "text", "text": str(exc)}],
                }))
                return
            yield _sse(_status_update(parsed["task_id"], "working"))
            yield _sse(_artifact_update(parsed["task_id"], "history", [{"type": "data", "data": result}], last_chunk=True))
            yield _sse(_status_update(parsed["task_id"], "completed", final=True, message={
                "role": "agent",
                "parts": [{"type": "text", "text": f"Phone history for {parsed['phone']}"}],
            }))
        return Response(stream_with_context(_gen()), mimetype="text/event-stream", headers=_sse_headers())

    return Response(
        stream_with_context(_stream_decide(_normalize(parsed), account_id, api_key_id)),
        mimetype="text/event-stream",
        headers=_sse_headers(),
    )


def _sse_headers() -> Dict[str, str]:
    return {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }


# ─── Task lookup ─────────────────────────────────────────────────────────────


@a2a_bp.post("/a2a/tasks/get")
def tasks_get():
    account_id, _api_key_id, err = _auth_and_rate_limit()
    if err is not None:
        body, status = err
        return jsonify(body), status

    body = request.get_json(force=True, silent=True) or {}
    task_id = (body.get("id") or body.get("taskId") or "").strip()
    if not task_id:
        return jsonify({"error": {"code": -32602, "message": "id required"}}), 400

    conn = get_connection()
    try:
        if account_id is not None:
            cur = conn.execute(
                """
                SELECT * FROM analyze_events
                WHERE idempotency_key = ? AND account_id = ?
                ORDER BY id DESC LIMIT 1
                """,
                (task_id, account_id),
            )
        else:
            cur = conn.execute(
                """
                SELECT * FROM analyze_events
                WHERE idempotency_key = ?
                ORDER BY id DESC LIMIT 1
                """,
                (task_id,),
            )
        row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        return jsonify({"error": {"code": -32004, "message": f"no task with id={task_id}"}}), 404

    rec = dict(row)
    decision_data = {
        "decision": rec.get("decision"),
        "confidence": rec.get("confidence"),
        "risk_score": rec.get("risk_score"),
        "reason": rec.get("reason"),
        "intent": rec.get("intent"),
        "phone": rec.get("phone"),
        "duration_ms": rec.get("duration_ms"),
        "apis_called": _safe_json(rec.get("apis_called_json")),
        "decision_trace": _safe_json(rec.get("decision_trace_json")),
        "event_id": rec.get("id"),
    }
    text_summary = (
        f"Decision: {decision_data['decision']} (confidence "
        f"{float(decision_data.get('confidence') or 0):.2f})."
    )
    return jsonify({
        "id": task_id,
        "sessionId": None,
        "status": {
            "state": "completed",
            "timestamp": rec.get("created_at"),
            "message": {
                "role": "agent",
                "parts": [{"type": "text", "text": text_summary}],
            },
        },
        "artifacts": [
            {
                "name": "decision",
                "parts": [{"type": "data", "data": decision_data}],
            },
        ],
        "metadata": {"source": "audit"},
    })


# ─── Helpers ─────────────────────────────────────────────────────────────────


class _A2AError(RuntimeError):
    pass


def _aggregate_signals(agent_outputs: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for ao in agent_outputs.values():
        for k, v in (ao.get("signals") or {}).items():
            out[k] = v
    return out


def _sanitize_signals(signals: Dict[str, Any]) -> Dict[str, Any]:
    out = copy.deepcopy(signals)
    for v in out.values():
        if isinstance(v, dict):
            v.pop("_raw", None)
    return out


def _safe_json(s: Any) -> Any:
    if s is None:
        return None
    if not isinstance(s, str):
        return s
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return s


def _completed_task(
    task_id: str,
    session_id: Optional[str],
    result: Dict[str, Any],
    text_summary: str,
    skill: str,
) -> Dict[str, Any]:
    return {
        "id": task_id,
        "sessionId": session_id,
        "status": {
            "state": "completed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": {
                "role": "agent",
                "parts": [{"type": "text", "text": text_summary}],
            },
        },
        "artifacts": [
            {
                "name": skill,
                "parts": [{"type": "data", "data": result}],
            },
        ],
        "metadata": {},
    }


def _failed_task(task_id: Optional[str], message: str) -> Dict[str, Any]:
    return {
        "id": task_id or f"task-{uuid.uuid4().hex[:12]}",
        "sessionId": None,
        "status": {
            "state": "failed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": {
                "role": "agent",
                "parts": [{"type": "text", "text": message}],
            },
        },
        "artifacts": [],
        "metadata": {},
    }
