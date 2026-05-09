"""RiskAgent — fraud / identity signals from CAMARA + memory."""

from typing import Any, Dict, List

from integrations.camara_client import (
    check_device_swap,
    check_number_recycling,
    check_sim_swap,
    check_tenure,
    get_call_forwarding,
    get_roaming_status,
    verify_age,
    verify_kyc_match,
    verify_number,
)
from services.agents.base import Agent, Trace, safe_call
from services.memory_service import recent_event_within


class RiskAgent(Agent):
    name = "RiskAgent"

    def __init__(
        self,
        light: bool = False,
        check_kyc: bool = False,
        check_roaming: bool = False,
        check_call_fwd: bool = False,
        check_tenure_flag: bool = False,
        check_age: bool = False,
        min_age: int = 18,
    ) -> None:
        # `light` skips number verification (used for health / agri).
        self.light = light
        # Extended identity signals (opt-in per intent).
        self.check_kyc = check_kyc
        self.check_roaming = check_roaming
        self.check_call_fwd = check_call_fwd
        self.check_tenure_flag = check_tenure_flag
        self.check_age = check_age
        self.min_age = min_age

    def run(
        self,
        context: Dict[str, Any],
        memory: Dict[str, Any],
        trace: Trace,
        api_calls: List[str],
    ) -> Dict[str, Any]:
        phone = context.get("phone")
        signals: Dict[str, Any] = {}
        risk = 0.0
        reasons: List[str] = []
        memory_events: List[Dict[str, Any]] = []

        # --- Core identity signals ---

        sim = safe_call(api_calls, "sim_swap", check_sim_swap, phone)
        signals["sim_swap"] = sim
        if not sim.get("_degraded") and sim.get("sim_swap_recent"):
            risk += 50
            reasons.append("Recent SIM swap detected")
            memory_events.append({"type": "SIM_SWAP", "impact": 30})

        dswap = safe_call(api_calls, "device_swap", check_device_swap, phone)
        signals["device_swap"] = dswap
        if not dswap.get("_degraded") and dswap.get("device_swap_recent"):
            risk += 35
            reasons.append("Recent device swap detected")
            memory_events.append({"type": "DEVICE_SWAP", "impact": 15})

        if not self.light:
            nv = safe_call(api_calls, "number_verification", verify_number, phone)
            signals["number_verification"] = nv
            if not nv.get("_degraded") and nv.get("verified") is False:
                risk += 15
                reasons.append("Number could not be verified")

        nr = safe_call(api_calls, "number_recycling", check_number_recycling, phone)
        signals["number_recycling"] = nr
        if not nr.get("_degraded") and nr.get("recycled_risk"):
            risk += 20
            reasons.append("Number recycling risk detected")

        # --- Extended identity signals (opt-in) ---

        if self.check_roaming:
            roaming = safe_call(api_calls, "roaming_status", get_roaming_status, phone)
            signals["roaming_status"] = roaming
            if not roaming.get("_degraded") and roaming.get("roaming"):
                risk += 10
                reasons.append("Device is roaming — potential location anomaly")

        if self.check_call_fwd:
            cfwd = safe_call(api_calls, "call_forwarding", get_call_forwarding, phone)
            signals["call_forwarding"] = cfwd
            if not cfwd.get("_degraded") and cfwd.get("active"):
                risk += 25
                reasons.append("Call forwarding active — intercept risk")
                memory_events.append({"type": "CALL_FORWARDING", "impact": 20})

        if self.check_kyc:
            name = (context.get("context") or context).get("name", "")
            id_doc = (context.get("context") or context).get("id_doc", "")
            kyc = safe_call(api_calls, "kyc_match", verify_kyc_match, phone, name, id_doc)
            signals["kyc_match"] = kyc
            if not kyc.get("_degraded") and kyc.get("match") is False:
                risk += 30
                reasons.append("KYC identity mismatch")

        if self.check_tenure_flag:
            tenure = safe_call(api_calls, "tenure", check_tenure, phone)
            signals["tenure"] = tenure
            months = tenure.get("tenure_months") if not tenure.get("_degraded") else None
            if months is not None and months < 3:
                risk += 15
                reasons.append(f"Low tenure: {months} months — new subscriber risk")
            elif months is not None:
                reasons.append(f"Tenure: {months} months")

        if self.check_age:
            age_r = safe_call(api_calls, "age_verify", verify_age, phone, self.min_age)
            signals["age_verify"] = age_r
            if not age_r.get("_degraded") and age_r.get("age_verified") is False:
                risk += 20
                reasons.append(f"Age verification failed (min {self.min_age})")

        # --- Memory-driven amplifiers ---

        if recent_event_within(memory, "SIM_SWAP", max_age_hours=24 * 7):
            risk += 10
            reasons.append("Memory: SIM swap event in last 7 days")
        if recent_event_within(memory, "DEVICE_SWAP", max_age_hours=24 * 14):
            risk += 5
            reasons.append("Memory: device swap event in last 14 days")
        if recent_event_within(memory, "CALL_FORWARDING", max_age_hours=24 * 30):
            risk += 5
            reasons.append("Memory: call forwarding seen in last 30 days")

        global_mem = float(memory.get("global_risk_score") or 0.0)
        if global_mem >= 50:
            reasons.append(f"Memory: elevated cross-sector history ({round(global_mem)})")

        result = {
            "signals": signals,
            "raw_risk": round(min(risk, 100.0), 2),
            "memory_global_risk": round(global_mem, 2),
            "reasons": reasons,
            "memory_events": memory_events,
            "degraded": [k for k, v in signals.items() if isinstance(v, dict) and v.get("_degraded")],
        }
        action = "Checked " + ", ".join(signals.keys()) if signals else "No signals fetched"
        summary = ", ".join(reasons[:3]) if reasons else "No fraud signals triggered"
        trace.add(self.name, action, summary)
        return result
