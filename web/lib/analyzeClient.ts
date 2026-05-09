import { getApiBase } from "./api";

export type ApiResponse<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | string;
};

/** Omit when empty so anonymous calls work when REQUIRE_API_KEY is false. */
function bearerHeaders(apiKey: string): Record<string, string> {
  const t = apiKey.trim();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

async function postJSON<T = unknown>(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  const base = getApiBase().replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...bearerHeaders(apiKey),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) as T };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

/** Unified dual-mode decisioning ({ mode: 'policy' | 'agent', intent, phone, context }). */
export function postDecisionRun(apiKey: string, body: Record<string, unknown>) {
  return postJSON("/decision/run", apiKey, body);
}

/** Agent-only shortcut — same body without a mode field. */
export function postAgentRun(apiKey: string, body: Record<string, unknown>) {
  return postJSON("/agent/run", apiKey, body);
}

/* -------------------------------------------------------------------------- */
/* MCP — call NetIQ as an MCP tool over the HTTP transport                    */
/* -------------------------------------------------------------------------- */

/**
 * Discover the tools exposed by the NetIQ MCP server. Uses the JSON-RPC
 * `tools/list` method so the simulator can show real protocol discovery
 * before invoking a tool.
 */
export async function postMcpListTools(
  apiKey: string,
): Promise<
  ApiResponse<{
    jsonrpc?: string;
    id?: number | string;
    result?: { tools?: { name: string; description?: string }[] };
    error?: { code: number; message: string };
  }>
> {
  return postJSON(
    "/mcp",
    apiKey,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    },
  );
}

/**
 * Invoke the NetIQ MCP `decide` tool over the JSON-RPC HTTP transport at
 * /mcp. Unwraps the MCP envelope so the caller gets back the same decision
 * shape that /decision/run returns (decision, confidence, trace, ...).
 */
export async function postMcpDecide(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<ApiResponse<Record<string, unknown>>> {
  const r = await postJSON<{
    jsonrpc?: string;
    result?: { content?: { type: string; text: string }[]; isError?: boolean };
    error?: { code: number; message: string };
  }>(
    "/mcp",
    apiKey,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "decide", arguments: body },
    },
  );

  if (!r.ok || typeof r.data === "string") {
    return r as ApiResponse<Record<string, unknown>>;
  }

  const env = r.data;
  if (env.error) {
    return { ok: false, status: r.status, data: { errors: [env.error.message] } };
  }
  const text = env.result?.content?.[0]?.text ?? "";
  let inner: Record<string, unknown> = {};
  try {
    inner = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, status: r.status, data: { errors: [`MCP returned non-JSON content: ${text.slice(0, 120)}`] } };
  }
  if (env.result?.isError) {
    return { ok: false, status: r.status, data: inner };
  }
  return { ok: true, status: r.status, data: inner };
}

/* -------------------------------------------------------------------------- */
/* A2A — call NetIQ as a peer agent over the A2A protocol                     */
/* -------------------------------------------------------------------------- */

/**
 * Fetch the A2A Agent Card from the well-known endpoint. The Agent Card is
 * the public contract that other agents read to discover NetIQ's skills,
 * auth requirements, and streaming capabilities.
 */
export async function fetchA2AAgentCard(): Promise<
  ApiResponse<{
    name?: string;
    description?: string;
    version?: string;
    url?: string;
    capabilities?: { streaming?: boolean };
    authentication?: { schemes?: string[] };
    skills?: { id: string; name: string; description?: string; tags?: string[] }[];
  }>
