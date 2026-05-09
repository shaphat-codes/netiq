"""Intent normalization for REST, MCP, A2A, and chat ingress.

Callers can provide any free-form intent text. This module maps it into:
  - primary_intent: one canonical intent used by routing/memory/persistence
  - secondary_intents: optional canonical intents also relevant to reasoning
  - raw_intent: original caller-provided text
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from config import AppConfig

logger = logging.getLogger(__name__)
CONFIG = AppConfig()

CANONICAL_INTENTS: List[str] = [
    "fraud_prevention",
    "onboarding",
    "emergency_response",
    "mobility",
    "agri",
    "health",
    "finance",
    "insurance",
    "ecommerce",
    "logistics",
    "education",
]

DEFAULT_INTENT = "fraud_prevention"

_MAPPER_SYSTEM_PROMPT = """You normalize an arbitrary business intent phrase into NetIQ canonical intents.

Canonical intents:
- fraud_prevention
- onboarding
- emergency_response
- mobility
- agri
- health
- finance
- insurance
- ecommerce
- logistics
- education

Rules:
- Always return exactly one primary_intent from the canonical list.
- Return 0..3 secondary_intents from the canonical list (no duplicates, not equal to primary).
- If input is ambiguous, choose fraud_prevention as primary unless emergency/health reliability is clearly dominant.
- Consider both raw intent and context.
- Return concise reasoning and confidence in [0,1].

Return strict JSON only with this schema:
{
  "primary_intent": "<canonical>",
  "secondary_intents": ["<canonical>", "..."],
  "reasoning": "<short explanation>",
  "confidence": 0.0
}
"""


def normalize_intent(raw_intent: Optional[str], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    raw = (raw_intent or "").strip()
    ctx = context if isinstance(context, dict) else {}

    if not raw:
        return _fallback_result(raw, ctx, reason="empty_intent")

    mapped = _llm_map(raw, ctx)
    if mapped is None:
        mapped = _heuristic_map(raw, ctx)

    primary = mapped.get("primary_intent")
    if primary not in CANONICAL_INTENTS:
        primary = DEFAULT_INTENT

    secondary = [s for s in (mapped.get("secondary_intents") or []) if s in CANONICAL_INTENTS and s != primary]
    deduped_secondary: List[str] = []
    for item in secondary:
        if item not in deduped_secondary:
            deduped_secondary.append(item)

    return {
        "raw_intent": raw,
        "primary_intent": primary,
        "secondary_intents": deduped_secondary[:3],
        "intent_mapping_reasoning": str(mapped.get("reasoning") or ""),
        "intent_mapping_confidence": float(mapped.get("confidence") or 0.0),
        "intent_mapping_source": str(mapped.get("source") or "heuristic"),
    }


def _llm_map(raw: str, context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not CONFIG.OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI  # pylint: disable=import-outside-toplevel
    except ImportError:
        return None

    try:
        client = OpenAI(api_key=CONFIG.OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=CONFIG.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": _MAPPER_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Raw intent: {raw}\n"
                        f"Context: {json.dumps(context, default=str)}"
                    ),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
        )
        parsed = json.loads(response.choices[0].message.content or "{}")
    except Exception as exc:  # pylint: disable=broad-except
        logger.warning("Intent mapper LLM failed, using heuristic: %s", exc)
        return None

    return {
        "primary_intent": parsed.get("primary_intent"),
        "secondary_intents": parsed.get("secondary_intents") or [],
        "reasoning": parsed.get("reasoning") or "",
        "confidence": parsed.get("confidence") or 0.0,
        "source": "llm",
    }


def _heuristic_map(raw: str, _context: Dict[str, Any]) -> Dict[str, Any]:
    text = raw.lower()

    rules = [
        (["emergency", "ambulance", "sos", "urgent help", "rescue"], "emergency_response", ["health"]),
        (["doctor", "clinic", "telemedicine", "patient"], "health", ["emergency_response"]),
        (["ride", "driver", "trip", "transport"], "mobility", ["logistics"]),
        (["deliver", "courier", "shipment", "package"], "logistics", ["mobility"]),
        (["farm", "harvest", "crop", "agri"], "agri", []),
        (["insurance", "claim", "premium", "underwrite"], "insurance", ["finance"]),
        (["checkout", "purchase", "online order", "cart"], "ecommerce", ["fraud_prevention"]),
        (["loan", "credit", "lender", "bank"], "finance", ["fraud_prevention"]),
        (["exam", "school", "tuition", "admission"], "education", ["onboarding"]),
        (["sign up", "register", "open account", "verify identity"], "onboarding", ["fraud_prevention"]),
        (["fraud", "scam", "send money", "transfer", "payment"], "fraud_prevention", ["finance"]),
    ]

    for keywords, primary, secondary in rules:
        if any(k in text for k in keywords):
            return {
                "primary_intent": primary,
                "secondary_intents": secondary,
                "reasoning": "Keyword-based mapping fallback.",
                "confidence": 0.62,
                "source": "heuristic",
            }

    return _fallback_result(raw, _context, reason="ambiguous")


def _fallback_result(raw: str, _context: Dict[str, Any], reason: str) -> Dict[str, Any]:
    return {
        "primary_intent": DEFAULT_INTENT,
        "secondary_intents": [],
        "reasoning": f"Fallback mapping ({reason}).",
        "confidence": 0.4,
        "source": "fallback",
        "raw_intent": raw,
    }
