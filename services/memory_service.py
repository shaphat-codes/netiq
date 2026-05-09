"""User / subject memory.

Two layers:

1. Legacy single-row `user_profiles` (phone-keyed, account-agnostic) — kept
   for backward compatibility with /analyze.

2. Cross-sector memory stored inside `risk_profiles.profile_json` (account +
   subject-scoped). This is the upgraded model used by /decision/run and
   /agent/run. Per phone we track:

       - global_risk_score (0..100, EMA over time)
       - sector_scores: { finance, mobility, health, emergency, onboarding, agri, ... }
       - events: append-only log of impactful events (SIM_SWAP, DEVICE_SWAP, ...)
       - trust_trajectory: tail of (ts, score) points

   The schema is JSON; no migration needed beyond the existing risk_profiles
   table.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database.db import get_risk_profile, upsert_risk_profile
from services.risk_profile_merge import subject_key_for_phone

EMA_ALPHA = 0.4  # weight of new observation vs. existing memory
MAX_EVENTS = 40
MAX_TRAJECTORY = 30
DEFAULT_SECTOR_SCORE = 0.0

# Intents recognised by the agentic surface (/decision/run, /agent/run).
# Each intent maps to a sector key used for cross-sector memory aggregation.
# When a wallet flags a number under "finance" today, a logistics tenant
# tomorrow sees that score under sector_adjustment["finance"] and weights
# its own decision accordingly — that is the cross-sector memory effect.
INTENT_TO_SECTOR: Dict[str, str] = {
    "fraud_prevention": "finance",
    "onboarding": "onboarding",
    "emergency_response": "emergency",
    "mobility": "mobility",
    "health": "health",
    "agri": "agri",
    "finance": "finance",
    "insurance": "insurance",
    "ecommerce": "ecommerce",
    "logistics": "logistics",
    "education": "education",
    # legacy /analyze intents — kept so memory still merges sensibly:
    "payment": "finance",
    "emergency": "emergency",
}

# How heavily memory is allowed to swing the final decision per intent.
# Safety-first: emergency_response collapses memory weight near zero.
# High-value, identity-sensitive flows (finance, insurance, fraud) lean
# heavily on memory; reliability-led flows (mobility, logistics, agri,
# health) keep memory influence moderate so a noisy past does not block
# a connected user today.
MEMORY_WEIGHT_BY_INTENT: Dict[str, float] = {
    "fraud_prevention": 0.85,
    "finance": 0.85,
    "insurance": 0.75,
    "ecommerce": 0.7,
    "onboarding": 0.65,
    "education": 0.55,
    "mobility": 0.5,
    "logistics": 0.5,
    "health": 0.4,
    "agri": 0.4,
    "emergency_response": 0.1,
    "payment": 0.7,
    "emergency": 0.1,
}


# ---------- cross-sector memory ----------

def _empty_profile() -> Dict[str, Any]:
    return {
        "global_risk_score": 0.0,
        "sector_scores": {},
        "events": [],
        "trust_trajectory": [],
        "decision_count": 0,
        "risk_scores": [],
        "device_fingerprint_history": [],
    }


def get_cross_sector_memory(account_id: Optional[int], phone: str) -> Dict[str, Any]:
    """Return the enhanced memory blob for (account, phone), filling missing
    fields with empties so downstream code never KeyErrors.
    """
    base = _empty_profile()
    if account_id is None:
        return base
    sk = subject_key_for_phone(account_id, phone)
    row = get_risk_profile(account_id, sk)
    if not row or not isinstance(row.get("profile"), dict):
        return base
    prof = dict(row["profile"])
    for k, v in base.items():
        prof.setdefault(k, v)
    return prof


def sector_for_intent(intent: Optional[str]) -> str:
    if not intent:
        return "general"
    return INTENT_TO_SECTOR.get(intent, "general")


def memory_weight_for_intent(intent: Optional[str]) -> float:
    return MEMORY_WEIGHT_BY_INTENT.get(intent or "", 0.5)


def _ema(prev: float, observed: float, alpha: float = EMA_ALPHA) -> float:
    return float(prev) * (1.0 - alpha) + float(observed) * alpha


def write_back_memory(
    account_id: Optional[int],
    phone: str,
    *,
    intent: Optional[str],
    observed_risk: float,
    decision: str,
    new_events: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Merge a fresh observation into the cross-sector memory and persist it.

    Returns the post-update memory blob (useful for response shaping).
    """
    if account_id is None:
        # No tenant scope — return an in-memory snapshot only.
        snap = _empty_profile()
        snap["global_risk_score"] = float(observed_risk)
        snap["sector_scores"][sector_for_intent(intent)] = float(observed_risk)
        return snap

    sk = subject_key_for_phone(account_id, phone)
    row = get_risk_profile(account_id, sk)
    prof = dict(row["profile"]) if row and isinstance(row.get("profile"), dict) else _empty_profile()
    for k, v in _empty_profile().items():
        prof.setdefault(k, v)

    sector = sector_for_intent(intent)
    obs = max(0.0, min(100.0, float(observed_risk)))
    prof["global_risk_score"] = _ema(prof.get("global_risk_score", 0.0), obs)
    sector_scores = dict(prof.get("sector_scores") or {})
    sector_scores[sector] = _ema(sector_scores.get(sector, DEFAULT_SECTOR_SCORE), obs)
    prof["sector_scores"] = sector_scores

    ts = datetime.now(timezone.utc).isoformat()

    events = list(prof.get("events") or [])
    if new_events:
        for ev in new_events:
            entry = dict(ev)
            entry.setdefault("timestamp", ts)
            events.append(entry)
    events.append({"type": f"DECISION_{decision}", "impact": 0, "sector": sector, "timestamp": ts})
    prof["events"] = events[-MAX_EVENTS:]

    traj = list(prof.get("trust_trajectory") or [])
    traj.append({"ts": ts, "score": prof["global_risk_score"], "sector": sector})
    prof["trust_trajectory"] = traj[-MAX_TRAJECTORY:]

    prof["decision_count"] = int(prof.get("decision_count", 0)) + 1

    upsert_risk_profile(account_id, sk, prof)
    return prof


def recent_event_within(memory: Dict[str, Any], event_type: str, max_age_hours: float = 24 * 30) -> bool:
    """True if memory contains an event of `event_type` newer than max_age_hours."""
    cutoff = datetime.now(timezone.utc).timestamp() - max_age_hours * 3600
    for ev in (memory.get("events") or [])[::-1]:
        if ev.get("type") != event_type:
            continue
        ts = ev.get("timestamp")
        try:
            t = datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() if ts else 0
        except Exception:
            t = 0
        if t >= cutoff:
            return True
    return False


def compute_memory_influence(memory: Dict[str, Any], intent: Optional[str]) -> Dict[str, Any]:
    """Build the `memory_influence` block returned to clients."""
    weight = memory_weight_for_intent(intent)
    sector = sector_for_intent(intent)
    sector_scores = memory.get("sector_scores") or {}

    sector_adjustment = {
        s: round(min(1.0, max(0.0, score / 100.0)) * weight, 3)
        for s, score in sector_scores.items()
    }
    return {
        "global_risk_weight": round(weight, 3),
        "global_risk_score": round(float(memory.get("global_risk_score") or 0.0), 2),
        "primary_sector": sector,
        "sector_adjustment": sector_adjustment,
        "events_consulted": [
            {"type": ev.get("type"), "ts": ev.get("timestamp"), "impact": ev.get("impact", 0)}
            for ev in (memory.get("events") or [])[-5:]
        ],
    }
