/**
 * Browser-side helpers for the demo apps.
 *
 * All network calls go to the Next Route Handlers under /api/netiq/*,
 * never directly to the Flask backend (the Bearer key lives server-side).
 */

import type {
  ContextPayload,
  DecideResponse,
  DemoSession,
  NetiqDecision,
  SessionResponse,
} from "./types";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    return { ok: false, status: res.status, errors: [text] } as unknown as T;
  }
}

export async function fetchSession(): Promise<DemoSession | null> {
  const res = await fetch("/api/netiq/session", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });
  if (res.status === 401) return null;
  const data = await readJson<SessionResponse>(res);
  if (data.ok) return data.session;
  return null;
}

export async function signIn(input: {
  phone: string;
  intent?: string;
  context?: ContextPayload;
}): Promise<SessionResponse> {
  const res = await fetch("/api/netiq/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: input.phone,
      intent: input.intent ?? "onboarding",
      context: input.context ?? {},
    }),
    credentials: "include",
  });
  return readJson<SessionResponse>(res);
}

export async function signOut(): Promise<void> {
  await fetch("/api/netiq/session", {
    method: "DELETE",
    credentials: "include",
  });
}

export async function runAction(input: {
  intent: string;
  context?: ContextPayload;
  mode?: "agent" | "policy";
}): Promise<DecideResponse> {
  const res = await fetch("/api/netiq/decide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: input.intent,
      context: input.context ?? {},
      mode: input.mode ?? "agent",
    }),
    credentials: "include",
  });
  return readJson<DecideResponse>(res);
}

export function decisionTone(d: NetiqDecision["decision"]):
  | "success"
  | "warning"
  | "error"
  | "neutral" {
  if (d === "ALLOW") return "success";
  if (d === "BLOCK") return "error";
  if (d === "VERIFY" || d === "OTP" || d === "PRIORITIZE" || d === "DEGRADE")
    return "warning";
  return "neutral";
}
