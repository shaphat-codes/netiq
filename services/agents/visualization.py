"""Frontend visualization payload — nodes/edges describing the agent flow.

The simulator UI animates this graph. We keep it static-ish per selected
agents so the demo is predictable.
"""

from typing import Any, Dict, List


def build_visualization_payload(selected_agents: List[str], api_calls: List[str]) -> Dict[str, Any]:
    nodes = ["User", "OrchestratorAgent"]
    edges = [{"from": "User", "to": "OrchestratorAgent", "label": "intent"}]

    for agent in selected_agents:
        if agent in nodes:
            continue
        nodes.append(agent)
        edges.append({"from": "OrchestratorAgent", "to": agent, "label": "dispatch"})

    if api_calls:
        nodes.append("CAMARA APIs")
        for agent in selected_agents:
            edges.append({"from": agent, "to": "CAMARA APIs", "label": "fetch"})

    nodes.append("DecisionAgent")
    for agent in selected_agents:
        edges.append({"from": agent, "to": "DecisionAgent", "label": "report"})

    nodes.append("Output")
    edges.append({"from": "DecisionAgent", "to": "Output", "label": "decision"})

    return {
        "nodes": nodes,
        "edges": edges,
        "api_calls": list(api_calls),
    }
