/**
 * Server-side helpers for the demo session cookie + Flask backend forwarding.
 *
 * Notes for future standalone-app extraction:
 * - This module is the only place that reads `NETIQ_DEMO_API_KEY` and
 *   `NETIQ_API_URL`. To split a sector into its own Next app later, copy
 *   this file plus `types.ts` and the matching Route Handlers.
 * - The session cookie is httpOnly, base64-encoded JSON. It is sufficient
 *   for the hackathon demo (the Next server is the only writer/reader)
 *   but is NOT a production identity primitive.
 */

import "server-only";

import { cookies } from "next/headers";

import type {
  ContextPayload,
  DecideRequest,
  DemoSession,
  NetiqDecision,
} from "./types";

export const DEMO_SESSION_COOKIE = "netiq_demo_session";
export const DEMO_FORCE_ALLOW_COOKIE = "netiq_demo_force_allow";
const ONE_HOUR_SECONDS = 60 * 60;

/** Cookie value for `DEMO_SESSION_COOKIE` (base64url JSON). */
export function serializeDemoSessionCookie(session: DemoSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

/** Options for `NextResponse.cookies.set` / Route Handler session cookie. */
export function demoSessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
  secure: boolean;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_HOUR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  };
}

function backendBase(): string {
  const raw =
    process.env.NETIQ_API_URL ||
    process.env.NEXT_PUBLIC_NETIQ_API_URL ||
    "http://localhost:8080";
  return raw.replace(/\/$/, "");
}

function bearerToken(): string | null {
  const key = process.env.NETIQ_DEMO_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

export class BackendError extends Error {
  status: number;
  errors: string[];

  constructor(status: number, errors: string[]) {
    super(errors[0] || `NetIQ backend returned ${status}`);
    this.status = status;
    this.errors = errors.length ? errors : [`NetIQ backend returned ${status}`];
  }
}

type RunDecisionInput = {
  intent: string;
  phone: string;
  context?: ContextPayload;
  mode?: "agent" | "policy";
};

/**
 * Forwards a decision request to the Flask backend's `/decision/run`.
 * Throws BackendError on non-2xx responses with parsed errors.
 */
export async function runDecision(
  input: RunDecisionInput
): Promise<NetiqDecision> {
  const token = bearerToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const body = {
    intent: input.intent,
    phone: input.phone,
    context: input.context ?? {},
    mode: input.mode ?? "agent",
  };

  const res = await fetch(`${backendBase()}/decision/run`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { errors: [text || "Invalid JSON from backend"] };
  }

  if (!res.ok) {
    const errs =
      (parsed && typeof parsed === "object" && "errors" in parsed
        ? (parsed as { errors?: unknown }).errors
        : null) || [];
    const errArr = Array.isArray(errs)
      ? errs.map((e) => String(e))
      : [String(errs)];
    throw new BackendError(res.status, errArr);
  }

  return parsed as NetiqDecision;
}

function encodeSession(s: DemoSession): string {
  return serializeDemoSessionCookie(s);
}

function decodeSession(raw: string): DemoSession | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const obj = JSON.parse(json) as DemoSession;
    if (!obj.phone || !obj.signed_in_at) return null;
    return obj;
  } catch {
    return null;
  }
}

export async function readSession(): Promise<DemoSession | null> {
  const jar = await cookies();
  const raw = jar.get(DEMO_SESSION_COOKIE)?.value;
  if (!raw) return null;
  return decodeSession(raw);
}

export async function writeSession(session: DemoSession): Promise<void> {
  const jar = await cookies();
  const opts = demoSessionCookieOptions();
  jar.set(DEMO_SESSION_COOKIE, encodeSession(session), opts);
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  const opts = demoSessionCookieOptions();
  jar.set(DEMO_SESSION_COOKIE, "", { ...opts, maxAge: 0 });
}

export async function isForceAllowEnabled(): Promise<boolean> {
  const jar = await cookies();
  const raw = (jar.get(DEMO_FORCE_ALLOW_COOKIE)?.value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

/**
 * Validates and normalises an incoming decide request from a sector page.
 * The session phone is the authoritative subject — request bodies cannot
 * change the actor.
 */
export function validateDecideBody(body: unknown): {
  ok: true;
  data: DecideRequest;
} | {
  ok: false;
  errors: string[];
} {
  if (!body || typeof body !== "object") {
    return { ok: false, errors: ["Body must be a JSON object"] };
  }
  const b = body as Record<string, unknown>;
  const intent = typeof b.intent === "string" ? b.intent.trim() : "";
  if (!intent) return { ok: false, errors: ["intent is required"] };
  const mode = b.mode === "policy" ? "policy" : "agent";
  const context =
    b.context && typeof b.context === "object" && !Array.isArray(b.context)
      ? (b.context as ContextPayload)
      : {};
  return { ok: true, data: { intent, mode, context } };
}

export function envStatus(): {
  hasApiKey: boolean;
  backend: string;
} {
  return {
    hasApiKey: bearerToken() !== null,
    backend: backendBase(),
  };
}
