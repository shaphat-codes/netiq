"""Agent base class + execution trace primitives."""

from typing import Any, Dict, List, Optional


class Trace:
    """Step-numbered execution log shared across agents in a single request."""

    def __init__(self) -> None:
        self.steps: List[Dict[str, Any]] = []

    def add(self, agent: str, action: str, result: Optional[Any] = None) -> None:
        entry: Dict[str, Any] = {
            "step": len(self.steps) + 1,
            "agent": agent,
            "action": action,
        }
        if result is not None:
            entry["result"] = result
        self.steps.append(entry)

    def to_list(self) -> List[Dict[str, Any]]:
        return list(self.steps)


class Agent:
    """All agents implement ``run(context, memory, trace, api_calls)``."""

    name: str = "Agent"

    def run(
        self,
        context: Dict[str, Any],
        memory: Dict[str, Any],
        trace: Trace,
        api_calls: List[str],
    ) -> Dict[str, Any]:
        raise NotImplementedError


def safe_call(api_calls: List[str], name: str, fn, *args, **kwargs) -> Dict[str, Any]:
    """Wrap a CAMARA call, record its name, and convert exceptions to a
    degraded payload so the rest of the pipeline keeps moving."""
    api_calls.append(name)
    try:
        out = fn(*args, **kwargs)
        if not isinstance(out, dict):
            return {"_degraded": True, "_error": "non_dict_response"}
        return out
    except Exception as exc:  # pragma: no cover — defensive
        return {"_degraded": True, "_error": str(exc)}
