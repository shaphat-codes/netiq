/** Canonical production API origin (Flask on Render). Used in docs and landing snippets. */
export const NETIQ_PRODUCTION_API_ORIGIN = "https://netiq-api.onrender.com";

/**
 * NetIQ Flask API base URL. Use the same site as the UI in dev (e.g. localhost) so session cookies work.
 */
export function getApiBase(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_NETIQ_API_URL || "http://localhost:8080";
  }
  return process.env.NEXT_PUBLIC_NETIQ_API_URL || "http://localhost:8080";
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  const base = getApiBase().replace(/\/$/, "");
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const hasBody = init?.body != null && init?.body !== "";
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let data: T = undefined as T;
  try {
    data = text ? (JSON.parse(text) as T) : (undefined as T);
  } catch {
    data = text as T;
  }
  return { ok: res.ok, status: res.status, data };
}

export async function fetchMe() {
  return apiFetch<{
    user_id: number;
    email: string;
    account_id: number;
    account_name: string;
  }>("/api/v1/auth/me");
}
