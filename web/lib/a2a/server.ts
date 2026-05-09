/**
 * Server-side helpers for the A2A demo Route Handlers.
 *
 * These helpers exist so the browser never sees `NETIQ_DEMO_API_KEY`. The
 * UI calls Next Route Handlers under `/api/netiq/a2a/*`, and those handlers
 * proxy to the Flask backend with the bearer token attached here.
 */

import "server-only";

export function backendBase(): string {
  const raw =
    process.env.NETIQ_API_URL ||
    process.env.NEXT_PUBLIC_NETIQ_API_URL ||
    "http://localhost:8080";
  return raw.replace(/\/$/, "");
}

export function bearerToken(): string | null {
  const key = process.env.NETIQ_DEMO_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const token = bearerToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function unreachable(err: unknown): {
  ok: false;
  status: number;
  errors: string[];
} {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "unknown";
  return {
    ok: false,
    status: 502,
    errors: [`NetIQ backend unreachable: ${message}`],
  };
}
