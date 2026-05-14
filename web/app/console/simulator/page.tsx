"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { apiFetch, getApiBase } from "@/lib/api";
import {
  streamDecisionRun,
  type ProtocolStepStatus,
  type StreamEvent,
} from "@/lib/analyzeClient";
import scenariosData from "@/lib/scenarios.json";

type Scenario = {
  id: string;
  label: string;
  description: string;
  mode: "policy" | "agent";
  payload: Record<string, unknown>;
};
type KeyRow = { id: number; name: string; key_prefix: string; revoked_at?: string | null };

type Mode = "policy" | "agent";
type Protocol = "rest" | "mcp" | "a2a";

type TraceStep = { step: number; agent: string; action: string; result?: unknown };
type MemoryInfluence = {
  global_risk_weight?: number;
  global_risk_score?: number;
  primary_sector?: string;
  sector_adjustment?: Record<string, number>;
  events_consulted?: { type?: string; ts?: string; impact?: number }[];
};
type VisualizationEdge = { from: string; to: string; label?: string };
type VisualizationPayload = {
  nodes?: string[];
  edges?: VisualizationEdge[];
  api_calls?: string[];
};
type StreamState = "idle" | "streaming" | "done" | "error";

type LiveStep =
  | {
      kind: "tool";
      step: number;
      tool: string;
      status: "pending" | "complete";
      result?: unknown;
      degraded?: boolean;
    }
  | { kind: "trace"; step: TraceStep }
  | { kind: "info"; message: string }
  | {
      kind: "protocol";
      phase: string;
      label: string;
      status: ProtocolStepStatus;
      detail?: string;
      payload?: unknown;
    };

type DecisionResponse = {
  mode?: Mode;
  intent?: string;
  decision?: string;
  confidence?: number;
  risk_score?: number;
  reason?: string;
  reasoning_summary?: string;
  selected_agents?: string[];
  api_calls?: string[];
  trace?: TraceStep[];
  visualization_payload?: VisualizationPayload;
  memory_influence?: MemoryInfluence;
  policy_applied?: { rule_id?: string | null; source?: string };
  duration_ms?: number;
};

function parseEnvelope(raw: string): {
  ok?: boolean;
  status?: number;
  data?: Record<string, unknown>;
} | null {
  try {
    return JSON.parse(raw) as { ok?: boolean; status?: number; data?: Record<string, unknown> };
  } catch {
    return null;
  }
}

type PreviewStep = { title: string; subtitle?: string; content: string };

function buildWireRequestPreview(
  protocol: Protocol,
  mode: Mode,
  rawBody: string,
  includeAuth: boolean,
): PreviewStep[] {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return [
      {
        title: "Invalid JSON in decision arguments",
        content: "Fix the JSON above to preview the wire request.",
      },
    ];
  }

  const requestBody = { ...args, mode };
  const authHeaders = includeAuth ? { Authorization: "Bearer <api_key>" } : {};

  if (protocol === "rest") {
    return [
      {
        title: "POST /decision/stream",
        subtitle: includeAuth
          ? "Direct backend call. Streams SSE events back."
          : "Direct backend call (no Authorization when the API allows anonymous access). Streams SSE events back.",
        content: JSON.stringify(
          {
            method: "POST",
            path: "/decision/stream",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
              Accept: "text/event-stream",
            },
            body: requestBody,
          },
          null,
          2,
        ),
      },
    ];
  }

  if (protocol === "mcp") {
    return [
      {
        title: "1. tools/list — discover NetIQ tools",
        subtitle: "MCP clients (Claude, Cursor, ...) start by enumerating tools.",
        content: JSON.stringify(
          {
            method: "POST",
            path: "/mcp",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
            body: {
              jsonrpc: "2.0",
              id: 1,
              method: "tools/list",
              params: {},
            },
          },
          null,
          2,
        ),
      },
      {
        title: "2. tools/call — invoke decide",
        subtitle: "JSON-RPC tool call wrapping the shared decision arguments.",
        content: JSON.stringify(
          {
            method: "POST",
            path: "/mcp",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
            body: {
              jsonrpc: "2.0",
              id: 2,
              method: "tools/call",
              params: {
                name: "decide",
                arguments: requestBody,
              },
            },
          },
          null,
          2,
        ),
      },
    ];
  }

  return [
    {
      title: "1. GET /.well-known/agent.json — fetch Agent Card",
      subtitle: "Peer agents start by discovering NetIQ's skills + auth scheme.",
      content: JSON.stringify(
        {
          method: "GET",
          path: "/.well-known/agent.json",
          headers: { Accept: "application/json" },
        },
        null,
        2,
      ),
    },
    {
      title: "2. POST /a2a/tasks/sendSubscribe — start streaming task",
      subtitle: includeAuth
        ? "A2A task envelope with structured DataPart and lifecycle frames."
        : "Same envelope without Authorization when the API allows anonymous access.",
      content: JSON.stringify(
        {
          method: "POST",
          path: "/a2a/tasks/sendSubscribe",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
            Accept: "text/event-stream",
          },
          body: {
            id: "sim-<generated-task-id>",
            message: {
              role: "user",
              parts: [
                {
                  type: "data",
                  data: {
                    skill: "decide",
                    ...requestBody,
                  },
                },
              ],
            },
          },
        },
        null,
        2,
      ),
    },
  ];
}

