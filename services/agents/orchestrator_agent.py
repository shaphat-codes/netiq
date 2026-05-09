"""OrchestratorAgent — picks which agents to run for a given intent."""

from typing import Any, Dict, List, Tuple

from services.agents.base import Agent, Trace
from services.agents.decision_agent import DecisionAgent
from services.agents.network_agent import NetworkAgent
from services.agents.risk_agent import RiskAgent
from services.agents.visualization import build_visualization_payload


# Intent → (agents instantiated for this run, human description).
def _select_agents(intent: str) -> Tuple[List[Agent], str]:
    if intent == "fraud_prevention":
        return [RiskAgent(), NetworkAgent(primary=True)], "RiskAgent + NetworkAgent (fraud check needs identity + connectivity context)"
    if intent == "onboarding":
        return [RiskAgent()], "RiskAgent only (identity-first onboarding check)"
    if intent == "emergency_response":
        return [NetworkAgent(primary=True)], "NetworkAgent primarily (route emergency over best path)"
    if intent == "mobility":
        return [NetworkAgent(primary=True), RiskAgent(light=True)], "NetworkAgent + light RiskAgent (mobility is reliability-led)"
    if intent == "health":
        return [NetworkAgent(primary=True), RiskAgent(light=True)], "NetworkAgent primarily + light RiskAgent (telehealth reliability + identity)"
    if intent == "agri":
        return [NetworkAgent(primary=False), RiskAgent(light=True)], "NetworkAgent + low-weight RiskAgent (agri pings + light identity)"
    # default fallback
    return [RiskAgent(), NetworkAgent(primary=True)], "Default: RiskAgent + NetworkAgent"


class OrchestratorAgent(Agent):
    name = "OrchestratorAgent"

    def run(
        self,
        context: Dict[str, Any],
        memory: Dict[str, Any],
        trace: Trace,
        api_calls: List[str],
    ) -> Dict[str, Any]:
        intent = context.get("intent") or "fraud_prevention"
        agents, rationale = _select_agents(intent)
        selected_names = [a.name for a in agents]

        trace.add(
            self.name,
            f"Selected {', '.join(selected_names)} based on intent={intent}",
            rationale,
        )

        agent_outputs: Dict[str, Dict[str, Any]] = {}
        for agent in agents:
            agent_outputs[agent.name] = agent.run(context, memory, trace, api_calls)

        decision_agent = DecisionAgent()
        decision = decision_agent.run(
            context,
            memory,
            trace,
            api_calls,
            risk_output=agent_outputs.get("RiskAgent"),
            network_output=agent_outputs.get("NetworkAgent"),
        )

        viz = build_visualization_payload(selected_names, api_calls)

        return {
            "selected_agents": selected_names,
            "agent_rationale": rationale,
            "agent_outputs": agent_outputs,
            "decision": decision,
            "visualization_payload": viz,
        }


def _run_deterministic(context: Dict[str, Any], memory: Dict[str, Any]) -> Dict[str, Any]:
    """Original deterministic pipeline — used as LLM fallback."""
    trace = Trace()
    api_calls: List[str] = []
    out = OrchestratorAgent().run(context, memory, trace, api_calls)
    out["trace"] = trace.to_list()
    out["api_calls"] = list(api_calls)
    return out


def run_agent_pipeline(context: Dict[str, Any], memory: Dict[str, Any]) -> Dict[str, Any]:
    """Runs the LLM-driven agent pipeline with deterministic fallback.

    The deterministic pipeline returns ``decision`` as a nested dict
    (``{"decision": "ALLOW", "confidence": ..., ...}``), but the LLM
    pipeline returns the decision fields flattened at the top level. All
    sync callers (REST, MCP, A2A) expect the nested shape, so we normalise
    here. The streaming pipeline is not affected — it has its own consumers.
    """
    from services.agents.llm_agent import run_llm_pipeline

    result = run_llm_pipeline(context, memory)

    decision = result.get("decision")
    if not isinstance(decision, dict):
        result["decision"] = {
            "decision": decision,
            "confidence": result.get("confidence"),
            "risk_score": result.get("risk_score"),
            "reason": result.get("reason"),
            "memory_influence": result.get("memory_influence"),
            "reasoning_summary": result.get("reasoning_summary"),
        }

    return result
