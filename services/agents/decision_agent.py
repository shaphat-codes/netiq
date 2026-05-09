"""DecisionAgent — fuse risk + network signals into a final decision.

Memory-weighted; intent-aware; safety-first for emergency_response.
"""

from typing import Any, Dict, List, Optional

from services.agents.base import Agent, Trace
from services.memory_service import (
    compute_memory_influence,
    memory_weight_for_intent,
    sector_for_intent,
)


def _normalize_confidence(risk: float) -> float:
    # Map 0..100 risk to 1.0..0.4 confidence with a soft curve.
    if risk <= 0:
        return 1.0
    if risk >= 100:
        return 0.4
    return round(max(0.4, 1.0 - (risk / 100.0) * 0.6), 3)


def _decide_for_intent(
    intent: Optional[str],
    risk: float,
    network_reliability: float,
) -> tuple[str, str]:
    """Return (decision, reason_suffix)."""
    if intent == "emergency_response":
        # Safety-first: never block; prioritize on weak network.
        if network_reliability < 40:
            return "PRIORITIZE", "Emergency with weak network — prioritize routing"
        return "ALLOW", "Emergency request approved"

    if intent == "fraud_prevention":
        if risk >= 75:
            return "BLOCK", "High fraud risk"
        if risk >= 45:
            return "VERIFY", "Moderate fraud risk — step-up required"
        return "ALLOW", "Low fraud risk"

    if intent == "onboarding":
        if risk >= 70:
            return "BLOCK", "High risk onboarding"
        if risk >= 40:
            return "VERIFY", "Moderate risk onboarding — step-up required"
        return "ALLOW", "Low risk onboarding"

    if intent == "mobility":
        if network_reliability < 35:
            return "DEGRADE", "Network unreliable — degrade quality"
        if risk >= 60:
            return "VERIFY", "Risk warrants verification before mobility action"
        return "ALLOW", "Mobility action approved"

    if intent in ("health", "agri"):
        if network_reliability < 30:
            return "DEGRADE", "Network too weak for full service"
        if risk >= 70:
            return "VERIFY", "Identity verification required before service"
        return "ALLOW", "Service approved"

    # default
    if risk >= 75:
        return "BLOCK", "High risk"
    if risk >= 45:
        return "VERIFY", "Moderate risk"
    return "ALLOW", "Low risk"


class DecisionAgent(Agent):
    name = "DecisionAgent"

    def run(
        self,
        context: Dict[str, Any],
        memory: Dict[str, Any],
        trace: Trace,
        api_calls: List[str],
        *,
        risk_output: Optional[Dict[str, Any]] = None,
        network_output: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        intent = context.get("intent")
        risk_output = risk_output or {}
        network_output = network_output or {}

        signal_risk = float(risk_output.get("raw_risk") or 0.0)
        network_reliability = float(network_output.get("reliability_score") or 50.0)
        weight = memory_weight_for_intent(intent)
        sector = sector_for_intent(intent)

        sector_scores = memory.get("sector_scores") or {}
        sector_mem = float(sector_scores.get(sector) or 0.0)
        global_mem = float(memory.get("global_risk_score") or 0.0)
        memory_component = max(global_mem, sector_mem)
        # Final risk: blend signal-derived risk with memory under intent weight.
        final_risk = round(min(100.0, signal_risk * (1.0 - weight * 0.4) + memory_component * weight * 0.6), 2)

        # If network is poor (and intent cares), nudge risk up modestly.
        if intent in ("fraud_prevention", "onboarding") and network_reliability < 45:
            final_risk = round(min(100.0, final_risk + 5.0), 2)

        decision, base_reason = _decide_for_intent(intent, final_risk, network_reliability)
        confidence = _normalize_confidence(final_risk)

        reason_parts: List[str] = [base_reason]
        reason_parts.extend(risk_output.get("reasons") or [])
        reason_parts.extend(network_output.get("reasons") or [])
        if memory_component >= 50:
            reason_parts.append(f"Cross-sector memory elevated ({sector}={round(sector_mem)}, global={round(global_mem)})")

        result = {
            "decision": decision,
            "confidence": confidence,
            "risk_score": final_risk,
            "reason": "; ".join([r for r in reason_parts if r]),
            "memory_influence": compute_memory_influence(memory, intent),
            "components": {
                "signal_risk": round(signal_risk, 2),
                "memory_risk": round(memory_component, 2),
                "network_reliability": round(network_reliability, 2),
                "weight": round(weight, 3),
            },
        }
        trace.add(
            self.name,
            "Combined signal risk + memory + network reliability",
            f"{decision} (risk={final_risk}, conf={confidence})",
        )
        return result
