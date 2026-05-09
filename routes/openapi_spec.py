"""OpenAPI 3.0 document for NetIQ (served at /api/v1/openapi.json)."""

VALID_INTENTS = [
    "fraud_prevention",
    "onboarding",
    "emergency_response",
    "mobility",
    "health",
    "agri",
    "finance",
    "insurance",
    "ecommerce",
    "logistics",
    "education",
]

SPEC = {
    "openapi": "3.0.3",
    "info": {
        "title": "NetIQ API",
        "version": "2.0.0",
        "description": (
            "NetIQ is a horizontal trust-and-decision orchestration layer over Nokia "
            "Network as Code / GSMA CAMARA telco APIs. One request — "
            "`{phone, intent, context}` — returns a structured decision "
            "(ALLOW | VERIFY | BLOCK | PRIORITIZE | DEGRADE) with confidence, "
            "reason, execution trace, and cross-sector phone-number memory. "
            "Eleven intents ship today — fraud_prevention, onboarding, "
            "emergency_response, mobility, health, agri, finance, insurance, "
            "ecommerce, logistics, education — exposed via REST, MCP and A2A. "
            "Authenticate with a Bearer API key on /decision/run and /agent/run."
        ),
    },
    "servers": [{"url": "/", "description": "Current host"}],
    "tags": [
        {"name": "Decision", "description": "Dual-mode decision engine"},
        {"name": "Portal", "description": "Session-based console API"},
    ],
    "paths": {
        "/health": {
            "get": {
                "summary": "Health check",
                "responses": {"200": {"description": "OK"}},
            }
        },
        "/decision/run": {
            "post": {
                "tags": ["Decision"],
                "summary": "Unified decision endpoint (policy or agent mode)",
                "description": (
                    "Select `mode=policy` for deterministic tenant-rule-based decisions, "
                    "or `mode=agent` for dynamic CAMARA-signal orchestration by specialized agents."
                ),
                "security": [{"ApiKeyAuth": []}],
                "parameters": [
                    {
                        "name": "Authorization",
                        "in": "header",
                        "schema": {"type": "string"},
                        "description": "Bearer <api_key>",
                        "required": True,
                    }
                ],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["intent", "phone", "mode"],
                                "properties": {
                                    "intent": {
                                        "type": "string",
                                        "description": (
                                            "Free-form business intent phrase. NetIQ maps this to one or more "
                                            "canonical intents internally before routing."
                                        ),
                                    },
                                    "phone": {
                                        "type": "string",
                                        "description": "E.164 phone number, e.g. +233xxxxxxxxx",
                                    },
                                    "mode": {
                                        "type": "string",
                                        "enum": ["policy", "agent"],
                                        "description": "policy = deterministic rules; agent = dynamic agent dispatch.",
                                    },
                                    "context": {
                                        "type": "object",
                                        "description": "Optional intent-specific payload.",
                                        "properties": {
                                            "amount": {"type": "number"},
                                            "raw_intent": {"type": "string"},
                                            "secondary_intents": {
                                                "type": "array",
                                                "items": {"type": "string", "enum": VALID_INTENTS},
                                            },
                                            "location": {
                                                "type": "object",
                                                "properties": {
                                                    "lat": {"type": "number"},
                                                    "lng": {"type": "number"},
                                                },
                                            },
                                            "device_info": {"type": "string"},
                                            "compliance_mode": {
                                                "type": "string",
                                                "enum": ["strict", "relaxed"],
                                            },
                                        },
                                    },
                                },
                            },
                            "examples": {
                                "fraud_agent": {
                                    "summary": "Fraud prevention — agent mode",
                                    "value": {
                                        "intent": "fraud_prevention",
                                        "phone": "+233201234567",
                                        "mode": "agent",
                                        "context": {"amount": 500},
                                    },
                                },
                                "onboarding_policy": {
                                    "summary": "Onboarding — policy mode",
                                    "value": {
                                        "intent": "onboarding",
                                        "phone": "+233201234567",
                                        "mode": "policy",
                                        "context": {},
                                    },
                                },
                                "emergency": {
                                    "summary": "Emergency response — agent mode",
                                    "value": {
                                        "intent": "emergency_response",
                                        "phone": "+233201234567",
                                        "mode": "agent",
                                        "context": {},
                                    },
                                },
                            },
                        }
                    },
                },
                "responses": {
                    "200": {
                        "description": "Decision result",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "mode": {"type": "string"},
                                        "intent": {"type": "string"},
                                        "decision": {
                                            "type": "string",
                                            "enum": ["ALLOW", "VERIFY", "BLOCK", "PRIORITIZE", "DEGRADE"],
                                        },
                                        "confidence": {"type": "number"},
                                        "risk_score": {"type": "number"},
                                        "reason": {"type": "string"},
                                        "reasoning_summary": {"type": "string"},
                                        "selected_agents": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                        "api_calls": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                        "memory_influence": {
                                            "type": "object",
                                            "properties": {
                                                "global_risk_weight": {"type": "number"},
                                                "global_risk_score": {"type": "number"},
                                                "primary_sector": {"type": "string"},
                                                "sector_adjustment": {"type": "object"},
                                                "events_consulted": {"type": "array"},
                                            },
                                        },
                                        "trace": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "properties": {
                                                    "step": {"type": "integer"},
                                                    "agent": {"type": "string"},
                                                    "action": {"type": "string"},
                                                    "result": {"type": "string"},
                                                },
                                            },
                                        },
                                        "visualization_payload": {
                                            "type": "object",
                                            "properties": {
                                                "nodes": {"type": "array", "items": {"type": "string"}},
                                                "edges": {"type": "array"},
                                                "api_calls": {"type": "array", "items": {"type": "string"}},
                                            },
                                        },
                                        "policy_applied": {"type": "object"},
                                        "duration_ms": {"type": "number"},
                                    },
                                }
                            }
                        },
                    },
                    "400": {"description": "Validation error"},
                    "401": {"description": "Missing or invalid API key"},
                    "429": {"description": "Rate limited"},
                },
            }
        },
        "/agent/run": {
            "post": {
                "tags": ["Decision"],
                "summary": "Agent-mode shortcut (always mode=agent)",
                "description": "Identical to POST /decision/run with mode=agent. No mode field required.",
                "security": [{"ApiKeyAuth": []}],
                "parameters": [
                    {
                        "name": "Authorization",
                        "in": "header",
                        "schema": {"type": "string"},
                        "description": "Bearer <api_key>",
                        "required": True,
                    }
                ],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["intent", "phone"],
                                "properties": {
                                    "intent": {
                                        "type": "string",
                                        "description": "Free-form business intent phrase.",
                                    },
                                    "phone": {"type": "string"},
                                    "context": {"type": "object"},
                                },
                            }
                        }
                    },
                },
                "responses": {
                    "200": {"description": "Decision result (same shape as /decision/run)"},
                    "400": {"description": "Validation error"},
                    "401": {"description": "Missing or invalid API key"},
                    "429": {"description": "Rate limited"},
                },
            }
        },
        "/api/v1/auth/demo": {
            "post": {
                "tags": ["Portal"],
                "summary": "Demo login (shared workspace; requires DEMO_OPEN_LOGIN)",
                "responses": {"200": {"description": "Session cookie set"}},
            }
        },
        "/api/v1/auth/register": {
            "post": {
                "tags": ["Portal"],
                "summary": "Register account",
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "email": {"type": "string"},
                                    "password": {"type": "string"},
                                    "account_name": {"type": "string"},
                                },
                            }
                        }
                    }
                },
                "responses": {"201": {"description": "Created"}},
            }
        },
        "/api/v1/auth/login": {
            "post": {
                "tags": ["Portal"],
                "summary": "Login (sets session cookie)",
                "responses": {"200": {"description": "OK"}},
            }
        },
        "/api/v1/keys": {
            "get": {"tags": ["Portal"], "summary": "List API keys"},
            "post": {"tags": ["Portal"], "summary": "Create API key"},
        },
        "/api/v1/policies": {
            "get": {"tags": ["Portal"], "summary": "Get active tenant policy"},
            "put": {"tags": ["Portal"], "summary": "Save / update tenant policy"},
        },
        "/api/v1/events": {
            "get": {"tags": ["Portal"], "summary": "List recent decision events"},
        },
        "/api/v1/metrics/summary": {
            "get": {"tags": ["Portal"], "summary": "Aggregated metrics for the last N days"},
        },
    },
    "components": {
        "securitySchemes": {
            "ApiKeyAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "netiq_...",
            }
        }
    },
}
