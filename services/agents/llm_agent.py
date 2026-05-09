"""LLM-driven agentic decision engine.

Uses OpenAI function/tool calling so GPT-4o-mini can:
  1. Dynamically choose which CAMARA signals to fetch (and in what order)
  2. Read each result before deciding whether to call more APIs
  3. Produce a final risk decision via the special `make_decision` tool

If the OpenAI call fails, or the model exhausts the iteration cap without
calling `make_decision`, the system falls back to the deterministic
orchestrator pipeline and appends `"fallback": true` to the response.
"""

import json
import logging
from typing import Any, Dict, Iterator, List, Optional

from config import AppConfig
from integrations.camara_client import (
    check_device_status,
    check_device_swap,
    check_number_recycling,
    check_reachability,
    check_sim_swap,
    check_tenure,
    get_call_forwarding,
    get_congestion,
    get_location,
    get_qos_status,
    get_roaming_status,
    retrieve_sim_swap_date,
    verify_age,
    verify_kyc_match,
    verify_location_at,
    verify_number,
)
from services.agents.base import Trace
from services.memory_service import compute_memory_influence

logger = logging.getLogger(__name__)
CONFIG = AppConfig()

MAX_ITERATIONS = 8

# ─── Tool schemas (OpenAI function-calling format) ────────────────────────────

_TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "check_sim_swap",
            "description": (
                "Check whether the phone number has had a recent SIM card swap. "
                "A recent swap is a strong fraud signal — the subscriber may have "
                "lost control of their number."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {"type": "string", "description": "Phone number in E.164 format, e.g. +233241234567"}
                },
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "retrieve_sim_swap_date",
            "description": "Retrieve the exact date of the last SIM swap for the phone number. Useful when you want to know how long ago the swap happened.",
            "parameters": {
                "type": "object",
                "properties": {"phone": {"type": "string"}},
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_device_swap",
            "description": "Check if the device associated with the phone number has changed recently. A recent device change alongside a SIM swap dramatically raises fraud risk.",
            "parameters": {
                "type": "object",
                "properties": {"phone": {"type": "string"}},
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "verify_number",
            "description": "Verify that the phone number is legitimate and matches an active subscriber. Use for onboarding and KYC flows.",
            "parameters": {
                "type": "object",
                "properties": {"phone": {"type": "string"}},
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_number_recycling",
            "description": "Check if this phone number was recently recycled (i.e. re-assigned from a previous subscriber). Recycled numbers are a risk in financial services and onboarding.",
            "parameters": {
                "type": "object",
                "properties": {"phone": {"type": "string"}},
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_roaming_status",
            "description": "Check whether the device is currently roaming (i.e. on a foreign network). Sudden international roaming for a domestic account is a fraud signal.",
            "parameters": {
                "type": "object",
                "properties": {"phone": {"type": "string"}},
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_call_forwarding",
            "description": "Check whether call forwarding is active on the number. Unconditional call forwarding is a red flag for SIM-swap-based account takeovers.",
            "parameters": {
                "type": "object",
                "properties": {"phone": {"type": "string"}},
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "verify_kyc_match",
            "description": "Verify that the subscriber's identity data (name, ID document) matches the network operator's records. Use for onboarding, finance, and insurance intents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {"type": "string"},
                    "name": {"type": "string", "description": "Full name of the customer (optional)"},
                    "id_doc": {"type": "string", "description": "ID document number (optional)"},
                },
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_tenure",
            "description": "Check how long this subscriber has been with the network operator. Long tenure is a positive trust signal; a brand-new number carries more risk.",
            "parameters": {
                "type": "object",
                "properties": {"phone": {"type": "string"}},
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "verify_age",
            "description": "Verify that the subscriber meets a minimum age requirement. Use for health, finance, and e-commerce intents where age-gating applies.",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {"type": "string"},
                    "min_age": {"type": "integer", "description": "Minimum age threshold (default 18)", "default": 18},
                },
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_qos_status",
            "description": "Get the current network Quality-of-Service for the device. Useful for emergency, mobility, health, agri, and logistics intents where connectivity quality matters.",
            "parameters": {
                "type": "object",
                "properties": {"phone": {"type": "string"}},
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_location",
            "description": "Retrieve the current location of the device. Use when geographic context is relevant (logistics, mobility, fraud with unexpected location).",
            "parameters": {
                "type": "object",
                "properties": {"phone": {"type": "string"}},
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "verify_location_at",
            "description": "Verify that the device is currently within a given geographic area (lat/lng + radius). Use to confirm claimed location for logistics or fraud checks.",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {"type": "string"},
                    "lat": {"type": "number", "description": "Center latitude"},
                    "lng": {"type": "number", "description": "Center longitude"},
                    "radius_m": {"type": "integer", "description": "Radius in metres (default 3000)", "default": 3000},
                },
                "required": ["phone", "lat", "lng"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_reachability",
            "description": "Check whether the device is currently reachable on the network. An unreachable device during an emergency or payment is a critical signal.",
            "parameters": {
                "type": "object",
                "properties": {"phone": {"type": "string"}},
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_device_status",
            "description": "Retrieve the device's connectivity status (roaming, connected, new device flag). Useful as a secondary check when device identity is in question.",
            "parameters": {
                "type": "object",
                "properties": {"phone": {"type": "string"}},
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_congestion",
            "description": "Check the network congestion level for the device's current cell. High congestion affects service quality for time-sensitive intents (emergency, logistics).",
            "parameters": {
                "type": "object",
                "properties": {"phone": {"type": "string"}},
                "required": ["phone"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "make_decision",
            "description": (
                "Output your final risk decision. Call this when you have gathered enough signals "
                "to make a confident assessment. This ends the reasoning loop."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "decision": {
                        "type": "string",
                        "enum": ["ALLOW", "VERIFY", "BLOCK", "PRIORITIZE", "DEGRADE"],
                        "description": (
                            "ALLOW = low risk, proceed. "
                            "VERIFY = moderate risk, step-up authentication needed. "
                            "BLOCK = high risk, deny. "
                            "PRIORITIZE = emergency — boost routing priority. "
                            "DEGRADE = network too poor for full service, degrade gracefully."
                        ),
                    },
                    "risk_score": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 100,
                        "description": "Estimated risk score 0 (safe) to 100 (highest risk).",
                    },
                    "confidence": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 1,
                        "description": "Confidence in the decision (0.0 to 1.0).",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Human-readable explanation of why this decision was made.",
                    },
                    "reasoning_summary": {
                        "type": "string",
                        "description": "Brief internal summary of the reasoning chain used.",
                    },
                },
                "required": ["decision", "risk_score", "confidence", "reason"],
            },
        },
    },
]

# ─── Tool dispatcher ──────────────────────────────────────────────────────────

def _dispatch(name: str, args: Dict[str, Any], phone: str) -> Dict[str, Any]:
    """Execute the named CAMARA tool and return its result."""
    p = args.get("phone", phone)
    try:
        if name == "check_sim_swap":
            return check_sim_swap(p)
        if name == "retrieve_sim_swap_date":
            return retrieve_sim_swap_date(p)
        if name == "check_device_swap":
            return check_device_swap(p)
        if name == "verify_number":
            return verify_number(p)
        if name == "check_number_recycling":
            return check_number_recycling(p)
        if name == "get_roaming_status":
            return get_roaming_status(p)
        if name == "get_call_forwarding":
            return get_call_forwarding(p)
        if name == "verify_kyc_match":
            return verify_kyc_match(p, args.get("name", ""), args.get("id_doc", ""))
        if name == "check_tenure":
            return check_tenure(p)
        if name == "verify_age":
            return verify_age(p, int(args.get("min_age", 18)))
        if name == "get_qos_status":
            return get_qos_status(p)
        if name == "get_location":
            return get_location(p)
        if name == "verify_location_at":
            return verify_location_at(p, args["lat"], args["lng"], int(args.get("radius_m", 3000)))
        if name == "check_reachability":
            return check_reachability(p)
        if name == "check_device_status":
            return check_device_status(p)
        if name == "get_congestion":
            return get_congestion(p)
    except Exception as exc:
        logger.warning("Tool %s failed: %s", name, exc)
        return {"_degraded": True, "_error": str(exc)}
    return {"_degraded": True, "_error": f"unknown tool: {name}"}


# ─── System prompt ────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are NetIQ's risk decision agent for African telecom and business contexts.

Your job is to:
1. Assess the risk of a request given the phone number, intent, and any additional context.
2. Fetch only the CAMARA signals most relevant to this specific intent — do NOT call all APIs blindly.
3. Use the cross-sector memory history provided in the user message to inform your assessment.
4. Call `make_decision` once you have enough information.

## Decision guide by intent

| Intent | Priority signals | Decision notes |
|---|---|---|
| fraud_prevention | sim_swap, device_swap, call_forwarding, roaming | Block if high risk; verify if moderate |
| onboarding | verify_number, number_recycling, kyc_match, tenure | Block if KYC fails; verify if moderate |
| emergency_response | reachability, qos, congestion | NEVER block; prioritize if network weak |
| mobility | qos, location, reachability, roaming | Degrade if network poor |
| health | qos, reachability, verify_age, kyc_match | Degrade if network poor; verify if identity weak |
| agri | qos, reachability, location | Degrade if connectivity poor |
| finance | sim_swap, kyc_match, call_forwarding, tenure, number_recycling | Block if multiple risk signals |
| insurance | kyc_match, verify_age, location_verify, tenure | Verify if any mismatch |
| ecommerce | sim_swap, device_swap, number_recycling, location | Block or verify on fraud signals |
| logistics | location, qos, reachability, roaming | Focus on connectivity and location |
| education | verify_number, kyc_match, tenure | Lighter risk profile |

## Rules
- Emergency responses: NEVER return BLOCK. Use PRIORITIZE when network is weak.
- For safety-critical intents (health, emergency), bias toward ALLOW/PRIORITIZE unless clear identity fraud.
- Be efficient: 2–4 API calls is usually enough. Only call more if a signal is ambiguous.
- If signals are degraded (API unavailable), note it and use available data.
- risk_score: 0 = safe, 100 = highest risk.
- confidence: how certain you are given the data you gathered (0.0–1.0).
"""


# ─── Main LLM pipeline ───────────────────────────────────────────────────────

def run_llm_pipeline(
    context: Dict[str, Any],
    memory: Dict[str, Any],
) -> Dict[str, Any]:
    """Run the LLM agent loop. Falls back to deterministic pipeline on failure."""

    if not CONFIG.OPENAI_API_KEY:
        logger.warning("No OPENAI_API_KEY — falling back to deterministic pipeline")
        return _fallback(context, memory, reason="no_api_key")

    try:
        from openai import OpenAI  # lazy import so server starts even without openai installed
    except ImportError:
        logger.warning("openai package not installed — falling back")
        return _fallback(context, memory, reason="openai_not_installed")

    client = OpenAI(api_key=CONFIG.OPENAI_API_KEY)
    phone = context.get("phone", "")
    intent = context.get("intent", "fraud_prevention")
    extra_ctx = context.get("context") or {}

    memory_summary = _summarize_memory(memory)
    user_message = (
        f"Intent: {intent}\n"
        f"Phone: {phone}\n"
        f"Additional context: {json.dumps(extra_ctx, default=str)}\n"
        f"Cross-sector memory: {memory_summary}"
    )

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    trace = Trace()
    api_calls: List[str] = []
    selected_agents: List[str] = []

    trace.add("LLMAgent", f"Starting reasoning loop for intent={intent}", f"phone={phone}")

    final_decision: Optional[Dict[str, Any]] = None

    for iteration in range(MAX_ITERATIONS):
        try:
            response = client.chat.completions.create(
                model=CONFIG.OPENAI_MODEL,
                messages=messages,  # type: ignore[arg-type]
                tools=_TOOLS,  # type: ignore[arg-type]
                tool_choice="auto",
                temperature=0.1,
            )
        except Exception as exc:
            logger.error("OpenAI API error on iteration %d: %s", iteration, exc)
            return _fallback(context, memory, reason=str(exc))

        choice = response.choices[0]
        messages.append(choice.message.model_dump(exclude_unset=False))  # type: ignore[arg-type]

        if choice.finish_reason == "stop" or not choice.message.tool_calls:
            # Model stopped without calling make_decision — try to extract from text
            logger.warning("LLM stopped without make_decision on iteration %d", iteration)
            break

        tool_results = []
        for tc in choice.message.tool_calls:
            fn_name = tc.function.name
            try:
                fn_args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                fn_args = {}

            if fn_name == "make_decision":
                final_decision = fn_args
                trace.add(
                    "LLMAgent",
                    "make_decision called",
                    f"{fn_args.get('decision')} (risk={fn_args.get('risk_score')}, "
                    f"conf={fn_args.get('confidence')})",
                )
                # No need to continue — but still append a tool result so the message list is valid
                tool_results.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": "decision recorded",
                })
                break

            # It's a CAMARA signal call
            api_calls.append(fn_name)
            if fn_name not in selected_agents:
                selected_agents.append(fn_name)

            result = _dispatch(fn_name, fn_args, phone)
            result_str = json.dumps(result, default=str)

            trace.add("LLMAgent", f"Called {fn_name}", result_str[:200])
            tool_results.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result_str,
            })

        messages.extend(tool_results)  # type: ignore[arg-type]

        if final_decision is not None:
            break

    if final_decision is None:
        logger.warning("LLM did not call make_decision after %d iterations — falling back", MAX_ITERATIONS)
        return _fallback(context, memory, reason="max_iterations_exceeded")

    decision_val = final_decision.get("decision", "VERIFY")
    risk_score = float(final_decision.get("risk_score", 50.0))
    confidence = float(final_decision.get("confidence", 0.7))
    reason = str(final_decision.get("reason", "LLM decision"))
    reasoning_summary = str(final_decision.get("reasoning_summary", ""))

    return {
        "decision": decision_val,
        "confidence": confidence,
        "risk_score": risk_score,
        "reason": reason,
        "reasoning_summary": reasoning_summary,
        "memory_influence": compute_memory_influence(memory, intent),
        "selected_agents": selected_agents,
        "agent_outputs": {},
        "api_calls": api_calls,
        "trace": trace.to_list(),
        "visualization_payload": _build_viz(selected_agents, api_calls),
        "fallback": False,
    }


# ─── Streaming pipeline ───────────────────────────────────────────────────────

def run_llm_pipeline_stream(
    context: Dict[str, Any],
    memory: Dict[str, Any],
) -> Iterator[Dict[str, Any]]:
    """Streaming variant of run_llm_pipeline.

    Yields a sequence of event dicts that callers can serialize to SSE. Always
    terminates with a single ``{"type": "done", "full_response": {...}}`` event
    whose payload matches the shape returned by ``run_llm_pipeline`` so the
    caller can persist it just like the synchronous path.
    """

    intent = context.get("intent", "fraud_prevention")
    phone = context.get("phone", "")
    yield {"type": "start", "intent": intent, "phone": phone}

    if not CONFIG.OPENAI_API_KEY:
        logger.warning("No OPENAI_API_KEY — falling back to deterministic pipeline")
        yield from _stream_fallback(context, memory, reason="no_api_key")
        return

    try:
        from openai import OpenAI  # pylint: disable=import-outside-toplevel
    except ImportError:
        logger.warning("openai package not installed — falling back")
        yield from _stream_fallback(context, memory, reason="openai_not_installed")
        return

    client = OpenAI(api_key=CONFIG.OPENAI_API_KEY)
    extra_ctx = context.get("context") or {}

    memory_summary = _summarize_memory(memory)
    user_message = (
        f"Intent: {intent}\n"
        f"Phone: {phone}\n"
        f"Additional context: {json.dumps(extra_ctx, default=str)}\n"
        f"Cross-sector memory: {memory_summary}"
    )

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    trace = Trace()
    api_calls: List[str] = []
    selected_agents: List[str] = []
    step_counter = 0

    trace.add("LLMAgent", f"Starting reasoning loop for intent={intent}", f"phone={phone}")

    final_decision: Optional[Dict[str, Any]] = None

    for iteration in range(MAX_ITERATIONS):
        try:
            response = client.chat.completions.create(
                model=CONFIG.OPENAI_MODEL,
                messages=messages,  # type: ignore[arg-type]
                tools=_TOOLS,  # type: ignore[arg-type]
                tool_choice="auto",
                temperature=0.1,
            )
        except Exception as exc:  # pylint: disable=broad-except
            logger.error("OpenAI API error on iteration %d: %s", iteration, exc)
            yield from _stream_fallback(context, memory, reason=str(exc))
            return

        choice = response.choices[0]
        messages.append(choice.message.model_dump(exclude_unset=False))  # type: ignore[arg-type]

        if choice.finish_reason == "stop" or not choice.message.tool_calls:
            logger.warning("LLM stopped without make_decision on iteration %d", iteration)
            break

        tool_results = []
        for tc in choice.message.tool_calls:
            fn_name = tc.function.name
            try:
                fn_args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                fn_args = {}

            step_counter += 1

            if fn_name == "make_decision":
                final_decision = fn_args
                trace.add(
                    "LLMAgent",
                    "make_decision called",
                    f"{fn_args.get('decision')} (risk={fn_args.get('risk_score')}, "
                    f"conf={fn_args.get('confidence')})",
                )
                tool_results.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": "decision recorded",
                })
                break

            yield {
                "type": "tool_call",
                "step": step_counter,
                "tool": fn_name,
                "args": fn_args,
            }

            api_calls.append(fn_name)
            if fn_name not in selected_agents:
                selected_agents.append(fn_name)

            result = _dispatch(fn_name, fn_args, phone)
            result_str = json.dumps(result, default=str)

            yield {
                "type": "tool_result",
                "step": step_counter,
                "tool": fn_name,
                "result": result,
                "degraded": bool(isinstance(result, dict) and result.get("_degraded")),
            }

            trace.add("LLMAgent", f"Called {fn_name}", result_str[:200])
            tool_results.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result_str,
            })

        messages.extend(tool_results)  # type: ignore[arg-type]

        if final_decision is not None:
            break

    if final_decision is None:
        logger.warning("LLM did not call make_decision after %d iterations — falling back", MAX_ITERATIONS)
        yield from _stream_fallback(context, memory, reason="max_iterations_exceeded")
        return

    decision_val = final_decision.get("decision", "VERIFY")
    risk_score = float(final_decision.get("risk_score", 50.0))
    confidence = float(final_decision.get("confidence", 0.7))
    reason = str(final_decision.get("reason", "LLM decision"))
    reasoning_summary = str(final_decision.get("reasoning_summary", ""))
    influence = compute_memory_influence(memory, intent)

    yield {
        "type": "decision",
        "decision": decision_val,
        "risk_score": risk_score,
        "confidence": confidence,
        "reason": reason,
        "reasoning_summary": reasoning_summary,
    }
    yield {"type": "memory", "memory_influence": influence}

    full_response = {
        "decision": decision_val,
        "confidence": confidence,
        "risk_score": risk_score,
        "reason": reason,
        "reasoning_summary": reasoning_summary,
        "memory_influence": influence,
        "selected_agents": selected_agents,
        "agent_outputs": {},
        "api_calls": api_calls,
        "trace": trace.to_list(),
        "visualization_payload": _build_viz(selected_agents, api_calls),
        "fallback": False,
    }
    yield {"type": "done", "full_response": full_response}


def _stream_fallback(
    context: Dict[str, Any],
    memory: Dict[str, Any],
    reason: str,
) -> Iterator[Dict[str, Any]]:
    """Stream a fallback sequence: announce + run deterministic + replay trace + done."""
    yield {"type": "fallback", "reason": reason}
    result = _fallback(context, memory, reason=reason)

    # Replay the deterministic trace so the UI gets the same animated experience.
    for step in result.get("trace") or []:
        yield {
            "type": "trace_step",
            "step": step,
        }

    yield {
        "type": "decision",
        "decision": result.get("decision", {}).get("decision") if isinstance(result.get("decision"), dict) else result.get("decision"),
        "risk_score": _decision_field(result, "risk_score", 0.0),
        "confidence": _decision_field(result, "confidence", 0.5),
        "reason": _decision_field(result, "reason", "Fallback decision"),
        "reasoning_summary": "Deterministic fallback used.",
    }
    yield {
        "type": "memory",
        "memory_influence": _decision_field(result, "memory_influence", {}),
    }

    full = _flatten_deterministic_result(result)
    full["fallback"] = True
    full["fallback_reason"] = reason
    yield {"type": "done", "full_response": full}


def _decision_field(result: Dict[str, Any], key: str, default: Any) -> Any:
    """Pull a field that may live on the top-level result OR inside result['decision']."""
    if key in result and result.get(key) is not None:
        return result[key]
    d = result.get("decision")
    if isinstance(d, dict) and key in d:
        return d[key]
    return default


def _flatten_deterministic_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """Convert the orchestrator's nested decision shape to the flat agent shape."""
    d = result.get("decision")
    if isinstance(d, dict):
        return {
            "decision": d.get("decision"),
            "confidence": d.get("confidence"),
            "risk_score": d.get("risk_score"),
            "reason": d.get("reason"),
            "reasoning_summary": "Deterministic fallback used.",
            "memory_influence": d.get("memory_influence") or {},
            "selected_agents": result.get("selected_agents") or [],
            "agent_outputs": result.get("agent_outputs") or {},
            "api_calls": result.get("api_calls") or [],
            "trace": result.get("trace") or [],
            "visualization_payload": result.get("visualization_payload") or {},
        }
    return dict(result)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _summarize_memory(memory: Dict[str, Any]) -> str:
    if not memory:
        return "No prior history for this number."
    global_risk = memory.get("global_risk_score", 0)
    sector_scores = memory.get("sector_scores", {})
    events = memory.get("events", [])
    event_types = [e.get("type") for e in events[-5:] if isinstance(e, dict)]
    return (
        f"global_risk={global_risk}, sector_scores={json.dumps(sector_scores)}, "
        f"recent_events={event_types or 'none'}"
    )


def _build_viz(_selected_agents: List[str], api_calls: List[str]) -> Dict[str, Any]:
    nodes = ["User", "LLMAgent"]
    edges = [{"from": "User", "to": "LLMAgent", "label": "intent"}]
    if api_calls:
        nodes.append("CAMARA APIs")
        edges.append({"from": "LLMAgent", "to": "CAMARA APIs", "label": "tool calls"})
        edges.append({"from": "CAMARA APIs", "to": "LLMAgent", "label": "results"})
    nodes.append("Decision")
    edges.append({"from": "LLMAgent", "to": "Decision", "label": "make_decision"})
    return {"nodes": nodes, "edges": edges, "api_calls": api_calls}


def _fallback(
    context: Dict[str, Any],
    memory: Dict[str, Any],
    reason: str = "unknown",
) -> Dict[str, Any]:
    """Run the original deterministic pipeline and flag it as a fallback."""
    # pylint: disable=import-outside-toplevel
    from services.agents.orchestrator_agent import _run_deterministic  # type: ignore[attr-defined]

    logger.info("LLM fallback triggered: %s", reason)
    result = _run_deterministic(context, memory)
    result["fallback"] = True
    result["fallback_reason"] = reason
    return result
