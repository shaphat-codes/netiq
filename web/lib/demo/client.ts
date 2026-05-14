/**
 * Browser-side helpers for the demo apps.
 *
 * Sign-in / session still use `/api/netiq/*` so `NETIQ_DEMO_API_KEY` stays
 * server-side. In-app actions use `/api/netiq/decide` by default, or — when
 * `NEXT_PUBLIC_NETIQ_DEMO_DIRECT` is set and a `phone` is passed — call Flask
 * `/decision/run` directly (same path as the console simulator), skipping the
 * Next hop (faster for split Vercel + Render demos).
 */

import { getApiBase } from "@/lib/api";

import type {
  ContextPayload,
  DecideResponse,
  DemoSession,
  NetiqDecision,
  SessionResponse,
} from "./types";

function demoDirectEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_NETIQ_DEMO_DIRECT;
  return v === "1" || v === "true";
}

function demoBrowserApiKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_NETIQ_DEMO_BROWSER_API_KEY?.trim();
  return k || undefined;
}

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

async function postDecideDirect(input: {
  intent: string;
  phone: string;
  context?: ContextPayload;
  mode?: "agent" | "policy";
}): Promise<DecideResponse> {
  const base = getApiBase().replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const bk = demoBrowserApiKey();
  if (bk) headers.Authorization = `Bearer ${bk}`;

  const res = await fetch(`${base}/decision/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      intent: input.intent,
      phone: input.phone,
      context: input.context ?? {},
      mode: input.mode ?? "agent",
    }),
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return { ok: false, status: res.status, errors: [text.slice(0, 400)] };
  }

  if (!res.ok) {
    const errs =
      data && typeof data === "object" && data !== null && "errors" in data
        ? (data as { errors?: unknown }).errors
        : null;
    const arr = Array.isArray(errs)
      ? errs.map((e) => String(e))
      : [`HTTP ${res.status}`];
    return { ok: false, status: res.status, errors: arr };
  }

  return { ok: true, decision: data as NetiqDecision };
}

export async function runAction(input: {
  intent: string;
  context?: ContextPayload;
  mode?: "agent" | "policy";
  /** Session phone; required for browser-direct mode (`NEXT_PUBLIC_NETIQ_DEMO_DIRECT`). */
  phone?: string;
}): Promise<DecideResponse> {
  if (demoDirectEnabled() && input.phone) {
    try {
      return await postDecideDirect({
        intent: input.intent,
        phone: input.phone,
        context: input.context,
        mode: input.mode,
      });
    } catch (e) {
      return {
        ok: false,
        status: 0,
        errors: [
          e instanceof Error ? e.message : "Network error calling NetIQ API directly",
        ],
      };
    }
  }

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
