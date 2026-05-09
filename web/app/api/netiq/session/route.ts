import { NextResponse } from "next/server";

import {
  BackendError,
  clearSession,
  isForceAllowEnabled,
  readSession,
  runDecision,
  writeSession,
} from "@/lib/demo/session-server";
import type { ContextPayload, DemoSession } from "@/lib/demo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const E164 = /^\+[1-9]\d{6,14}$/;

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, status: 401, errors: ["No active demo session"] },
      { status: 401 }
    );
  }
  return NextResponse.json({ ok: true, session });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, status: 400, errors: ["Invalid JSON body"] },
      { status: 400 }
    );
  }

  const body = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!E164.test(phoneRaw)) {
    return NextResponse.json(
      {
        ok: false,
        status: 400,
        errors: ["phone must be in E.164 format, e.g. +9999999103"],
      },
      { status: 400 }
    );
  }
  const intent = typeof body.intent === "string" && body.intent.trim()
    ? body.intent.trim()
    : "onboarding";
  const context: ContextPayload =
    body.context && typeof body.context === "object" && !Array.isArray(body.context)
      ? (body.context as ContextPayload)
      : {};

  // Bearer token is optional. See decide/route.ts for the rationale.

  try {
    const forceAllow = await isForceAllowEnabled();
    const decision = await runDecision({
      intent,
      phone: phoneRaw,
      context,
      mode: "agent",
    });

    if (decision.decision === "BLOCK" && !forceAllow) {
      return NextResponse.json(
        {
          ok: false,
          status: 403,
          errors: [
            decision.reason ||
              "NetIQ blocked this sign-in based on network risk signals.",
          ],
          decision,
        },
        { status: 403 }
      );
    }

    const effectiveDecision =
      decision.decision === "BLOCK" && forceAllow
        ? {
            ...decision,
            decision: "ALLOW" as const,
            reason: `Demo override enabled: onboarding allowed. Original NetIQ result was BLOCK${decision.reason ? ` (${decision.reason})` : ""}.`,
          }
        : decision;

    const session: DemoSession = {
      phone: phoneRaw,
      signed_in_at: new Date().toISOString(),
      sign_in_decision: effectiveDecision.decision,
      sign_in_reason: effectiveDecision.reason || "",
      sign_in_confidence: effectiveDecision.confidence,
    };
    await writeSession(session);
    return NextResponse.json({ ok: true, session, decision: effectiveDecision });
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