> {
  const base = getApiBase().replace(/\/$/, "");
  const res = await fetch(`${base}/.well-known/agent.json`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

/**
 * Send an A2A task to /a2a/tasks/send. Unwraps the task artifact so the
 * caller gets back the same decision shape that /decision/run returns.
 */
export async function postA2ASend(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<ApiResponse<Record<string, unknown>>> {
  const taskId = `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const r = await postJSON<{
    id?: string;
    status?: { state?: string; message?: { parts?: { type: string; text?: string }[] } };
    artifacts?: { name?: string; parts?: { type: string; data?: Record<string, unknown>; text?: string }[] }[];
  }>(
    "/a2a/tasks/send",
    apiKey,
    {
      id: taskId,
      message: {
        role: "user",
        parts: [
          {
            type: "data",
            data: { skill: "decide", ...body },
          },
        ],
      },
    },
  );

  if (typeof r.data === "string") return r as ApiResponse<Record<string, unknown>>;

  const task = r.data;
  if (task.status?.state === "failed" || !r.ok) {
    const msg = task.status?.message?.parts?.[0]?.text ?? "A2A task failed";
    return { ok: false, status: r.status || 400, data: { errors: [msg] } };
  }
  const artifact = (task.artifacts ?? []).find((a) => a?.name === "decide" || a?.name === "result");
  const data = artifact?.parts?.[0]?.data ?? {};
  return { ok: true, status: r.status, data };
}

/* -------------------------------------------------------------------------- */
/* A2A streaming                                                              */
/* -------------------------------------------------------------------------- */

type A2AArtifactFrame = {
  type: "TaskArtifactUpdateEvent";
  artifact?: {
    name?: string;
    parts?: { type: string; data?: Record<string, unknown>; text?: string }[];
  };
};

type A2AStatusFrame = {
  type: "TaskStatusUpdateEvent";
  status?: {
    state?: string;
    message?: { parts?: { type: string; text?: string }[] };
  };
  final?: boolean;
};

type A2AFrame = A2AArtifactFrame | A2AStatusFrame;

/**
 * Open a streaming A2A task at /a2a/tasks/sendSubscribe. Translates each A2A
 * frame into the same StreamEvent shape that streamDecisionRun emits so the
 * simulator can render either source with the same UI code.
 */
export async function streamA2ADecision(
  apiKey: string,
  body: Record<string, unknown>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const base = getApiBase().replace(/\/$/, "");
  const taskId = `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const intent = String(body.intent ?? "");
  const phone = String(body.phone ?? "");

  const res = await fetch(`${base}/a2a/tasks/sendSubscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...bearerHeaders(apiKey),
    },
    body: JSON.stringify({
      id: taskId,
      message: {
        role: "user",
        parts: [{ type: "data", data: { skill: "decide", ...body } }],
      },
    }),
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const t = await res.text();
      detail = t.slice(0, 200);
    } catch {
      /* ignore */
    }
    onEvent({ type: "error", message: `HTTP ${res.status}${detail ? `: ${detail}` : ""}` });
    return;
  }

  onEvent({ type: "start", intent, phone });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx = buffer.indexOf("\n\n");
    while (sepIdx !== -1) {
      const rawEvent = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);

      const dataLines = rawEvent
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart());
      const json = dataLines.join("\n");
      if (!json) {
        sepIdx = buffer.indexOf("\n\n");
        continue;
      }

      let frame: A2AFrame;
      try {
        frame = JSON.parse(json) as A2AFrame;
      } catch {
        sepIdx = buffer.indexOf("\n\n");
        continue;
      }

      const translated = translateA2AFrame(frame);
      if (translated) onEvent(translated);

      sepIdx = buffer.indexOf("\n\n");
    }
  }
}

function translateA2AFrame(frame: A2AFrame): StreamEvent | null {
  if (frame.type === "TaskArtifactUpdateEvent") {
    const name = frame.artifact?.name;
    const data = frame.artifact?.parts?.[0]?.data ?? {};
    if (name === "tool_call") {
      return {
        type: "tool_call",
        step: Number((data as { step?: number }).step ?? 0),
        tool: String((data as { tool?: string }).tool ?? ""),
        args: ((data as { args?: Record<string, unknown> }).args) ?? undefined,
      };
    }
    if (name === "tool_result") {
      return {
        type: "tool_result",
        step: Number((data as { step?: number }).step ?? 0),
        tool: String((data as { tool?: string }).tool ?? ""),
        result: (data as { result?: unknown }).result,
        degraded: Boolean((data as { degraded?: boolean }).degraded),
      };
    }
    if (name === "trace_step") {
      return { type: "trace_step", step: data as { step: number; agent: string; action: string } };
    }
    if (name === "decision") {
      const d = data as Record<string, unknown>;
      return {
        type: "decision",
        decision: String(d.decision ?? ""),
        risk_score: Number(d.risk_score ?? 0),
        confidence: Number(d.confidence ?? 0),
        reason: String(d.reason ?? ""),
        reasoning_summary: typeof d.reasoning_summary === "string" ? d.reasoning_summary : undefined,
      };
    }
    if (name === "memory") {
      return { type: "memory", memory_influence: data };
    }
    if (name === "result") {
      return { type: "done", full_response: data };
    }
    return null;
  }
  if (frame.type === "TaskStatusUpdateEvent") {
    const state = frame.status?.state;
    if (state === "failed") {
      const msg = frame.status?.message?.parts?.[0]?.text ?? "task failed";
      return { type: "error", message: msg };
    }
    return null;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Streaming                                                                  */
/* -------------------------------------------------------------------------- */

export type ProtocolStepStatus = "pending" | "complete" | "error";

export type StreamEvent =
  | { type: "start"; intent: string; phone: string }
  | { type: "tool_call"; step: number; tool: string; args?: Record<string, unknown> }
  | {
      type: "tool_result";
      step: number;
      tool: string;
      result: unknown;
      degraded: boolean;
    }
  | { type: "trace_step"; step: { step: number; agent: string; action: string; result?: unknown } }
  | {
      type: "decision";
      decision: string;
      risk_score: number;
      confidence: number;
      reason: string;
      reasoning_summary?: string;
    }
  | { type: "memory"; memory_influence: Record<string, unknown> }
  | { type: "fallback"; reason: string }
  | { type: "done"; full_response: Record<string, unknown> }
  | { type: "error"; message: string }
  | {
      type: "protocol_step";
      phase: string;
      label: string;
      status: ProtocolStepStatus;
      detail?: string;
      payload?: unknown;
    };

/**
 * Open a Server-Sent Events stream against POST /decision/stream and invoke
 * `onEvent` for each event. Resolves once the stream closes.
 */
export async function streamDecisionRun(
  apiKey: string,
  body: Record<string, unknown>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const base = getApiBase().replace(/\/$/, "");
  const res = await fetch(`${base}/decision/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...bearerHeaders(apiKey),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const t = await res.text();
      detail = t.slice(0, 200);
    } catch {
      /* ignore */
    }
    onEvent({ type: "error", message: `HTTP ${res.status}${detail ? `: ${detail}` : ""}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line.
    let sepIdx = buffer.indexOf("\n\n");
    while (sepIdx !== -1) {
      const rawEvent = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);

      // Concatenate all `data:` lines (per SSE spec — usually one).
      const dataLines = rawEvent
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart());
      const json = dataLines.join("\n");
      if (json) {
        try {
          const event = JSON.parse(json) as StreamEvent;
          onEvent(event);
        } catch {
          /* skip malformed event */
        }
      }
      sepIdx = buffer.indexOf("\n\n");
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Consumer chat (public + authenticated)                                     */
/* -------------------------------------------------------------------------- */

export type ConsumerStreamEvent =
  | { type: "understanding" }
  | {
      type: "extracted";
      intent: string;
      phone: string;
      context: Record<string, unknown>;
      clarification_needed?: string;
    }
  | { type: "tool_call"; step: number; tool: string }
  | {
      type: "tool_result";
      step: number;
      tool: string;
      degraded: boolean;
      result?: unknown;
    }
  | { type: "trace_step"; step: { step: number; agent: string; action: string; result?: unknown } }
  | {
      type: "decision";
      decision: string;
      risk_score?: number;
      confidence?: number;
      reason?: string;
      reasoning_summary?: string;
    }
  | { type: "memory"; memory_influence: Record<string, unknown> }
  | { type: "fallback"; reason: string }
  | { type: "answer_start" }
  | { type: "answer_chunk"; text: string }
  | {
      type: "done";
      decision_summary: Record<string, unknown>;
      duration_ms?: number;
    }
  | { type: "error"; message: string };

export type ConsumerChatBody = {
  phone: string;
  prompt: string;
  history?: { role: "user" | "assistant"; content: string }[];
};

/**
 * Open a streaming consumer chat session against POST /consumer/chat/stream.
 * Pass `apiKey: null` to call the public anonymous path (IP-rate-limited),
 * or a valid key to run in the authenticated tenant scope.
 */
export async function streamConsumerChat(
  apiKey: string | null,
  body: ConsumerChatBody,
  onEvent: (event: ConsumerStreamEvent) => void,
): Promise<void> {
  const base = getApiBase().replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${base}/consumer/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const t = await res.text();
      detail = t.slice(0, 200);
    } catch {
      /* ignore */
    }
    onEvent({ type: "error", message: `HTTP ${res.status}${detail ? `: ${detail}` : ""}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx = buffer.indexOf("\n\n");
    while (sepIdx !== -1) {
      const rawEvent = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);

      const dataLines = rawEvent
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart());
      const json = dataLines.join("\n");
      if (json) {
        try {
          const event = JSON.parse(json) as ConsumerStreamEvent;
          onEvent(event);
        } catch {
          /* skip malformed event */
        }
      }
      sepIdx = buffer.indexOf("\n\n");
    }
  }
}
