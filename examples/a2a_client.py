"""Tiny A2A client demo for NetIQ.

Fetches the Agent Card, then sends one ``decide`` task and prints the
returned decision artifact. Useful for showing judges how a peer agent
discovers and invokes NetIQ over the A2A protocol.

Usage::

    pip install requests
    export NETIQ_API_KEY=ntq_...
    export NETIQ_BASE=http://localhost:8080   # optional, defaults to localhost:8080
    python examples/a2a_client.py
"""

import json
import os
import sys
import uuid

try:
    import requests  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover
    sys.stderr.write("Install requests first:  pip install requests\n")
    sys.exit(1)


def main() -> int:
    base = os.getenv("NETIQ_BASE", "http://localhost:8080").rstrip("/")
    api_key = os.getenv("NETIQ_API_KEY", "").strip()
    if not api_key:
        sys.stderr.write("Set NETIQ_API_KEY (create one at /console/keys)\n")
        return 1

    print(f">> discovering NetIQ at {base}")
    card = requests.get(f"{base}/.well-known/agent.json", timeout=10).json()
    print(json.dumps(card, indent=2))
    print()

    skill_ids = [s["id"] for s in card.get("skills", [])]
    if "decide" not in skill_ids:
        sys.stderr.write("Agent Card does not advertise the `decide` skill — aborting.\n")
        return 1

    task_id = f"demo-{uuid.uuid4().hex[:8]}"
    body = {
        "id": task_id,
        "sessionId": f"demo-session-{uuid.uuid4().hex[:6]}",
        "message": {
            "role": "user",
            "parts": [
                {
                    "type": "data",
                    "data": {
                        "skill": "decide",
                        "intent": "fraud_prevention",
                        "phone": "+233241234567",
                        "mode": "agent",
                        "context": {"amount": 500, "compliance_mode": "relaxed"},
                    },
                },
            ],
        },
    }

    print(f">> POST {base}/a2a/tasks/send  (task_id={task_id})")
    r = requests.post(
        f"{base}/a2a/tasks/send",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=60,
    )
    if r.status_code >= 400:
        sys.stderr.write(f"task failed: {r.status_code} {r.text}\n")
        return 2

    payload = r.json()
    print(json.dumps(payload, indent=2))

    artifact = next((a for a in payload.get("artifacts", []) if a.get("name") == "decide"), None)
    if artifact:
        data = artifact["parts"][0].get("data", {})
        print()
        print("---")
        print(f"  Decision    : {data.get('decision')}")
        print(f"  Confidence  : {data.get('confidence')}")
        print(f"  Risk score  : {data.get('risk_score')}")
        print(f"  Reason      : {data.get('reason')}")
        print(f"  Event id    : {data.get('event_id')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
