/**
 * Shared types for the four demo sector apps.
 *
 * These types describe the contract between the demo UI and the
 * `/api/netiq/*` Next Route Handlers, which in turn proxy to the
 * Flask backend's `/decision/run` endpoint.
 */

export type DecisionValue =
  | "ALLOW"
  | "VERIFY"
  | "BLOCK"
  | "PRIORITIZE"
  | "DEGRADE"
  | "OTP";

export type DecisionMode = "agent" | "policy";

export type ContextPayload = {
  amount?: number;
  amount_band?: "low" | "mid" | "high";
  consent_reference?: string;
  location?: { lat: number; lng: number };
  verification_radius_m?: number;
  claimed_identity?: { name?: string; dob?: string; id_doc?: string };
  device_info?: string;
  compliance_mode?: "strict" | "relaxed";
  // Free-form extras for sector-specific narrative metadata that the
  // backend simply echoes / ignores.
  [k: string]: unknown;
};

export type MemoryInfluence = {
  global_risk_weight?: number;
  global_risk_score?: number;
  primary_sector?: string;
  sector_adjustment?: Record<string, number>;
  events_consulted?: Array<{ type?: string; ts?: string; impact?: number }>;
};

export type NetiqDecision = {
  mode?: DecisionMode;
  intent: string;
  decision: DecisionValue;
  confidence: number;
  risk_score: number;
  reason: string;
  memory_influence?: MemoryInfluence;
  selected_agents?: string[];
  api_calls?: string[];
  duration_ms?: number;
  reasoning_summary?: string;
  policy_applied?: { rule_id?: string | null; source?: string };
};

export type DecideRequest = {
  intent: string;
  context?: ContextPayload;
  mode?: DecisionMode;
};

export type DecideResponse =
  | { ok: true; decision: NetiqDecision }
  | { ok: false; status: number; errors: string[] };

export type DemoSession = {
  phone: string;
  signed_in_at: string;
  sign_in_decision: DecisionValue;
  sign_in_reason: string;
  sign_in_confidence: number;
};

export type SessionResponse =
  | { ok: true; session: DemoSession; decision: NetiqDecision }
  | { ok: false; status: number; errors: string[] };
