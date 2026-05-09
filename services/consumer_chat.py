"""Consumer chat helpers for the public ChatGPT-style experience.

Two LLM passes wrap the existing decision pipeline:

1. ``extract_intent_and_context`` — turns the user's free-text prose (plus
   prior turns of conversation history) into a structured
   ``{intent, phone, context, clarification_needed}`` payload that
   ``run_llm_pipeline_stream`` already understands.

2. ``frame_consumer_answer_stream`` — turns the structured decision back
   into a friendly natural-language explanation, streamed token-by-token
   so the chat UI can type it out like ChatGPT.

Both fall back gracefully if OpenAI is unavailable so the pipeline never
hard-fails on a missing key — the caller can surface a degraded message.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Iterator, List, Optional, Tuple

from config import AppConfig

logger = logging.getLogger(__name__)
CONFIG = AppConfig()

VALID_INTENTS = [
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

_EXTRACT_SYSTEM_PROMPT = f"""You are a routing layer that converts a consumer's plain-English question into a structured decision request for the NetIQ network-trust API.

Pick exactly one intent from this list, defaulting to fraud_prevention if the user's message is ambiguous or generic:
{", ".join(VALID_INTENTS)}

Rough mapping guide (use it, but reason from the user's words):
- "send money", "pay", "transfer", "mobile money", "fraud", "scam"            -> fraud_prevention
- "sign up", "register", "open account", "create account", "verify identity" -> onboarding
- "emergency", "ambulance", "urgent help", "SOS", "rescue"                   -> emergency_response
- "ride", "driver", "trip", "transport"                                       -> mobility
- "deliver", "courier", "shipment", "logistics", "package"                   -> logistics
- "telemedicine", "doctor", "patient", "clinic"                              -> health
- "farm", "harvest", "crop", "agri"                                          -> agri
- "insurance", "claim", "policy", "premium"                                  -> insurance
- "checkout", "purchase", "online order", "ecommerce"                        -> ecommerce
- "loan", "credit", "lender", "bank account"                                 -> finance
- "exam", "school", "tuition"                                                -> education

If the user mentions an amount (any currency), extract it as a number into context.amount.
If the user mentions a city, region or coordinates, capture it in context.location as a short string.
If they mention a device or browser, capture it in context.device_info.

PHONE NUMBER RULES (important):
- Pull the phone number directly from the user's message. Accept any common format: "+233241234567", "0241234567", "+233 24 123 4567", "233-24-123-4567" — always normalise to E.164 (leading "+" then country code, no spaces or dashes).
- If the user does not include a phone in this message, fall back to the most recent phone found in the conversation history (carry it forward across follow-ups).
- If you genuinely cannot find a phone anywhere, return phone="" AND set clarification_needed to a short polite ask like "Could you include the phone number — e.g. +233241234567?".

Always return a strict JSON object matching this schema and NOTHING else:
{{
  "intent": "<one of the intents above>",
  "phone": "<E.164 phone, or empty string if you genuinely cannot find one>",
  "context": {{ ... only the fields you actually inferred ... }},
  "clarification_needed": "<empty string, or one short sentence asking the user for the missing info>"
}}

Use the conversation history to disambiguate follow-up questions. For example, if the user previously asked about sending money to a number and now says "what about 500 instead?", keep the same intent and phone, only update context.amount.
"""

_FRAME_SYSTEM_PROMPT = """You are NetIQ's friendly recommendation assistant. The system has just made a network-aware risk decision. Your job is to explain it to the consumer in 2-4 plain-English sentences.

Rules:
- Speak directly to the user as "you" or "I'd".
- Lead with the recommendation (Allow / Hold off / Verify / Don't proceed) BEFORE the technical reason.
- Translate decisions into normal language:
    ALLOW      -> "go ahead", "proceed", "looks safe"
    VERIFY     -> "verify with an extra step", "confirm via OTP / call them on a known number"
    BLOCK      -> "don't proceed", "hold off", "this looks risky"
    PRIORITIZE -> "this should be routed urgently"
    DEGRADE    -> "the network looks weak — fall back to a simpler experience"
- If a SIM swap, device swap, low tenure, or KYC mismatch is in the reason, mention it in plain words.
- NEVER use internal jargon: no "DecisionAgent", "RiskAgent", "EMA", "memory weight", "policy_applied", percentages of confidence, or raw signal names.
- NEVER expose phone numbers other than the one the user already gave you.
- Keep it warm and brief. No bullet lists. No headers. Just sentences.
"""


# ─── Intent extraction ──────────────────────────────────────────────────────

def extract_intent_and_context(
    prompt: str,
    history: Optional[List[Dict[str, str]]] = None,
    default_phone: str = "",
) -> Dict[str, Any]:
    """Convert free-text prose + chat history into a structured decision request."""

    history = history or []
    fallback = _heuristic_extract(prompt, default_phone)

    if not CONFIG.OPENAI_API_KEY:
        return fallback

    try:
        from openai import OpenAI  # pylint: disable=import-outside-toplevel
    except ImportError:
        return fallback

    history_text = _format_history(history, limit=6)
    user_message = (
        f"Phone carried from earlier in this conversation (if any): {default_phone or '(none)'}\n"
        f"Conversation so far:\n{history_text or '(this is the first turn)'}\n\n"
        f"Latest user message:\n{prompt.strip()[:1500]}"
    )

    try:
        client = OpenAI(api_key=CONFIG.OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=CONFIG.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": _EXTRACT_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
        )
        raw = response.choices[0].message.content or "{}"
        parsed = json.loads(raw)
    except Exception as exc:  # pylint: disable=broad-except
        logger.warning("Consumer chat extractor failed, using heuristic: %s", exc)
        return fallback

    intent = str(parsed.get("intent") or DEFAULT_INTENT).strip()
    if intent not in VALID_INTENTS:
        intent = DEFAULT_INTENT

    phone = str(parsed.get("phone") or "").strip() or default_phone
    context = parsed.get("context") if isinstance(parsed.get("context"), dict) else {}
    clarification = str(parsed.get("clarification_needed") or "").strip()

    return {
        "intent": intent,
        "phone": phone,
        "context": context,
        "clarification_needed": clarification,
    }


# ─── Answer framing (streaming) ─────────────────────────────────────────────

def frame_consumer_answer_stream(
    decision: Dict[str, Any],
    prompt: str,
) -> Iterator[str]:
    """Yield text chunks of the friendly natural-language answer.

    Falls back to a deterministic template if OpenAI is unavailable so the
    consumer always gets *something*.
    """

    if not CONFIG.OPENAI_API_KEY:
        yield _template_answer(decision)
        return

    try:
        from openai import OpenAI  # pylint: disable=import-outside-toplevel
    except ImportError:
        yield _template_answer(decision)
        return

    try:
        client = OpenAI(api_key=CONFIG.OPENAI_API_KEY)
        decision_brief = _decision_brief(decision)
        user_message = (
            f"User asked: {prompt.strip()[:600]}\n\n"
            f"Decision summary the system produced:\n{decision_brief}\n\n"
            "Write the friendly explanation now."
        )
        stream = client.chat.completions.create(
            model=CONFIG.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": _FRAME_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.4,
            stream=True,
        )
        for chunk in stream:
            try:
                delta = chunk.choices[0].delta.content  # type: ignore[union-attr]
            except Exception:  # pylint: disable=broad-except
                delta = None
            if delta:
                yield delta
    except Exception as exc:  # pylint: disable=broad-except
        logger.warning("Consumer chat framer failed, using template: %s", exc)
        yield _template_answer(decision)


# ─── Helpers ────────────────────────────────────────────────────────────────


_PHONE_RX = re.compile(r"\+?\d[\d\s\-]{6,}")


def _heuristic_extract(prompt: str, default_phone: str) -> Dict[str, Any]:
    """Used when OpenAI is unavailable. Picks an intent by keyword and grabs an amount."""
    text = (prompt or "").lower()
    intent = DEFAULT_INTENT
    keyword_map: List[Tuple[str, str]] = [
        ("emergency", "emergency_response"),
        ("ambulance", "emergency_response"),
        ("sos", "emergency_response"),
        ("urgent help", "emergency_response"),
        ("deliver", "logistics"),
        ("courier", "logistics"),
        ("shipment", "logistics"),
        ("ride", "mobility"),
        ("driver", "mobility"),
        ("trip", "mobility"),
        ("doctor", "health"),
        ("clinic", "health"),
        ("telemedicine", "health"),
        ("farm", "agri"),
        ("harvest", "agri"),
        ("insurance", "insurance"),
        ("claim", "insurance"),
        ("checkout", "ecommerce"),
        ("order", "ecommerce"),
        ("loan", "finance"),
        ("credit", "finance"),
        ("school", "education"),
        ("exam", "education"),
        ("tuition", "education"),
        ("sign up", "onboarding"),
        ("register", "onboarding"),
        ("open account", "onboarding"),
        ("send money", "fraud_prevention"),
        ("transfer", "fraud_prevention"),
        ("pay", "fraud_prevention"),
        ("scam", "fraud_prevention"),
        ("fraud", "fraud_prevention"),
    ]
    for keyword, mapped in keyword_map:
        if keyword in text:
            intent = mapped
            break

    amount_match = re.search(r"(\d{2,7})(?:\s*(?:ghs|kes|ngn|usd|eur|gbp|£|\$|€)?)", text)
    context: Dict[str, Any] = {}
    if amount_match:
        try:
            context["amount"] = int(amount_match.group(1))
        except ValueError:
            pass

    phone = default_phone
    if not phone:
        m = _PHONE_RX.search(prompt or "")
        if m:
            phone = re.sub(r"[\s\-]", "", m.group(0))

    return {
        "intent": intent,
        "phone": phone,
        "context": context,
        "clarification_needed": "",
    }


def _format_history(history: List[Dict[str, str]], *, limit: int) -> str:
    rows: List[str] = []
    for item in history[-limit:]:
        role = (item.get("role") or "user").strip().lower()
        content = (item.get("content") or "").strip()
        if not content:
            continue
        prefix = "User" if role == "user" else "Assistant"
        rows.append(f"{prefix}: {content[:400]}")
    return "\n".join(rows)


def _decision_brief(decision: Dict[str, Any]) -> str:
    fields = {
        "decision": decision.get("decision"),
        "risk_score": decision.get("risk_score"),
        "confidence": decision.get("confidence"),
        "reason": decision.get("reason"),
        "reasoning_summary": decision.get("reasoning_summary"),
    }
    return json.dumps({k: v for k, v in fields.items() if v not in (None, "")}, default=str, indent=2)


def _template_answer(decision: Dict[str, Any]) -> str:
    """Deterministic fallback answer when OpenAI is unreachable."""
    d = (decision.get("decision") or "VERIFY").upper()
    reason = decision.get("reason") or "I couldn't gather a strong signal either way."
    intro = {
        "ALLOW": "Looks safe to proceed.",
        "VERIFY": "I'd verify with an extra step before proceeding.",
        "BLOCK": "I'd hold off — this looks risky.",
        "PRIORITIZE": "This should be routed urgently.",
        "DEGRADE": "The network looks weak — consider a simpler fallback path.",
    }.get(d, "Here's what I found.")
    return f"{intro} {reason}".strip()
