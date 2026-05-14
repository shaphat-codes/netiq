"""Agentic decision system for NetIQ.

Agent mode uses an LLM (GPT-4o-mini) as the reasoning core via OpenAI
function/tool calling. The LLM dynamically selects which CAMARA signals to
fetch based on the intent, then calls `make_decision` when it has enough
information. A deterministic fallback runs if the LLM is unavailable.

Policy mode evaluates the tenant's saved JSON rules against the collected
signals and applies a memory overlay.
"""

from services.agents.base import Agent, Trace
from services.agents.risk_agent import RiskAgent
from services.agents.network_agent import NetworkAgent
from services.agents.decision_agent import DecisionAgent
from services.agents.orchestrator_agent import (
    OrchestratorAgent,
    run_agent_pipeline,
    run_deterministic_pipeline,
    _run_deterministic,
)
from services.agents.llm_agent import run_llm_pipeline
from services.agents.policy_mode import run_policy_pipeline
from services.agents.visualization import build_visualization_payload

__all__ = [
    "Agent",
    "Trace",
    "RiskAgent",
    "NetworkAgent",
    "DecisionAgent",
    "OrchestratorAgent",
    "run_agent_pipeline",
    "run_deterministic_pipeline",
    "run_llm_pipeline",
    "_run_deterministic",
    "run_policy_pipeline",
    "build_visualization_payload",
]
