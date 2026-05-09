"""Tenant policy evaluation: first matching rule wins."""

from typing import Any, Dict, List, Optional, Tuple


def _match_conditions(
    facts: Dict[str, Any],
    when: Dict[str, Any],
    intent: Optional[str],
) -> bool:
    """Support: { "intent": "payment", "all": [ {"fact": "sim_swap_recent", "eq": true}, ... ] }"""
    if intent and when.get("intent") and when["intent"] != intent:
        return False
    all_conds = when.get("all") or when.get("conditions") or []
    for cond in all_conds:
        if not isinstance(cond, dict):
            continue
        key = cond.get("fact")
        if not key:
            continue
        want = cond.get("eq")
        op = cond.get("op", "eq")
        got = facts.get(key)
        if op == "eq" and got != want:
            return False
        if op == "gte" and not (isinstance(got, (int, float)) and got >= float(want)):
            return False
        if op == "lte" and not (isinstance(got, (int, float)) and got <= float(want)):
            return False
    return True


def evaluate_tenant_policy(
    facts: Dict[str, Any],
    base_decision: Dict[str, Any],
    policy_content: Optional[Dict[str, Any]],
    compliance_mode: str,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Returns (merged_decision, trace) where trace includes policy_rule_id or default.
    """
    intent = facts.get("intent")
    trace: Dict[str, Any] = {
        "steps": [{"step": "base_decision", "result": {k: base_decision[k] for k in ("decision", "risk_score") if k in base_decision}}],
        "policy_rule_id": None,
        "policy_source": "platform_default",
    }

    if not policy_content or not isinstance(policy_content, dict):
        out = _apply_strict_escalation(base_decision, facts, compliance_mode, trace)
        return out, trace

    rules: List[Dict[str, Any]] = policy_content.get("rules") or policy_content.get("policy", [])
    if isinstance(rules, dict):
        rules = [rules]  # tolerate single rule object

    for rule in rules:
        if not isinstance(rule, dict):
            continue
        rid = rule.get("id", "unnamed")
        when = rule.get("when") or rule.get("if")
        if when is None:
            continue
        if isinstance(when, list):
            when = {"all": [{"fact": x, "eq": True} for x in when if isinstance(x, str)]}
        if _match_conditions(facts, when, intent):
            then = rule.get("then") or {}
            merged = dict(base_decision)
            if "decision" in then:
                merged["decision"] = str(then["decision"])
            if "risk_score" in then:
                merged["risk_score"] = float(then["risk_score"])
            if "confidence" in then:
                merged["confidence"] = float(then["confidence"])
            reason_add = then.get("append_reason") or then.get("reason")
            if reason_add:
                merged["reason"] = f"{merged.get('reason', '')}; Policy rule {rid}: {reason_add}".strip("; ")
            trace["policy_rule_id"] = rid
            trace["policy_source"] = "tenant"
            trace["steps"].append({"step": "tenant_rule", "rule_id": rid, "result": merged["decision"]})
            out = _apply_strict_escalation(merged, facts, compliance_mode, trace)
            return out, trace

    out = _apply_strict_escalation(base_decision, facts, compliance_mode, trace)
    return out, trace


def _apply_strict_escalation(
    decision: Dict[str, Any],
    facts: Dict[str, Any],
    compliance_mode: str,
    trace: Dict[str, Any],
) -> Dict[str, Any]:
    if compliance_mode != "strict":
        return decision
    if facts.get("degraded_any"):
        d = dict(decision)
        if d.get("decision") == "ALLOW":
            d["decision"] = "OTP"
            d["reason"] = (d.get("reason") or "") + "; Strict mode: elevated due to degraded signals"
            trace["steps"].append({"step": "strict_escalation", "result": "OTP"})
        return d
    return decision


def default_policy_template() -> Dict[str, Any]:
    return {
        "version": "1",
        "rules": [
            {
                "id": "example_block_sim_and_device",
                "when": {
                    "intent": "payment",
                    "all": [
                        {"fact": "sim_swap_recent", "eq": True},
                        {"fact": "new_device", "eq": True},
                    ],
                },
                "then": {"decision": "BLOCK", "append_reason": "SIM and new device"},
            }
        ],
    }