export default function SimulatorPage() {
  const scenarios = scenariosData.scenarios as Scenario[];
  const base = useMemo(() => getApiBase().replace(/\/$/, ""), []);

  const [manualKey, setManualKey] = useState("");
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>(scenarios[0]?.mode ?? "agent");
  const [protocol, setProtocol] = useState<Protocol>("rest");
  const [body, setBody] = useState(JSON.stringify(scenarios[0]?.payload ?? {}, null, 2));
  const [out, setOut] = useState("");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Streaming state — populated incrementally from the SSE stream.
  const [streamState, setStreamState] = useState<StreamState>("idle");
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [liveDecision, setLiveDecision] = useState<{
    decision: string;
    risk_score: number;
    confidence: number;
    reason: string;
    reasoning_summary?: string;
  } | null>(null);
  const [liveMemory, setLiveMemory] = useState<MemoryInfluence | null>(null);
  const [liveFallback, setLiveFallback] = useState<string | null>(null);
  const [executionOpen, setExecutionOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await apiFetch<{ keys: KeyRow[] }>("/api/v1/keys");
      if (r.ok && r.data && "keys" in r.data) {
        setKeys((r.data.keys ?? []).filter((k) => !(k as KeyRow).revoked_at));
      }
    })();
  }, []);

  useEffect(() => {
    const s = scenarios.find((x) => x.id === scenarioId);
    if (s) {
      setBody(JSON.stringify(s.payload, null, 2));
      setMode(s.mode ?? "agent");
    }
  }, [scenarioId, scenarios]);

  const envelope = useMemo(() => (out ? parseEnvelope(out) : null), [out]);
  const decisionBody = (envelope?.data as Record<string, unknown> | undefined) ?? null;
  const httpStatus = envelope?.status ?? (out ? 0 : null);
  const wireRequestPreview = useMemo(
    () =>
      buildWireRequestPreview(protocol, mode, body, manualKey.trim().length > 0),
    [body, manualKey, mode, protocol],
  );

  const send = useCallback(async () => {
    setOut("");
    setLatencyMs(null);
    setLiveSteps([]);
    setLiveDecision(null);
    setLiveMemory(null);
    setLiveFallback(null);
    setCurrentTool(null);

    const apiKey = manualKey.trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body);
    } catch {
      setOut(JSON.stringify({ ok: false, status: 0, data: { errors: ["Invalid JSON body"] } }, null, 2));
      setStreamState("error");
      return;
    }

    setStreamState("streaming");
    const t0 = performance.now();

    let finalResponse: Record<string, unknown> | null = null;
    let errored = false;

    const handleEvent = (event: StreamEvent) => {
      switch (event.type) {
        case "start":
          break;
        case "tool_call":
          setCurrentTool(event.tool);
          setLiveSteps((s) => [
            ...s,
            { kind: "tool", step: event.step, tool: event.tool, status: "pending" },
          ]);
          break;
        case "tool_result":
          setCurrentTool(null);
          setLiveSteps((s) =>
            s.map((row) =>
              row.kind === "tool" && row.step === event.step
                ? {
                    ...row,
                    status: "complete" as const,
                    result: event.result,
                    degraded: event.degraded,
                  }
                : row,
            ),
          );
          break;
        case "trace_step":
          setLiveSteps((s) => [...s, { kind: "trace", step: event.step }]);
          break;
        case "decision":
          setLiveDecision({
            decision: event.decision,
            risk_score: event.risk_score,
            confidence: event.confidence,
            reason: event.reason,
            reasoning_summary: event.reasoning_summary,
          });
          break;
        case "memory":
          setLiveMemory(event.memory_influence as MemoryInfluence);
          break;
        case "fallback":
          setLiveFallback(event.reason);
          setLiveSteps((s) => [
            ...s,
            { kind: "info", message: `LLM unavailable — falling back (${event.reason})` },
          ]);
          break;
        case "done":
          finalResponse = event.full_response;
          break;
        case "error":
          errored = true;
          setLiveSteps((s) => [...s, { kind: "info", message: `Error: ${event.message}` }]);
          break;
        case "protocol_step":
          setLiveSteps((s) => {
            const idx = s.findIndex(
              (row) => row.kind === "protocol" && row.phase === event.phase,
            );
            const next: LiveStep = {
              kind: "protocol",
              phase: event.phase,
              label: event.label,
              status: event.status,
              detail: event.detail,
              payload: event.payload,
            };
            if (idx === -1) return [...s, next];
            const copy = s.slice();
            copy[idx] = next;
            return copy;
          });
          break;
        default:
          break;
      }
    };

    try {
      const reqBody = { ...parsed, mode };
      await streamDecisionRun(apiKey, reqBody, handleEvent);
    } catch (exc) {
      errored = true;
      setLiveSteps((s) => [
        ...s,
        { kind: "info", message: `Stream failed: ${exc instanceof Error ? exc.message : String(exc)}` },
      ]);
    }

    setLatencyMs(Math.round(performance.now() - t0));
    setCurrentTool(null);

    if (errored) {
      setStreamState("error");
      setOut(
        JSON.stringify(
          { ok: false, status: 0, data: { errors: ["Streaming failed — see live trace."] } },
          null,
          2,
        ),
      );
      return;
    }

    setStreamState("done");
    setOut(
      JSON.stringify(
        { ok: true, status: 200, data: finalResponse ?? {} },
        null,
        2,
      ),
    );
  }, [body, manualKey, mode]);

  async function copyOut() {
    if (!out) return;
    try {
      await navigator.clipboard.writeText(out);
    } catch {
      /* ignore */
    }
  }

  function downloadOut() {
    if (!out) return;
    const blob = new Blob([out], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `netiq-response-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Prefer live decision (set as soon as the LLM emits `make_decision`) so the
  // stats card lights up before the JSON envelope is finalized.
  const decision: string | null =
    liveDecision?.decision ?? (typeof decisionBody?.decision === "string" ? decisionBody.decision : null);

  const confidence: number | null = (() => {
    const raw =
      typeof liveDecision?.confidence === "number"
        ? liveDecision.confidence
        : typeof decisionBody?.confidence === "number"
          ? (decisionBody.confidence as number)
          : null;
    return raw != null ? Math.round(Math.min(100, Math.max(0, raw * 100))) : null;
  })();

  const riskScore: number | null =
    typeof liveDecision?.risk_score === "number"
      ? Math.round(liveDecision.risk_score)
      : typeof decisionBody?.risk_score === "number"
        ? Math.round(decisionBody.risk_score as number)
        : null;

  const explanation: string | null =
    (typeof liveDecision?.reason === "string" && liveDecision.reason.trim()) ||
    (typeof decisionBody?.reason === "string" && decisionBody.reason.trim()) ||
    null;

  const agentic: DecisionResponse | null = useMemo(() => {
    if (!decisionBody || !Array.isArray(decisionBody.trace)) return null;
    return decisionBody as DecisionResponse;
  }, [decisionBody]);

  return (
    <ConsolePage title="Simulator">
      <div className="space-y-12">
        <header className="space-y-1">
          <h1 className="text-on-surface text-2xl font-semibold tracking-tight">Simulator</h1>
          <p className="text-on-surface-variant max-w-2xl text-sm">
            Test REST decisions live, or get the integration material your AI tool
            (MCP) or peer agent (A2A) needs to call NetIQ for itself.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="border-outline-variant min-w-0 space-y-5 rounded-lg border p-4">
          <header>
            <div>
              <h2 className="text-on-surface text-base font-medium">1. Setup</h2>
            </div>
          </header>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-on-surface-variant text-xs">Protocol</label>
              <ProtocolSelector protocol={protocol} onChange={setProtocol} />
            </div>

            <div className="space-y-2">
              <label className="text-on-surface-variant text-xs">Mode</label>
              <ModeSelector mode={mode} onChange={setMode} />
            </div>

            <div className="space-y-2">
              <label className="text-on-surface-variant text-xs">Scenario</label>
              <select
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value)}
                className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-full rounded-md border px-3 py-2 text-sm outline-none"
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-on-surface-variant text-xs">
                API key <span className="opacity-70">(optional)</span>
              </label>
              <input
                type="password"
                value={manualKey}
                onChange={(e) => setManualKey(e.target.value)}
                spellCheck={false}
                placeholder="Leave empty if the API allows anonymous access"
                autoComplete="off"
                className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-full rounded-md border px-3 py-2 font-mono text-xs outline-none"
              />
              <p className="text-on-surface-variant text-[11px] leading-snug">
                Omit unless your backend sets{" "}
                <code className="font-mono">REQUIRE_API_KEY=true</code> — then paste a key from{" "}
                <Link href="/console/keys" className="text-on-surface underline">
                  Keys
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="border-outline-variant min-w-0 space-y-5 rounded-lg border p-4">
          <header>
            <h2 className="text-on-surface text-base font-medium">
              {protocol === "rest"
                ? "2. Request"
                : protocol === "mcp"
                  ? "2. MCP integration"
                  : "2. A2A integration"}
            </h2>
            <p className="text-on-surface-variant text-xs">
              {protocol === "rest"
                ? "Edit the shared decision inputs and inspect the actual protocol envelope."
                : protocol === "mcp"
                  ? "Drop these snippets into your MCP-aware AI tool to let it call NetIQ as a tool."
                  : "Use these snippets in your peer agent to discover NetIQ and dispatch tasks over A2A."}
            </p>
          </header>

          {protocol === "rest" ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-on-surface-variant text-xs">Decision arguments</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  spellCheck={false}
                  className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface min-h-[150px] w-full rounded-md border p-3 font-mono text-xs leading-relaxed outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-on-surface-variant text-xs">
                  Wire request preview · REST
                </label>
                <div className="no-scrollbar max-h-[420px] space-y-3 overflow-auto pr-1">
                  {wireRequestPreview.map((step, i) => (
                    <div key={i} className="border-outline-variant overflow-hidden rounded-md border">
                      <div className="border-outline-variant bg-surface-container-low border-b px-3 py-2">
                        <div className="text-on-surface text-xs font-medium">{step.title}</div>
                        {step.subtitle ? (
                          <div className="text-on-surface-variant mt-0.5 text-[11px]">
                            {step.subtitle}
                          </div>
                        ) : null}
                      </div>
                      <pre className="bg-surface-container-low text-on-surface no-scrollbar overflow-auto p-3 font-mono text-xs leading-relaxed">
                        {step.content}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={streamState === "streaming"}
                onClick={() => void send()}
                className="bg-primary text-on-primary hover:opacity-90 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px] leading-none">
                  {streamState === "streaming" ? "graphic_eq" : "send"}
                </span>
                {streamState === "streaming" ? "Streaming…" : "Send REST request"}
              </button>
            </div>
          ) : protocol === "mcp" ? (
            <McpSetupPanel base={base} apiKey={manualKey} body={body} mode={mode} />
          ) : (
            <A2aSetupPanel base={base} apiKey={manualKey} body={body} mode={mode} />
          )}
        </section>

        <section className="border-outline-variant min-w-0 space-y-5 rounded-lg border p-4">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-on-surface text-base font-medium">
                {protocol === "rest" ? "3. Results" : "3. Expected response"}
              </h2>
              <p className="text-on-surface-variant text-xs">
                {protocol === "rest"
                  ? "Response, decision summary, and live execution stay together here."
                  : "What your tool / agent will receive back from NetIQ for these inputs."}
              </p>
            </div>
            <p className="text-on-surface-variant text-xs">
              See full shapes on the{" "}
              <Link href="/console/docs" className="text-on-surface underline">
                docs
              </Link>{" "}
              page.
            </p>
          </header>

          {protocol === "rest" ? (
            <div className="space-y-5">
              <div className="space-y-4">
                <div className="border-outline-variant overflow-hidden rounded-md border">
                  <div className="border-outline-variant bg-surface-container-low flex items-center justify-between gap-3 border-b px-3 py-2">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-on-surface-variant">Status</span>
                      <span
                        className={`font-mono ${
                          httpStatus && httpStatus >= 400 ? "text-error" : "text-on-surface"
                        }`}
                      >
                        {httpStatus ? httpStatus : "—"}
                      </span>
                      <span className="text-on-surface-variant">·</span>
                      <span className="text-on-surface-variant">Latency</span>
                      <span className="text-on-surface font-mono">{latencyMs != null ? `${latencyMs} ms` : "—"}</span>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => void copyOut()}
                        disabled={!out}
                        className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 text-xs transition-colors disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-[14px] leading-none">content_copy</span>
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={downloadOut}
                        disabled={!out}
                        className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 text-xs transition-colors disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-[14px] leading-none">download</span>
                        Download
                      </button>
                    </div>
                  </div>
                  <pre className="bg-surface-container-low text-on-surface no-scrollbar max-h-[300px] min-h-[220px] overflow-auto p-3 font-mono text-xs leading-relaxed">
                    {out || (
                      <span className="text-on-surface-variant">
                        Run the simulator to see the response.
                      </span>
                    )}
                  </pre>
                </div>

                {decision ? (
                  <div className="space-y-3">
                    <div className="border-outline-variant grid grid-cols-1 gap-4 rounded-md border p-4 sm:grid-cols-3 sm:gap-x-6">
                      <DecisionStat decision={decision} />
                      <ConfidenceStat value={confidence} />
                      <RiskStat value={riskScore} />
                    </div>
                    <div className="border-outline-variant rounded-md border p-4">
                      <div className="text-on-surface-variant text-xs">Explanation</div>
                      <p className="text-on-surface mt-1 text-sm leading-relaxed">
                        {explanation ?? "No explanation was returned for this decision."}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-5">
                <div className="border-outline-variant bg-surface-container-low rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-on-surface text-sm font-medium">Execution</h3>
                        {streamState === "streaming" ? (
                          <span className="bg-warning/15 text-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                            <span className="bg-warning animate-pulse-soft h-1.5 w-1.5 rounded-full" />
                            Live
                          </span>
                        ) : null}
                        {liveFallback ? (
                          <span className="bg-error/15 text-error inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                            Fallback
                          </span>
                        ) : null}
                      </div>
                      <p className="text-on-surface-variant text-xs">
                        {streamState === "idle" && !agentic
                          ? "Run the simulator to inspect agent dispatch, memory, flow, and trace."
                          : `${liveSteps.length} trace event${liveSteps.length === 1 ? "" : "s"} captured.`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExecutionOpen(true)}
                      disabled={streamState === "idle" && !agentic && liveSteps.length === 0}
                      className="border-outline-variant text-on-surface hover:bg-surface-container-high inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
                    >
                      {streamState === "streaming" ? (
                        <span className="border-warning h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent" />
                      ) : (
                        <span className="material-symbols-outlined text-[14px] leading-none">open_in_full</span>
                      )}
                      View execution
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <ExpectedResponsePanel protocol={protocol} body={body} mode={mode} />
          )}
        </section>
        </div>

        {executionOpen ? (
          <ExecutionModal
            agentic={agentic}
            liveMemory={liveMemory}
            liveSteps={liveSteps}
            currentTool={currentTool}
            streamState={streamState}
            liveFallback={liveFallback}
            liveDecision={liveDecision}
            mode={mode}
            onClose={() => setExecutionOpen(false)}
          />
        ) : null}
      </div>
    </ConsolePage>
  );
}

function ExecutionModal({
  agentic,
  liveMemory,
  liveSteps,
  currentTool,
  streamState,
  liveFallback,
  liveDecision,
  mode,
  onClose,
}: {
  agentic: DecisionResponse | null;
  liveMemory: MemoryInfluence | null;
  liveSteps: LiveStep[];
  currentTool: string | null;
  streamState: StreamState;
  liveFallback: string | null;
  liveDecision: { reasoning_summary?: string } | null;
  mode: Mode;
  onClose: () => void;
}) {
  const liveAgents = Array.from(
    new Set(
      liveSteps
        .filter((s): s is Extract<LiveStep, { kind: "tool" }> => s.kind === "tool")
        .map((s) => s.tool),
    ),
  );
  const liveApiCalls = liveSteps
    .filter((s): s is Extract<LiveStep, { kind: "tool" }> => s.kind === "tool")
    .map((s) => s.tool);

  const protocolSteps = liveSteps.filter(
    (s): s is Extract<LiveStep, { kind: "protocol" }> => s.kind === "protocol",
  );
  const traceSteps = liveSteps.filter((s) => s.kind !== "protocol");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface text-on-surface border-outline-variant flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border shadow-xl">
        <header className="border-outline-variant flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-on-surface text-lg font-medium">Execution</h2>
              {streamState === "streaming" ? (
                <span className="bg-warning/15 text-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                  <span className="bg-warning animate-pulse-soft h-1.5 w-1.5 rounded-full" />
                  Live
                </span>
              ) : null}
              {liveFallback ? (
                <span className="bg-error/15 text-error inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                  Fallback ({liveFallback})
                </span>
              ) : null}
            </div>
            <p className="text-on-surface-variant text-xs">
              {agentic?.reasoning_summary ?? liveDecision?.reasoning_summary ?? "Protocol handshake, agent dispatch, memory influence, flow, and trace."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">close</span>
            Close
          </button>
        </header>

        <div className="no-scrollbar flex-1 space-y-5 overflow-auto p-5">
          {protocolSteps.length > 0 ? (
            <ProtocolStepsPanel steps={protocolSteps} streaming={streamState === "streaming"} />
          ) : null}

          {agentic ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <SelectedAgentsCard
                agents={agentic.selected_agents ?? []}
                apiCalls={agentic.api_calls ?? []}
              />
              <MemoryInfluenceCard influence={agentic.memory_influence} />
              <PolicyAppliedCard applied={agentic.policy_applied} mode={agentic.mode ?? mode} />
            </div>
          ) : liveMemory ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <SelectedAgentsCard agents={liveAgents} apiCalls={liveApiCalls} />
              <MemoryInfluenceCard influence={liveMemory} />
              <PolicyAppliedCard applied={undefined} mode={mode} />
            </div>
          ) : null}

          {agentic ? <FlowDiagram viz={agentic.visualization_payload} /> : null}

          <LiveTracePanel
            steps={traceSteps}
            currentTool={currentTool}
            streaming={streamState === "streaming"}
          />
        </div>
      </div>
    </div>
  );
}

function ProtocolStepsPanel({
  steps,
  streaming,
}: {
  steps: Extract<LiveStep, { kind: "protocol" }>[];
  streaming: boolean;
}) {
  return (
    <div className="border-outline-variant rounded-md border">
      <div className="border-outline-variant bg-surface-container-low text-on-surface-variant flex items-center justify-between gap-3 border-b px-4 py-2 text-xs">
        <span>Protocol steps</span>
        {streaming ? (
          <span className="inline-flex items-center gap-1">
            <span className="bg-warning animate-pulse-soft h-1.5 w-1.5 rounded-full" />
            <span className="text-warning">handshake in progress…</span>
          </span>
        ) : null}
      </div>
      <ol className="divide-outline-variant divide-y">
        {steps.map((row, idx) => {
          const tone: Tone =
            row.status === "complete"
              ? "success"
              : row.status === "error"
                ? "error"
                : "warning";
          const icon =
            row.status === "complete"
              ? "check_circle"
              : row.status === "error"
                ? "error"
                : "more_horiz";
          return (
            <li
              key={`${idx}-${row.phase}`}
              className="animate-fade-slide-in grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[40px_minmax(0,8rem)_1fr] sm:gap-3 sm:px-4 md:grid-cols-[40px_220px_1fr]"
            >
              <span className="text-on-surface-variant font-mono text-xs">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${toneClass(tone)}`}>
                <span
                  className={`material-symbols-outlined text-[14px] leading-none ${
                    row.status === "pending" ? "animate-pulse-soft" : ""
                  }`}
                >
                  {icon}
                </span>
                {row.label}
              </span>
              <div className="text-on-surface-variant text-sm leading-relaxed">
                {row.detail ? <div className="font-mono text-[11px]">{row.detail}</div> : null}
                {row.payload ? (
                  <details className="mt-1 text-[11px]">
                    <summary className="cursor-pointer">view payload</summary>
                    <pre className="text-on-surface bg-surface-container-low mt-1 max-h-48 overflow-auto rounded p-2 font-mono text-[11px]">
                      {typeof row.payload === "string"
                        ? row.payload
                        : JSON.stringify(row.payload, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mode selector                                                              */
/* -------------------------------------------------------------------------- */

function ModeSelector({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const opts: { id: Mode; label: string }[] = [
    { id: "policy", label: "Policy mode" },
    { id: "agent", label: "Agent mode" },
  ];
  return (
    <div className="border-outline-variant inline-flex w-full items-stretch overflow-hidden rounded-md border text-sm">
      {opts.map((o) => {
        const active = mode === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`flex-1 px-3 py-2 transition-colors ${
              active
                ? "bg-on-surface text-background font-medium"
                : "text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ProtocolSelector({
  protocol,
  onChange,
}: {
  protocol: Protocol;
  onChange: (p: Protocol) => void;
}) {
  const opts: { id: Protocol; label: string; icon: string }[] = [
    { id: "rest", label: "REST", icon: "language" },
    { id: "mcp", label: "MCP", icon: "hub" },
    { id: "a2a", label: "A2A", icon: "dns" },
  ];
  return (
    <div className="border-outline-variant inline-flex w-full items-stretch overflow-hidden rounded-md border text-sm">
      {opts.map((o) => {
        const active = protocol === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`flex-1 px-3 py-2 transition-colors ${
              active
                ? "bg-on-surface text-background font-medium"
                : "text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] leading-none">{o.icon}</span>
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Decision stat tiles                                                        */
/* -------------------------------------------------------------------------- */

type Tone = "success" | "warning" | "error" | "neutral";

function toneClass(tone: Tone) {
  if (tone === "success") return "text-success";
  if (tone === "warning") return "text-warning";
  if (tone === "error") return "text-error";
  return "text-on-surface";
}

function DecisionStat({ decision }: { decision: string }) {
  const map: Record<string, { tone: Tone; icon: string; label: string }> = {
    ALLOW: { tone: "success", icon: "check_circle", label: "Allow" },
    BLOCK: { tone: "error", icon: "block", label: "Block" },
    VERIFY: { tone: "warning", icon: "verified_user", label: "Verify" },
    PRIORITIZE: { tone: "warning", icon: "priority_high", label: "Prioritize" },
    DEGRADE: { tone: "warning", icon: "network_check", label: "Degrade" },
  };
  const v = map[decision] ?? { tone: "neutral" as Tone, icon: "help", label: decision };
  return (
    <div className="space-y-1">
      <div className="text-on-surface-variant text-xs">Decision</div>
      <div className={`inline-flex items-center gap-1.5 text-sm font-medium ${toneClass(v.tone)}`}>
        <span className="material-symbols-outlined text-[16px] leading-none">{v.icon}</span>
        {v.label}
      </div>
    </div>
  );
}

function ConfidenceStat({ value }: { value: number | null }) {
  if (value == null) return <PlainStat label="Confidence" value="—" />;
  const tone: Tone = value >= 80 ? "success" : value >= 50 ? "warning" : "error";
  const icon = tone === "success" ? "trending_up" : tone === "warning" ? "trending_flat" : "trending_down";
  return (
    <div className="space-y-1">
      <div className="text-on-surface-variant text-xs">Confidence</div>
      <div className={`inline-flex items-center gap-1.5 text-sm font-medium tabular-nums ${toneClass(tone)}`}>
        <span className="material-symbols-outlined text-[16px] leading-none">{icon}</span>
        {value}%
      </div>
    </div>
  );
}

function RiskStat({ value }: { value: number | null }) {
  if (value == null) return <PlainStat label="Risk" value="—" />;
  const tone: Tone = value >= 70 ? "error" : value >= 30 ? "warning" : "success";
  const icon = tone === "error" ? "warning" : tone === "warning" ? "info" : "shield";
  return (
    <div className="space-y-1">
      <div className="text-on-surface-variant text-xs">Risk</div>
      <div className={`inline-flex items-center gap-1.5 text-sm font-medium tabular-nums ${toneClass(tone)}`}>
        <span className="material-symbols-outlined text-[16px] leading-none">{icon}</span>
        {value}
      </div>
    </div>
  );
}

function PlainStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-on-surface-variant text-xs">{label}</div>
      <div className="text-on-surface-variant font-mono text-sm">{value}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Execution panels                                                           */
/* -------------------------------------------------------------------------- */

function SelectedAgentsCard({ agents, apiCalls }: { agents: string[]; apiCalls: string[] }) {
  return (
    <div className="border-outline-variant space-y-3 rounded-md border p-4">
      <div className="text-on-surface-variant text-xs">Agents dispatched</div>
      <div className="flex flex-wrap gap-1.5">
        {agents.length === 0 ? (
          <span className="text-on-surface-variant text-sm">None</span>
        ) : (
          agents.map((a) => (
            <span
              key={a}
              className="bg-surface-container-high text-on-surface inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
            >
              <span className="material-symbols-outlined text-[14px] leading-none">smart_toy</span>
              {a}
            </span>
          ))
        )}
      </div>
      <div className="text-on-surface-variant text-xs">
        CAMARA calls{" "}
        <span className="text-on-surface font-mono">{apiCalls.length}</span>
        {apiCalls.length ? `: ${apiCalls.join(", ")}` : null}
      </div>
    </div>
  );
}

function MemoryInfluenceCard({ influence }: { influence?: MemoryInfluence }) {
  const weight = influence?.global_risk_weight ?? 0;
  const score = influence?.global_risk_score ?? 0;
  const sector = influence?.primary_sector ?? "—";
  const adj = influence?.sector_adjustment ?? {};
  const events = influence?.events_consulted ?? [];
  const weightTone: Tone = weight >= 0.7 ? "warning" : weight >= 0.4 ? "neutral" : "success";
  return (
    <div className="border-outline-variant space-y-3 rounded-md border p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-on-surface-variant text-xs">Memory influence</div>
        <span className={`text-xs font-medium ${toneClass(weightTone)}`}>weight {weight}</span>
      </div>
      <div className="text-on-surface-variant grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <span>Primary sector</span>
        <span className="text-on-surface text-right font-mono">{sector}</span>
        <span>Global risk score</span>
        <span className="text-on-surface text-right font-mono tabular-nums">{Math.round(score)}</span>
      </div>
      {Object.keys(adj).length > 0 ? (
        <div className="space-y-1">
          <div className="text-on-surface-variant text-xs">Per-sector adjustment</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(adj).map(([k, v]) => (
              <span
                key={k}
                className="bg-surface-container-low text-on-surface-variant rounded px-1.5 py-0.5 font-mono text-[11px]"
              >
                {k}: {Number(v).toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {events.length > 0 ? (
        <ul className="space-y-0.5">
          {events.slice(-3).map((e, i) => (
            <li key={i} className="text-on-surface-variant font-mono text-[11px]">
              {e.type ?? "—"}
              {e.ts ? <span className="opacity-60"> @ {String(e.ts).slice(11, 19)}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-on-surface-variant text-xs italic">No prior memory for this phone yet.</div>
      )}
    </div>
  );
}

function PolicyAppliedCard({
  applied,
  mode,
}: {
  applied?: { rule_id?: string | null; source?: string };
  mode?: Mode;
}) {
  return (
    <div className="border-outline-variant space-y-3 rounded-md border p-4">
      <div className="text-on-surface-variant text-xs">Decision source</div>
      <div className="text-on-surface text-sm font-medium capitalize">
        {mode === "agent" ? "Agent (DecisionAgent)" : "Tenant policy engine"}
      </div>
      {mode === "policy" ? (
        <>
          <div className="text-on-surface-variant text-xs">Rule matched</div>
          <div className="text-on-surface font-mono text-xs">{applied?.rule_id ?? "default"}</div>
          <div className="text-on-surface-variant text-xs">Source</div>
          <div className="text-on-surface font-mono text-xs">{applied?.source ?? "—"}</div>
        </>
      ) : null}
    </div>
  );
}

function FlowDiagram({ viz }: { viz?: VisualizationPayload }) {
  const nodes = viz?.nodes ?? [];
  const edges = viz?.edges ?? [];
  if (nodes.length === 0) return null;

  const colIdx = (n: string): number => {
    if (n === "User") return 0;
    if (n === "OrchestratorAgent") return 1;
    if (n === "DecisionAgent" || n === "CAMARA APIs") return 3;
    if (n === "Output") return 4;
    return 2;
  };
  const columns: string[][] = [[], [], [], [], []];
  for (const n of nodes) {
    const c = colIdx(n);
    if (!columns[c].includes(n)) columns[c].push(n);
  }

  return (
    <div className="border-outline-variant rounded-md border p-5">
      <div className="text-on-surface-variant mb-4 text-xs">Agent flow</div>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-5">
        {columns.map((col, ci) => (
          <div key={ci} className="space-y-2">
            {col.map((n) => (
              <div
                key={n}
                className={`border-outline-variant rounded-md border px-3 py-2 text-center text-xs ${
                  n === "DecisionAgent"
                    ? "bg-on-surface text-background border-on-surface font-medium"
                    : n === "Output"
                      ? "bg-success/10 border-success/30 text-on-surface"
                      : n === "OrchestratorAgent"
                        ? "bg-surface-container-high text-on-surface font-medium"
                        : "bg-surface-container-low text-on-surface-variant"
                }`}
              >
                {n}
              </div>
            ))}
          </div>
        ))}
      </div>
      {edges.length > 0 ? (
        <details className="text-on-surface-variant mt-4 text-xs">
          <summary className="cursor-pointer">{edges.length} edges</summary>
          <ul className="mt-2 space-y-0.5 font-mono text-[11px]">
            {edges.map((e, i) => (
              <li key={i}>
                {e.from} → {e.to}
                {e.label ? <span className="opacity-60"> ({e.label})</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function LiveTracePanel({
  steps,
  currentTool,
  streaming,
}: {
  steps: LiveStep[];
  currentTool: string | null;
  streaming: boolean;
}) {
  if (steps.length === 0 && !streaming) return null;

  return (
    <div className="border-outline-variant rounded-md border">
      <div className="border-outline-variant bg-surface-container-low text-on-surface-variant flex items-center justify-between gap-3 border-b px-4 py-2 text-xs">
        <span>Execution trace</span>
        {streaming ? (
          <span className="inline-flex items-center gap-1">
            <span className="bg-warning animate-pulse-soft h-1.5 w-1.5 rounded-full" />
            <span className="text-warning">streaming…</span>
          </span>
        ) : null}
      </div>
      <ol className="divide-outline-variant divide-y">
        {steps.map((row, idx) => (
          <li
            key={`${idx}-${row.kind}`}
            className="animate-fade-slide-in grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[40px_minmax(0,7.5rem)_1fr] sm:gap-3 sm:px-4 md:grid-cols-[40px_200px_1fr]"
          >
            {row.kind === "tool" ? (
              <ToolStepRow row={row} />
            ) : row.kind === "trace" ? (
              <TraceStepRow row={row.step} />
            ) : row.kind === "info" ? (
              <InfoRow message={row.message} />
            ) : null}
          </li>
        ))}
        {streaming && currentTool ? (
          <li className="animate-fade-slide-in grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[40px_minmax(0,7.5rem)_1fr] sm:gap-3 sm:px-4 md:grid-cols-[40px_200px_1fr]">
            <span className="text-on-surface-variant font-mono text-xs">…</span>
            <span className="text-warning inline-flex items-center gap-1.5 text-sm font-medium">
              <span className="material-symbols-outlined animate-pulse-soft text-[14px] leading-none">
                radio_button_checked
              </span>
              Calling {currentTool}
            </span>
            <span className="text-on-surface-variant text-xs italic">awaiting result…</span>
          </li>
        ) : null}
      </ol>
    </div>
  );
}

function ToolStepRow({
  row,
}: {
  row: Extract<LiveStep, { kind: "tool" }>;
}) {
  const pending = row.status === "pending";
  const tone: Tone = row.degraded ? "warning" : pending ? "neutral" : "success";
  const icon = pending ? "more_horiz" : row.degraded ? "error" : "check_circle";
  return (
    <>
      <span className="text-on-surface-variant font-mono text-xs">#{row.step}</span>
      <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${toneClass(tone)}`}>
        <span className="material-symbols-outlined text-[14px] leading-none">{icon}</span>
        {row.tool}
      </span>
      <div className="text-on-surface-variant text-sm leading-relaxed">
        {pending ? (
          <span className="italic">awaiting result…</span>
        ) : (
          <ResultPreview result={row.result} degraded={!!row.degraded} />
        )}
      </div>
    </>
  );
}

function TraceStepRow({ row }: { row: TraceStep }) {
  return (
    <>
      <span className="text-on-surface-variant font-mono text-xs">#{row.step}</span>
      <span className="text-on-surface inline-flex items-center gap-1.5 text-sm font-medium">
        <span className="material-symbols-outlined text-[14px] leading-none">smart_toy</span>
        {row.agent}
      </span>
      <div className="text-on-surface-variant text-sm leading-relaxed">
        <div>{row.action}</div>
        {row.result !== undefined ? (
          <div className="text-on-surface-variant mt-0.5 font-mono text-[11px]">
            → {typeof row.result === "string" ? row.result : JSON.stringify(row.result)}
          </div>
        ) : null}
      </div>
    </>
  );
}

function InfoRow({ message }: { message: string }) {
  return (
    <>
      <span className="text-on-surface-variant font-mono text-xs">!</span>
      <span className="text-warning inline-flex items-center gap-1.5 text-sm font-medium">
        <span className="material-symbols-outlined text-[14px] leading-none">info</span>
        Notice
      </span>
      <div className="text-on-surface-variant text-sm leading-relaxed italic">{message}</div>
    </>
  );
}

function ResultPreview({ result, degraded }: { result: unknown; degraded: boolean }) {
  if (degraded) {
    const err =
      result && typeof result === "object" && "_error" in (result as Record<string, unknown>)
        ? String((result as Record<string, unknown>)._error)
        : "signal degraded";
    return (
      <span className="text-warning text-xs">degraded — {err}</span>
    );
  }
  const compact = typeof result === "string" ? result : JSON.stringify(result);
  const trimmed = compact && compact.length > 140 ? `${compact.slice(0, 140)}…` : compact;
  return <span className="font-mono text-[11px]">→ {trimmed ?? "—"}</span>;
}

/* -------------------------------------------------------------------------- */
/* Integration snippets (MCP / A2A)                                            */
/* -------------------------------------------------------------------------- */

function safeParseArgs(rawBody: string): Record<string, unknown> {
  try {
    const v = JSON.parse(rawBody) as Record<string, unknown>;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function Snippet({
  title,
  subtitle,
  content,
  language,
}: {
  title: string;
  subtitle?: string;
  content: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function doCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="border-outline-variant overflow-hidden rounded-md border">
      <div className="border-outline-variant bg-surface-container-low flex items-start justify-between gap-3 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="text-on-surface text-xs font-medium">{title}</div>
          {subtitle ? (
            <div className="text-on-surface-variant mt-0.5 text-[11px]">{subtitle}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {language ? (
            <span className="text-on-surface-variant font-mono text-[10px] uppercase">
              {language}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void doCopy()}
            className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 text-xs transition-colors"
          >
            <span className="material-symbols-outlined text-[14px] leading-none">
              {copied ? "check" : "content_copy"}
            </span>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="bg-surface-container-low text-on-surface no-scrollbar max-h-[320px] overflow-auto p-3 font-mono text-xs leading-relaxed">
        {content}
      </pre>
    </div>
  );
}

function McpSetupPanel({
  base,
  apiKey,
  body,
  mode,
}: {
  base: string;
  apiKey: string;
  body: string;
  mode: Mode;
}) {
  const args = safeParseArgs(body);
  const callArgs = { ...args, mode } as Record<string, unknown>;
  const keyTrim = apiKey.trim();

  const stdioServerBlock: Record<string, unknown> = {
    command: "python",
    args: ["/absolute/path/to/netiq/mcp_server.py"],
  };
  if (keyTrim) {
    (stdioServerBlock as { env: Record<string, string> }).env = { NETIQ_API_KEY: keyTrim };
  }

  const stdioConfig = JSON.stringify(
    {
      mcpServers: {
        netiq: stdioServerBlock,
      },
    },
    null,
    2,
  );

  const authLine = keyTrim ? `  -H "Authorization: Bearer ${keyTrim}" \\\n` : "";
  const httpListCurl = `curl -X POST ${base}/mcp \\
${authLine}  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }, null, 2)}'`;

  const httpCallCurl = `curl -X POST ${base}/mcp \\
${authLine}  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "decide", arguments: callArgs },
    },
    null,
    2,
  )}'`;

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="text-on-surface text-xs font-medium">A. Stdio (Claude Desktop / Cursor)</div>
        <p className="text-on-surface-variant text-xs">
          Add this to your client&apos;s MCP servers config.{" "}
          <code className="font-mono text-[11px]">NETIQ_API_KEY</code> is optional when the NetIQ
          API allows anonymous access (
          <code className="font-mono text-[11px]">REQUIRE_API_KEY=false</code>).
        </p>
        <Snippet
          title="claude_desktop_config.json / Cursor mcp.json"
          subtitle="Replace the path with where you cloned NetIQ."
          content={stdioConfig}
          language="json"
        />
      </div>

      <div className="space-y-3">
        <div className="text-on-surface text-xs font-medium">B. HTTP transport</div>
        <p className="text-on-surface-variant text-xs">
          For clients that speak the MCP HTTP transport. Include Bearer auth only when your API
          requires keys. Run <code className="font-mono text-[11px]">tools/list</code> first to
          discover, then <code className="font-mono text-[11px]">tools/call</code> to invoke.
        </p>
        <Snippet
          title="1. tools/list — discover NetIQ tools"
          content={httpListCurl}
          language="bash"
        />
        <Snippet
          title="2. tools/call — invoke decide"
          subtitle="Arguments come from the Setup column (scenario, mode, decision args)."
          content={httpCallCurl}
          language="bash"
        />
      </div>
    </div>
  );
}

function A2aSetupPanel({
  base,
  apiKey,
  body,
  mode,
}: {
  base: string;
  apiKey: string;
  body: string;
  mode: Mode;
}) {
  const args = safeParseArgs(body);
  const taskArgs = { skill: "decide", ...args, mode } as Record<string, unknown>;
  const keyTrim = apiKey.trim();
  const authLine = keyTrim ? `  -H "Authorization: Bearer ${keyTrim}" \\\n` : "";

  const cardCurl = `curl ${base}/.well-known/agent.json`;

  const sendCurl = `curl -X POST ${base}/a2a/tasks/send \\
${authLine}  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      id: "task-001",
      sessionId: "sess-001",
      message: {
        role: "user",
        parts: [{ type: "data", data: taskArgs }],
      },
    },
    null,
    2,
  )}'`;

  const streamCurl = `curl -N -X POST ${base}/a2a/tasks/sendSubscribe \\
${authLine}  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      id: "task-002",
      message: {
        role: "user",
        parts: [{ type: "data", data: taskArgs }],
      },
    },
    null,
    2,
  )}'`;

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="text-on-surface text-xs font-medium">A. Discover NetIQ via Agent Card</div>
        <p className="text-on-surface-variant text-xs">
          Peer agents read the public Agent Card to learn NetIQ&apos;s skills (decide,
          evaluate_policy, lookup_phone_history), auth scheme, and streaming support.
        </p>
        <Snippet
          title="GET /.well-known/agent.json"
          subtitle="No auth required."
          content={cardCurl}
          language="bash"
        />
      </div>

      <div className="space-y-3">
        <div className="text-on-surface text-xs font-medium">B. Send a task</div>
        <p className="text-on-surface-variant text-xs">
          Wrap the shared decision arguments in an A2A task envelope as a structured DataPart. Add
          Bearer auth only when your API requires keys. Use sync or streaming depending on whether
          your agent wants live progress.
        </p>
        <Snippet
          title="POST /a2a/tasks/send · synchronous"
          content={sendCurl}
          language="bash"
        />
        <Snippet
          title="POST /a2a/tasks/sendSubscribe · streaming SSE"
          subtitle="Lifecycle: TaskStatusUpdateEvent (submitted → working → completed) + TaskArtifactUpdateEvent frames."
          content={streamCurl}
          language="bash"
        />
      </div>
    </div>
  );
}

function ExpectedResponsePanel({
  protocol,
  body,
  mode,
}: {
  protocol: Protocol;
  body: string;
  mode: Mode;
}) {
  const args = safeParseArgs(body);
  const intent = String(args.intent ?? "fraud_prevention");
  const phone = String(args.phone ?? "+233201234567");

  const decisionCore = {
    decision: "VERIFY",
    confidence: 0.66,
    risk_score: 56.1,
    reason: "Moderate fraud risk — step-up required; Recent SIM swap detected",
    reasoning_summary:
      "Decision=VERIFY via RiskAgent, NetworkAgent. Memory weight=0.85 (sector=finance).",
    intent,
    phone,
    mode,
    selected_agents: ["RiskAgent", "NetworkAgent"],
    api_calls: ["sim_swap", "device_swap", "number_verification"],
    memory_influence: {
      global_risk_weight: 0.85,
      primary_sector: "finance",
      sector_adjustment: { finance: 0.72 },
    },
    duration_ms: 5436.12,
  };

  if (protocol === "mcp") {
    const mcpEnvelope = {
      jsonrpc: "2.0",
      id: 2,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(decisionCore, null, 2),
          },
        ],
        isError: false,
      },
    };
    return (
      <div className="space-y-4">
        <p className="text-on-surface-variant text-xs">
          NetIQ wraps the decision JSON inside the MCP{" "}
          <code className="font-mono text-[11px]">result.content[0].text</code> field. Most MCP
          clients re-parse that string and surface the structured data to the LLM.
        </p>
        <Snippet
          title="POST /mcp · tools/call response"
          subtitle="JSON-RPC 2.0 envelope around the decide tool's structured output."
          content={JSON.stringify(mcpEnvelope, null, 2)}
          language="json"
        />
      </div>
    );
  }

  const a2aEnvelope = {
    id: "task-001",
    sessionId: "sess-001",
    status: {
      state: "completed",
      timestamp: "2026-05-07T10:00:00Z",
      message: {
        role: "agent",
        parts: [
          {
            type: "text",
            text: `Decision: ${decisionCore.decision} (confidence ${decisionCore.confidence.toFixed(2)}, risk ${decisionCore.risk_score.toFixed(1)}). ${decisionCore.reason}`,
          },
        ],
      },
    },
    artifacts: [
      {
        name: "decide",
        parts: [{ type: "data", data: decisionCore }],
      },
    ],
    metadata: {},
  };

  return (
    <div className="space-y-4">
      <p className="text-on-surface-variant text-xs">
        A2A returns a task envelope with a status frame and one or more artifacts. The decision
        lives at <code className="font-mono text-[11px]">artifacts[0].parts[0].data</code>.
      </p>
      <Snippet
        title="POST /a2a/tasks/send · completed task"
        subtitle="Streaming variant emits the same shape across multiple SSE frames."
        content={JSON.stringify(a2aEnvelope, null, 2)}
        language="json"
      />
    </div>
  );
}
