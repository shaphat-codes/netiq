import { NextResponse } from "next/server";

import { backendBase, unreachable } from "@/lib/a2a/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${backendBase()}/.well-known/agent.json`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    let card: unknown = null;
    try {
      card = text ? JSON.parse(text) : null;
    } catch {
      card = { errors: [text || "Invalid JSON from backend"] };
    }
    if (!res.ok) {
      const errs =
        (card &&
          typeof card === "object" &&
          "errors" in card &&
          Array.isArray((card as { errors?: unknown }).errors)
          ? ((card as { errors: unknown[] }).errors as unknown[]).map((e) => String(e))
          : null) ?? [`Agent Card fetch returned ${res.status}`];
      return NextResponse.json(
        { ok: false, status: res.status, errors: errs },
        { status: res.status },
      );
    }
    return NextResponse.json({ ok: true, status: res.status, card });
  } catch (err) {
    const e = unreachable(err);
    return NextResponse.json(e, { status: e.status });
  }
}
