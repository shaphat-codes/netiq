"""NetworkAgent — connectivity / reliability signals from CAMARA."""

from typing import Any, Dict, List

from integrations.camara_client import (
    get_qos_status,
    get_location,
    check_device_status,
    check_reachability,
)
from services.agents.base import Agent, Trace, safe_call


def _qos_score(quality: str) -> float:
    return {"high": 90.0, "medium": 65.0, "low": 35.0}.get((quality or "").lower(), 50.0)


class NetworkAgent(Agent):
    name = "NetworkAgent"

    def __init__(self, primary: bool = True) -> None:
        # `primary=False` skips reachability to keep call count down for
        # supporting use cases.
        self.primary = primary

    def run(
        self,
        context: Dict[str, Any],
        memory: Dict[str, Any],
        trace: Trace,
        api_calls: List[str],
    ) -> Dict[str, Any]:
        phone = context.get("phone")
        signals: Dict[str, Any] = {}
        reasons: List[str] = []
        reliability = 50.0  # neutral baseline (0..100, higher == more reliable)

        qos = safe_call(api_calls, "qos_status", get_qos_status, phone)
        signals["qos_status"] = qos
        if not qos.get("_degraded"):
            q = qos.get("quality", "medium")
            score = _qos_score(q)
            reliability = score
            reasons.append(f"QoS: {q}")

        loc = safe_call(api_calls, "location", get_location, phone)
        signals["location"] = loc
        requested = context.get("location") or context.get("requested_location")
        if not loc.get("_degraded"):
            if requested and isinstance(requested, dict):
                # Light-weight consistency check: just note it's known.
                reasons.append("Location available")
            else:
                reasons.append("Location available")

        dev = safe_call(api_calls, "device_status", check_device_status, phone)
        signals["device_status"] = dev
        if not dev.get("_degraded") and dev.get("new_device"):
            reliability -= 10
            reasons.append("New device detected — slight reliability penalty")

        if self.primary:
            reach = safe_call(api_calls, "reachability", check_reachability, phone)
            signals["reachability"] = reach
            if not reach.get("_degraded"):
                if reach.get("reachable") is False:
                    reliability -= 25
                    reasons.append("Subject unreachable")
                else:
                    reasons.append("Subject reachable")

        reliability = max(0.0, min(100.0, reliability))

        result = {
            "signals": signals,
            "reliability_score": round(reliability, 2),
            "reasons": reasons,
            "degraded": [k for k, v in signals.items() if isinstance(v, dict) and v.get("_degraded")],
        }
        action = "Checked " + ", ".join(signals.keys()) if signals else "No signals fetched"
        summary = ", ".join(reasons[:3]) if reasons else "No notable network conditions"
        trace.add(self.name, action, summary)
        return result
