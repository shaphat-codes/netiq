import { NextResponse } from "next/server";

import {
  BackendError,
  readSession,
  runDecision,
  validateDecideBody,
} from "@/lib/demo/session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, status: 401, errors: ["No active demo session. Sign in first."] },
      { status: 401 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, status: 400, errors: ["Invalid JSON body"] },
      { status: 400 }
    );
  }

  const parsed = validateDecideBody(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, status: 400, errors: parsed.errors },
      { status: 400 }
    );
  }

  // The Bearer token is optional. Without it, Flask serves the call
  // anonymously (REQUIRE_API_KEY defaults to false) — fine for the demo.
  // Setting NETIQ_DEMO_API_KEY scopes memory and audit to a tenant.

  try {
    const decision = await runDecision({
      intent: parsed.data.intent,
      phone: session.phone,
      context: parsed.data.context,
      mode: parsed.data.mode,
    });
    return NextResponse.json({ ok: true, decision });
  } catch (err) {
    if (err instanceof BackendError) {
      return NextResponse.json(
        { ok: false, status: err.status, errors: err.errors },
        { status: err.status }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        status: 502,
        errors: [
          err instanceof Error
            ? `NetIQ backend unreachable: ${err.message}`
            : "NetIQ backend unreachable",
        ],
      },
      { status: 502 }
    );
  }
}
