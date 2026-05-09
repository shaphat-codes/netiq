import { NextResponse } from "next/server";

import { authHeaders, backendBase, unreachable } from "@/lib/a2a/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const taskId =
    (typeof body.id === "string" && body.id.trim()) ||
    (typeof body.taskId === "string" && body.taskId.trim()) ||
    "";
  if (!taskId) {
    return NextResponse.json(
      { ok: false, status: 400, errors: ["task id is required"] },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${backendBase()}/a2a/tasks/get`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ id: taskId }),
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
      { ok: res.ok, status: res.status, response },
      { status: res.ok ? 200 : res.status },
    );
  } catch (err) {
    const e = unreachable(err);
    return NextResponse.json(e, { status: e.status });
  }
}
