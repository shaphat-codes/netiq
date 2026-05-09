"""NetIQ MCP tool catalogue.

Five high-level tools, all transport-agnostic. The same ``call_tool`` function
is invoked by both the stdio server (mcp_server.py) and the HTTP transport
(routes/mcp_http.py).

Why these tools and not raw CAMARA mirrors?
-------------------------------------------
Nokia's MCP playground exposes one tool per CAMARA endpoint, leaving the agent
to orchestrate dozens of calls. NetIQ goes one level up: the agent expresses an
intent (``fraud_prevention``, ``onboarding``, ...) and NetIQ runs the right
mix of CAMARA APIs internally — using either the LLM agent or the tenant
policy engine — and returns a business decision plus trace.

Tools
-----
* ``decide`` — main entry point; runs agent or policy mode end-to-end.
* ``evaluate_policy`` — forces policy mode (deterministic, tenant rules).
* ``lookup_phone_history`` — read cross-sector memory for a phone.
* ``list_intents`` — discoverability for callers that just connected.
* ``get_decision_audit`` — retrieve a prior decision by event id.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from config import AppConfig
from database.db import get_active_policy, get_connection, insert_analyze_event
from services.agents import run_agent_pipeline, run_policy_pipeline
from services.intent_mapper import CANONICAL_INTENTS, normalize_intent
from services.memory_service import get_cross_sector_memory, write_back_memory

logger = logging.getLogger(__name__)
CONFIG = AppConfig()

VALID_MODES = ["policy", "agent"]


# ─── Tool catalogue ──────────────────────────────────────────────────────────

TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "name": "decide",
        "description": (
            "Make a network-aware risk decision for a phone number and a business "
            "intent. NetIQ internally orchestrates the right Nokia Network as Code "
            "CAMARA APIs (SIM swap, device swap, KYC match, location, QoS, "
            "reachability, etc.) based on the intent, fuses the signals with the "
            "tenant's cross-sector phone-number memory, and returns a structured "
            "decision (ALLOW | VERIFY | BLOCK | PRIORITIZE | DEGRADE) with "
            "confidence, risk score, reason, execution trace, and memory influence. "
            "Use this whenever you need to gate an action (login, payment, "
            "onboarding, ride dispatch, claim payout, ...) on telecom trust "
            "signals."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "intent": {
                    "type": "string",
                    "description": (
                        "Free-form business intent. NetIQ maps this into canonical intent(s) "
                        "before routing."
                    ),
                },
                "phone": {
                    "type": "string",
                    "description": "Phone number in E.164 format, e.g. +233241234567.",
                },
                "mode": {
                    "type": "string",
                    "enum": VALID_MODES,
                    "default": "agent",
                    "description": (
                        "'agent' — GPT-4o-mini dynamically picks CAMARA signals. "
                        "'policy' — runs the tenant's saved JSON rules."
                    ),
                },
                "context": {
                    "type": "object",
                    "description": "Optional payload, e.g. {amount, location, device_info, compliance_mode}",
                },
            },
            "required": ["intent", "phone"],
        },
    },
    {
        "name": "evaluate_policy",
        "description": (
            "Run the request through the tenant's saved policy engine only "
            "(deterministic, no LLM). Errors with a clear message if the tenant "
            "has no active policy rules. Useful for compliance-sensitive flows or "
            "regression-testing rule changes."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "intent": {"type": "string"},
                "phone": {"type": "string"},
                "context": {"type": "object"},
            },
            "required": ["intent", "phone"],
        },
    },
    {
        "name": "lookup_phone_history",
        "description": (
            "Return NetIQ's cross-sector memory for a phone number: global risk "
            "score, per-sector scores (finance, mobility, health, …), recent "
            "events (SIM_SWAP, DEVICE_SWAP, …), and the trust trajectory. "
            "Read-only — does not consume Nokia API quota."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "phone": {"type": "string"},
            },
            "required": ["phone"],
        },
    },
    {
        "name": "list_intents",
        "description": (
            "List the business intents NetIQ supports along with the kind of "
            "signals each intent typically prioritises. Call this first if you're "
            "unsure which intent to use for ``decide``."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_decision_audit",
        "description": (
            "Fetch a previously recorded decision by its event id. Returns the "
            "full decision payload that was returned to the original caller, plus "
            "the persisted signals and execution trace. Useful for audit, "
            "regulatory review, and dispute resolution."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "event_id": {"type": "integer", "description": "analyze_events.id"},
            },
            "required": ["event_id"],
        },
    },
]


# ─── Public helpers ──────────────────────────────────────────────────────────

def list_tools() -> List[Dict[str, Any]]:
    return list(TOOL_DEFINITIONS)


def call_tool(
    name: str,
    arguments: Dict[str, Any],
    *,
    account_id: Optional[int],
    api_key_id: Optional[int],
) -> Tuple[bool, Dict[str, Any]]:
    """Execute a tool. Returns ``(ok, payload)``.

    Errors are returned as ``(False, {"error": "..."} )`` so transports can
    surface them uniformly (MCP isError flag, A2A error frame, …).
    """
    try:
        if name == "decide":
            return True, _tool_decide(arguments, account_id, api_key_id)
        if name == "evaluate_policy":
            args = dict(arguments)
            args["mode"] = "policy"
            return True, _tool_decide(args, account_id, api_key_id)
        if name == "lookup_phone_history":
            return True, _tool_lookup_phone_history(arguments, account_id)
        if name == "list_intents":
            return True, _tool_list_intents()
        if name == "get_decision_audit":
            return True, _tool_get_decision_audit(arguments, account_id)
        return False, {"error": f"unknown tool: {name}"}
    except _ToolError as exc:
        return False, {"error": str(exc)}
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("MCP tool %s crashed", name)
        return False, {"error": f"internal error: {exc}"}


# ─── Tool implementations ────────────────────────────────────────────────────


class _ToolError(RuntimeError):
    """Raised by tool handlers to surface a user-visible error."""


def _tool_decide(
    arguments: Dict[str, Any],
    account_id: Optional[int],
    api_key_id: Optional[int],
) -> Dict[str, Any]:
    intent = (arguments.get("intent") or "").strip()
    phone = (arguments.get("phone") or "").strip()
    mode = (arguments.get("mode") or "agent").strip().lower()
    extra_ctx = arguments.get("context") or {}
    if not isinstance(extra_ctx, dict):
        extra_ctx = {}

    if not intent:
        raise _ToolError("intent is required")
    if not phone:
        raise _ToolError("phone is required")
    if mode not in VALID_MODES:
        raise _ToolError(f"mode must be one of {VALID_MODES}")

    mapping = normalize_intent(intent, extra_ctx)
    primary_intent = mapping["primary_intent"]
    secondary_intents = mapping["secondary_intents"]
    intent_mapping = {
        "reasoning": mapping.get("intent_mapping_reasoning", ""),
        "confidence": mapping.get("intent_mapping_confidence", 0.0),
        "source": mapping.get("intent_mapping_source", "fallback"),
        "canonical_intents": CANONICAL_INTENTS,
    }

    context = {
        "intent": primary_intent,
        "raw_intent": mapping["raw_intent"],
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
            raise _ToolError(
                "No policy rules configured for this account. "
                "Create a policy in the NetIQ console (Policies page) before using policy mode, "
                "or call ``decide`` with mode='agent' for the LLM agentic path."
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

    aggregated_signals = _aggregate_and_sanitize(agent_outputs)

    new_events: List[Dict[str, Any]] = []
    risk_out = agent_outputs.get("RiskAgent") or {}
    for ev in (risk_out.get("memory_events") or []):
        new_events.append(ev)

    event_id: Optional[int] = None
    ts = datetime.now(timezone.utc).isoformat()
    try:
        event_id = insert_analyze_event(
            created_at=ts,
            phone=phone,
            intent=primary_intent,
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
                "source": "mcp",
                "raw_intent": mapping["raw_intent"],
                "secondary_intents": secondary_intents,
                "intent_mapping": intent_mapping,
            },
            policy_rule_id=policy_applied.get("rule_id"),
            http_status=200,
            idempotency_key=None,
        )
    except Exception:  # pylint: disable=broad-except
        logger.exception("Failed to persist MCP decide event")

    write_back_memory(
        account_id,
        phone,
        intent=primary_intent,
        observed_risk=risk_score,
        decision=str(decision or "ALLOW"),
        new_events=new_events,
    )

    return {
        "mode": mode,
        "intent": primary_intent,
        "raw_intent": mapping["raw_intent"],
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
        "event_id": event_id,
    }


def _tool_lookup_phone_history(
    arguments: Dict[str, Any],
    account_id: Optional[int],
) -> Dict[str, Any]:
    phone = (arguments.get("phone") or "").strip()
    if not phone:
        raise _ToolError("phone is required")
    memory = get_cross_sector_memory(account_id, phone)
    return {
        "phone": phone,
        "global_risk_score": memory.get("global_risk_score", 0.0),
        "sector_scores": memory.get("sector_scores", {}),
        "events": (memory.get("events") or [])[-15:],
        "trust_trajectory": (memory.get("trust_trajectory") or [])[-15:],
        "decision_count": memory.get("decision_count", 0),
    }


def _tool_list_intents() -> Dict[str, Any]:
    return {
        "intents": [
            {"intent": "fraud_prevention", "signals": "SIM swap, device swap, call forwarding, roaming, number recycling"},
            {"intent": "onboarding", "signals": "Number verify, KYC match, tenure, number recycling"},
            {"intent": "emergency_response", "signals": "Reachability, QoS, congestion (never blocks)"},
            {"intent": "mobility", "signals": "QoS, location, reachability, roaming"},
            {"intent": "health", "signals": "QoS, reachability, age verify, KYC match"},
            {"intent": "agri", "signals": "QoS, reachability, location"},
            {"intent": "finance", "signals": "SIM swap, KYC match, call forwarding, tenure, number recycling"},
            {"intent": "insurance", "signals": "KYC match, age verify, location verify, tenure"},
            {"intent": "ecommerce", "signals": "SIM swap, device swap, number recycling, location"},
            {"intent": "logistics", "signals": "Location, QoS, reachability, roaming"},
            {"intent": "education", "signals": "Number verify, KYC match, tenure"},
        ],
        "modes": VALID_MODES,
        "note": "Incoming intent may be free-form; NetIQ maps to canonical intents internally.",
    }


def _tool_get_decision_audit(
    arguments: Dict[str, Any],
    account_id: Optional[int],
) -> Dict[str, Any]:
    event_id = arguments.get("event_id")
    if event_id is None:
        raise _ToolError("event_id is required")
    try:
        eid = int(event_id)
    except (TypeError, ValueError) as exc:
        raise _ToolError("event_id must be an integer") from exc

    conn = get_connection()
    try:
        if account_id is not None:
            cur = conn.execute(
                "SELECT * FROM analyze_events WHERE id = ? AND account_id = ?",
                (eid, account_id),
            )
        else:
            cur = conn.execute("SELECT * FROM analyze_events WHERE id = ?", (eid,))
        row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        raise _ToolError(f"no decision found with event_id={eid}")

    rec = dict(row)
    return {
        "event_id": rec.get("id"),
        "created_at": rec.get("created_at"),
        "phone": rec.get("phone"),
        "intent": rec.get("intent"),
        "decision": rec.get("decision"),
        "confidence": rec.get("confidence"),
        "risk_score": rec.get("risk_score"),
        "reason": rec.get("reason"),
        "duration_ms": rec.get("duration_ms"),
        "apis_called": _safe_json(rec.get("apis_called_json")),
        "signals": _safe_json(rec.get("signals_json")),
        "decision_trace": _safe_json(rec.get("decision_trace_json")),
    }


# ─── Internal helpers ────────────────────────────────────────────────────────


def _aggregate_and_sanitize(agent_outputs: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for ao in agent_outputs.values():
        for k, v in (ao.get("signals") or {}).items():
            out[k] = v
    # Strip _raw to keep payloads light.
    for v in out.values():
        if isinstance(v, dict):
            v.pop("_raw", None)
    return out


def _safe_json(s: Any) -> Any:
    if s is None:
        return None
    if not isinstance(s, str):
        return s
    import json as _json
    try:
        return _json.loads(s)
    except Exception:  # pylint: disable=broad-except
        return s
