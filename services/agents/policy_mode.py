"""Policy mode for /decision/run.

Uses the same agent surface to fetch CAMARA signals (so it sees the same
memory + dynamic intent dispatch the agent path uses), but defers the final
decision to the deterministic tenant policy engine instead of DecisionAgent.

This is intentionally a thin wrapper: it lets reviewers compare the two modes
on identical inputs.
"""

from typing import Any, Dict, List, Optional, Tuple

from services.agents.base import Trace
from services.agents.network_agent import NetworkAgent
from services.agents.risk_agent import RiskAgent
from services.agents.visualization import build_visualization_payload
from services.memory_service import compute_memory_influence
from services.policy_engine import evaluate_tenant_policy
from services.policy_facts import build_facts


def _select_agents(intent: str) -> Tuple[List, str]:
    """Map intent to the set of agents and the new signal flags each should use."""
    if intent == "fraud_prevention":
        return (
            [RiskAgent(check_roaming=True, check_call_fwd=True), NetworkAgent(primary=True)],
            "fraud → Risk (+ roaming, call-fwd) + Network",
        )
    if intent == "onboarding":
        return (
            [RiskAgent(check_kyc=True, check_tenure_flag=True)],
            "onboarding → Risk (+ KYC, tenure)",
        )
    if intent == "emergency_response":
        return [NetworkAgent(primary=True)], "emergency → Network primarily"
    if intent == "mobility":
        return (
            [NetworkAgent(primary=True), RiskAgent(light=True, check_roaming=True)],
            "mobility → Network + light Risk (+ roaming)",
        )
    if intent == "health":
        return (
            [NetworkAgent(primary=True), RiskAgent(light=True, check_kyc=True, check_age=True, min_age=18)],
            "health → Network + light Risk (+ KYC, age)",
        )
    if intent == "agri":
        return (
            [NetworkAgent(primary=False), RiskAgent(light=True)],
            "agri → Network + low-weight Risk",
        )
    if intent == "finance":
        return (
            [RiskAgent(check_kyc=True, check_tenure_flag=True, check_call_fwd=True), NetworkAgent(primary=False)],
            "finance → Risk (+ KYC, tenure, call-fwd) + light Network",
        )
    if intent == "insurance":
        return (
            [RiskAgent(check_kyc=True, check_tenure_flag=True, check_age=True, min_age=21), NetworkAgent(primary=False)],
            "insurance → Risk (+ KYC, tenure, age) + light Network",
        )
    if intent == "ecommerce":
        return (
            [RiskAgent(check_roaming=True), NetworkAgent(primary=False)],
            "ecommerce → Risk (+ roaming) + light Network",
        )
    if intent == "logistics":
        return (
            [NetworkAgent(primary=True), RiskAgent(light=True, check_roaming=True)],
            "logistics → Network (primary) + light Risk (+ roaming)",
        )
    if intent == "education":
        return (
            [RiskAgent(check_kyc=True, check_tenure_flag=True)],
            "education → Risk (+ KYC, tenure)",
        )
    return [RiskAgent(), NetworkAgent(primary=True)], "default → Risk + Network"


def run_policy_pipeline(
    context: Dict[str, Any],
    memory: Dict[str, Any],
    *,
    policy_content: Optional[Dict[str, Any]],
    compliance_mode: str = "relaxed",
) -> Dict[str, Any]:
    intent = context.get("intent") or "fraud_prevention"
    trace = Trace()
    api_calls: List[str] = []
    selected_agents, rationale = _select_agents(intent)
    selected_names = [a.name for a in selected_agents]

    trace.add(
        "OrchestratorAgent",
        f"Policy mode: selected {', '.join(selected_names)}",
        rationale,
    )

    agent_outputs: Dict[str, Dict[str, Any]] = {}
    aggregated_signals: Dict[str, Any] = {}
    for agent in selected_agents:
        out = agent.run(context, memory, trace, api_calls)
        agent_outputs[agent.name] = out
        for k, v in (out.get("signals") or {}).items():
            aggregated_signals[k] = v

    # Build facts and run the tenant policy engine over them.
    facts = build_facts(context, aggregated_signals, None, {"profile": memory})
    facts["intent"] = intent
    base_decision = _baseline_from_signals(aggregated_signals, agent_outputs)

    final, decision_trace = evaluate_tenant_policy(
        facts, base_decision, policy_content, compliance_mode
    )

    # Memory adjustment on top of the rule outcome (kept conservative).
    memory_component = max(
        float(memory.get("global_risk_score") or 0.0),
        float((memory.get("sector_scores") or {}).get(_sector(intent)) or 0.0),
    )
    if memory_component >= 60 and final.get("decision") == "ALLOW":
        final = dict(final)
        final["decision"] = "VERIFY"
        final["reason"] = (final.get("reason") or "") + "; memory: cross-sector history elevated"

    trace.add(
        "PolicyEngine",
        "Evaluated tenant rules",
        f"{final.get('decision')} via rule={decision_trace.get('policy_rule_id') or 'default'}",
    )

    return {
        "decision": final.get("decision"),
        "confidence": float(final.get("confidence", 0.85)),
        "risk_score": float(final.get("risk_score", base_decision.get("risk_score", 0.0))),
        "reason": final.get("reason") or "Policy decision",
        "memory_influence": compute_memory_influence(memory, intent),
        "selected_agents": selected_names,
        "agent_outputs": agent_outputs,
        "policy_applied": {
            "rule_id": decision_trace.get("policy_rule_id"),
            "source": decision_trace.get("policy_source", "platform_default"),
        },
        "trace": trace.to_list(),
        "api_calls": list(api_calls),
        "visualization_payload": build_visualization_payload(selected_names, api_calls),
    }


def _baseline_from_signals(_signals: Dict[str, Any], agent_outputs: Dict[str, Any]) -> Dict[str, Any]:
    """A conservative baseline so the policy engine has something to override."""
    risk = float((agent_outputs.get("RiskAgent") or {}).get("raw_risk") or 0.0)
    if risk >= 75:
        decision = "BLOCK"
    elif risk >= 45:
        decision = "VERIFY"
    else:
        decision = "ALLOW"
    return {
        "decision": decision,
        "confidence": 0.85,
        "risk_score": risk,
        "reason": "Baseline from signals before policy",
    }


def _sector(intent: str) -> str:
    from services.memory_service import sector_for_intent

    return sector_for_intent(intent)
