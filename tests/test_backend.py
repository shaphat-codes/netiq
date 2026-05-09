import json


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.get_json()["status"] == "ok"


def test_openapi(client):
    r = client.get("/api/v1/openapi.json")
    assert r.status_code == 200
    d = r.get_json()
    assert d["openapi"] == "3.0.3"
    assert "/decision/run" in d["paths"]
    assert "/agent/run" in d["paths"]
    assert "/analyze" not in d["paths"]


def test_register_login_keys_decision_run(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "t@example.com", "password": "password12", "account_name": "T"},
    )
    assert r.status_code == 201
    acc = r.get_json()["account_id"]

    r = client.post(
        "/api/v1/auth/login",
        json={"email": "t@example.com", "password": "password12"},
    )
    assert r.status_code == 200

    r = client.post("/api/v1/keys", json={"name": "k1"})
    assert r.status_code == 201
    key = r.get_json()["api_key"]
    assert key.startswith("netiq_")

    payload = {
        "intent": "fraud_prevention",
        "phone": "+9999999100",
        "mode": "agent",
        "context": {},
    }
    r = client.post(
        "/decision/run",
        data=json.dumps(payload),
        content_type="application/json",
        headers={"Authorization": f"Bearer {key}"},
    )
    assert r.status_code == 200, r.get_data(as_text=True)
    body = r.get_json()
    assert "decision" in body
    assert "trace" in body
    assert "memory_influence" in body
    assert "selected_agents" in body
    assert body["mode"] == "agent"

    r = client.get("/api/v1/events")
    assert r.status_code == 200
    evs = r.get_json()["events"]
    assert len(evs) >= 1
    assert evs[0]["account_id"] == acc


def test_agent_run_shortcut(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "ar@example.com", "password": "password12"},
    )
    r = client.post("/api/v1/keys", json={"name": "k"})
    key = r.get_json()["api_key"]
    r = client.post(
        "/agent/run",
        json={"intent": "emergency_response", "phone": "+9999999107", "context": {}},
        headers={"Authorization": f"Bearer {key}"},
    )
    assert r.status_code == 200
    body = r.get_json()
    assert body["decision"] in ("ALLOW", "PRIORITIZE")
    assert body["mode"] == "agent"
    assert "NetworkAgent" in body.get("selected_agents", [])


def test_policy_mode(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "pm@example.com", "password": "password12"},
    )
    r = client.post("/api/v1/keys", json={"name": "k"})
    key = r.get_json()["api_key"]
    r = client.post(
        "/decision/run",
        json={"intent": "onboarding", "phone": "+9999999105", "mode": "policy", "context": {}},
        headers={"Authorization": f"Bearer {key}"},
    )
    assert r.status_code == 200
    body = r.get_json()
    assert body["mode"] == "policy"
    assert "decision" in body
    assert "policy_applied" in body


def test_invalid_intent_rejected(client):
    r = client.post(
        "/decision/run",
        json={"intent": "payment", "phone": "+1", "mode": "agent"},
    )
    assert r.status_code == 400
    assert "intent" in str(r.get_json().get("errors", ""))


def test_metrics_and_policy(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "m@example.com", "password": "password12"},
    )
    key = client.post("/api/v1/keys", json={"name": "k"}).get_json()["api_key"]
    client.post(
        "/decision/run",
        json={"intent": "fraud_prevention", "phone": "+9999999100", "mode": "agent", "context": {}},
        headers={"Authorization": f"Bearer {key}"},
    )
    r = client.get("/api/v1/metrics/summary?days=30")
    assert r.status_code == 200
    assert "total_requests" in r.get_json()

    pol = {
        "version": "1",
        "content": {
            "rules": [
                {
                    "id": "always_verify",
                    "when": {"intent": "onboarding", "all": []},
                    "then": {"decision": "VERIFY", "append_reason": "policy test"},
                }
            ]
        },
    }
    r = client.put("/api/v1/policies/active", json=pol)
    assert r.status_code == 200
    r = client.get("/api/v1/policies/active")
    assert r.get_json()["policy"]["content"]["rules"][0]["id"] == "always_verify"
