"""Normalize orchestration context + signals + memory into flat facts for tenant policies."""

from typing import Any, Dict, Optional


def build_facts(
    context: Dict[str, Any],
    signals: Dict[str, Any],
    memory: Optional[Dict[str, Any]],
    risk_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    degraded_any = any(isinstance(v, dict) and v.get("_degraded") for v in signals.values())

    sim = signals.get("sim_swap") or {}
    dswap = signals.get("device_swap") or {}
    ds = signals.get("device_status") or {}
    lv = signals.get("location_verification") or {}
    nv = signals.get("number_verification") or {}
    nr = signals.get("number_recycling") or {}
    consent = signals.get("consent") or {}
    roaming = signals.get("roaming_status") or {}
    cfwd = signals.get("call_forwarding") or {}
    kyc = signals.get("kyc_match") or {}
    tenure = signals.get("tenure") or {}
    age_r = signals.get("age_verify") or {}

    facts: Dict[str, Any] = {
        "intent": context.get("intent"),
        "degraded_any": degraded_any,
        # --- core signals ---
        "sim_swap_recent": bool(not sim.get("_degraded") and sim.get("sim_swap_recent")),
        "device_swap_recent": bool(not dswap.get("_degraded") and dswap.get("device_swap_recent")),
        "new_device": bool(not ds.get("_degraded") and ds.get("new_device")),
        "location_matches": True if lv.get("_degraded") else bool(lv.get("location_matches", True)),
        "number_verified": True if nv.get("_degraded") else bool(nv.get("verified", True)),
        "recycled_risk": bool(not nr.get("_degraded") and nr.get("recycled_risk")),
        "consent_granted": True if consent.get("_degraded") else bool(consent.get("consent_granted", True)),
        # --- extended identity signals ---
        "is_roaming": bool(not roaming.get("_degraded") and roaming.get("roaming")),
        "call_forwarding_active": bool(not cfwd.get("_degraded") and cfwd.get("active")),
        "kyc_match": True if kyc.get("_degraded") else bool(kyc.get("match", True)),
        "tenure_months": int(tenure.get("tenure_months") or 0) if not tenure.get("_degraded") else None,
        "low_tenure": bool(not tenure.get("_degraded") and (tenure.get("tenure_months") or 999) < 3),
        "age_verified": True if age_r.get("_degraded") else bool(age_r.get("age_verified", True)),
    }

    amt = context.get("amount")
    try:
        facts["amount"] = float(amt) if amt is not None else None
    except (TypeError, ValueError):
        facts["amount"] = None
    band = (context.get("amount_band") or "").lower()
    facts["amount_band_high"] = band in ("high", "large", "xl") or (facts["amount"] is not None and facts["amount"] >= 5000)

    mem = memory or {}
    facts["previous_risk"] = float(mem.get("previous_risk") or 0.0)

    rp = risk_profile or {}
    prof = rp.get("profile") if isinstance(rp, dict) and "profile" in rp else rp
    if isinstance(prof, dict):
        facts["profile_decision_count"] = int(prof.get("decision_count", 0))
        facts["velocity_spike"] = bool(prof.get("velocity_spike", False))
    else:
        facts["profile_decision_count"] = 0
        facts["velocity_spike"] = False

    return facts


def apply_fallback_facts(facts: Dict[str, Any], signals: Dict[str, Any]) -> Dict[str, Any]:
    """Mark unknown when signal was degraded (for strict mode evaluation)."""
    out = dict(facts)
    for name, payload in signals.items():
        if isinstance(payload, dict) and payload.get("_degraded"):
            out[f"{name}_unknown"] = True
    return out
