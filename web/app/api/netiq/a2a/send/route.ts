import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { authHeaders, backendBase, unreachable } from "@/lib/a2a/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SKILLS = new Set(["decide", "evaluate_policy", "lookup_phone_history"]);

type DataPart = {
  skill: string;
  phone: string;
  intent?: string;
  mode?: "agent" | "policy";
  context?: Record<string, unknown>;
};

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, status: 400, errors: ["Invalid JSON body"] },
      { status: 400 },
    );
  }

  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const skillRaw =
    typeof body.skill === "string" && body.skill.trim()
      ? body.skill.trim()
      : "decide";
  const skill = VALID_SKILLS.has(skillRaw) ? skillRaw : "decide";
  const intent = typeof body.intent === "string" ? body.intent.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const mode = body.mode === "policy" ? "policy" : "agent";
  const context =
    body.context && typeof body.context === "object" && !Array.isArray(body.context)
      ? (body.context as Record<string, unknown>)
      : {};
  const taskId =
    typeof body.taskId === "string" && body.taskId.trim()
      ? body.taskId.trim()
      : `web-${randomUUID().slice(0, 8)}`;
  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim()
      : `web-session-${randomUUID().slice(0, 6)}`;

  const errors: string[] = [];
  if (!phone) errors.push("phone is required");
  if (skill !== "lookup_phone_history" && !intent) errors.push("intent is required");
  if (errors.length) {
    return NextResponse.json(
      { ok: false, status: 400, errors },
      { status: 400 },
    );
  }

  const dataPart: DataPart = { skill, phone };
  if (skill !== "lookup_phone_history") {
    dataPart.intent = intent;
    dataPart.mode = mode;
    if (Object.keys(context).length) dataPart.context = context;
  }

  const taskBody = {
    id: taskId,
    sessionId,
    message: {
      role: "user" as const,
      parts: [{ type: "data" as const, data: dataPart }],
    },
  };

  try {
    const res = await fetch(`${backendBase()}/a2a/tasks/send`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(taskBody),
      cache: "no-store",
    });
    const text = await res.text();
    let response: unknown = null;
    try {
      response = text ? JSON.parse(text) : null;
    } catch {
      response = { errors: [text || "Invalid JSON from backend"] };
    }
    return NextResponse.json(
      {
        ok: res.ok,
        status: res.status,
        request: taskBody,
        response,
      },
      { status: res.ok ? 200 : res.status },
    );
  } catch (err) {
    const e = unreachable(err);
    return NextResponse.json({ ...e, request: taskBody }, { status: e.status });
  }
}
