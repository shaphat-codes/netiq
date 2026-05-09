"use client";

import { useCallback, useMemo, useState } from "react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { DecisionBadge } from "@/components/console/DecisionBadge";

/* -------------------------------------------------------------------------- */
/* A2A wire types (subset that the Flask backend returns)                     */
/* -------------------------------------------------------------------------- */

type AgentSkill = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  inputModes?: string[];
  outputModes?: string[];
};

type AgentCard = {
  name?: string;
  description?: string;
  version?: string;
  url?: string;
  documentationUrl?: string;
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  authentication?: { schemes?: string[]; credentials?: string };
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills?: AgentSkill[];
};

type ArtifactPart = {
  type?: string;
  data?: Record<string, unknown>;
  text?: string;
};

type Artifact = {
  name?: string;
  parts?: ArtifactPart[];
};

type TaskEnvelope = {
  id?: string;
  sessionId?: string | null;
  status?: {
    state?: string;
    timestamp?: string;
    message?: { role?: string; parts?: { type?: string; text?: string }[] };
  };
  artifacts?: Artifact[];
  metadata?: Record<string, unknown>;
};

type DecisionArtifactData = {
  decision?: string;
  confidence?: number;
  risk_score?: number;
  reason?: string;
  event_id?: number;
  intent?: string;
  raw_intent?: string;
  duration_ms?: number;
  selected_agents?: string[];
  api_calls?: string[];
};

/* -------------------------------------------------------------------------- */
/* Scenarios                                                                  */
/* -------------------------------------------------------------------------- */

type Skill = "decide" | "evaluate_policy" | "lookup_phone_history";

type Scenario = {
  id: string;
  label: string;
  hint: string;
  skill: Skill;
  intent: string;
  phone: string;
  mode: "agent" | "policy";
  contextJson: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "payment",
    label: "High-value payment",
    hint: "Expected: BLOCK / VERIFY — recent SIM swap signals.",
    skill: "decide",
    intent: "payment",
    phone: "+9999999103",
    mode: "agent",
    contextJson: JSON.stringify(
      { amount: 25000, currency: "GHS", purpose: "purchase of bag of cassava" },
      null,
      2,
    ),
  },
  {
    id: "emergency",
    label: "Emergency dispatch",
    hint: "Expected: PRIORITIZE — emergency response intent.",
    skill: "decide",
    intent: "emergency medical response",
    phone: "+9999999103",
    mode: "agent",
    contextJson: JSON.stringify(
      {
        claimed_location: "Accra, Ghana",
        request_type: "ambulance dispatch",
        urgency: "high",
      },
      null,
      2,
    ),
  },
  {
    id: "fraud",
    label: "Onboarding fraud check",
    hint: "Expected: ALLOW / VERIFY — light-touch fraud screen.",
    skill: "decide",
    intent: "fraud_prevention",
    phone: "+233241234567",
    mode: "agent",
    contextJson: JSON.stringify(
      { amount: 500, compliance_mode: "relaxed" },
      null,
      2,
    ),
  },
  {
    id: "history",
    label: "Lookup phone history",
    hint: "Read-only cross-sector memory lookup.",
    skill: "lookup_phone_history",
    intent: "",
    phone: "+9999999103",
    mode: "agent",
    contextJson: "{}",
  },
];

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function A2ADemoPage() {
  // --- Discovery ---------------------------------------------------------
  const [card, setCard] = useState<AgentCard | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardLoading, setCardLoading] = useState(false);

  // --- Send task ---------------------------------------------------------
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [skill, setSkill] = useState<Skill>(SCENARIOS[0].skill);
  const [intent, setIntent] = useState(SCENARIOS[0].intent);
  const [phone, setPhone] = useState(SCENARIOS[0].phone);
  const [mode, setMode] = useState<"agent" | "policy">(SCENARIOS[0].mode);
  const [contextJson, setContextJson] = useState(SCENARIOS[0].contextJson);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [requestEnvelope, setRequestEnvelope] = useState<unknown>(null);
  const [taskResponse, setTaskResponse] = useState<TaskEnvelope | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastTaskId, setLastTaskId] = useState("");

  // --- Replay ------------------------------------------------------------
  const [lookupId, setLookupId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResponse, setLookupResponse] = useState<TaskEnvelope | null>(null);

  /* ----- handlers ----- */

  const onScenarioChange = useCallback((id: string) => {
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) return;
    setScenarioId(id);
    setSkill(s.skill);
    setIntent(s.intent);
    setPhone(s.phone);
    setMode(s.mode);
    setContextJson(s.contextJson);
  }, []);

  const discoverAgent = useCallback(async () => {
    setCardLoading(true);
    setCardError(null);
    setCard(null);
    try {
      const res = await fetch("/api/netiq/a2a/card", {
        method: "GET",
        cache: "no-store",
      });
      const data = (await res.json()) as
        | { ok: true; card: AgentCard }
        | { ok: false; status: number; errors: string[] };
      if (!res.ok || !("card" in data)) {
        const errs = "errors" in data ? data.errors : ["Failed to fetch Agent Card"];
        setCardError(errs.join("; "));
        return;
      }
      setCard(data.card);
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err));
    } finally {
      setCardLoading(false);
    }
  }, []);

  const sendTask = useCallback(async () => {
    setSending(true);
    setSendError(null);
    setTaskResponse(null);
    setRequestEnvelope(null);
    setLatencyMs(null);

    let context: Record<string, unknown> = {};
    if (skill !== "lookup_phone_history") {
      const trimmed = contextJson.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            context = parsed as Record<string, unknown>;
          } else {
            setSendError("Context must be a JSON object.");
            setSending(false);
            return;
          }
        } catch {
          setSendError("Context is not valid JSON.");
          setSending(false);
          return;
        }
      }
    }

    const body: Record<string, unknown> = { skill, phone };
    if (skill !== "lookup_phone_history") {
      body.intent = intent;
      body.mode = mode;
      body.context = context;
    }

    const t0 = performance.now();
    try {
      const res = await fetch("/api/netiq/a2a/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok: boolean;
        status: number;
        request?: unknown;
        response?: TaskEnvelope;
        errors?: string[];
      };
      setLatencyMs(Math.round(performance.now() - t0));
      if (data.request) setRequestEnvelope(data.request);
      if (data.response) setTaskResponse(data.response);

      if (!res.ok || !data.ok) {
        const errs =
          (data.errors && data.errors.length ? data.errors : null) ??
          extractTaskErrors(data.response) ?? ["A2A task failed"];
        setSendError(errs.join("; "));
        return;
      }
      const resolvedId = data.response?.id ?? "";
      if (resolvedId) {
        setLastTaskId(resolvedId);
        setLookupId(resolvedId);
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }, [contextJson, intent, mode, phone, skill]);

  const lookupTask = useCallback(async () => {
    if (!lookupId.trim()) {
      setLookupError("Enter a task id first.");
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    setLookupResponse(null);
    try {
      const res = await fetch("/api/netiq/a2a/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lookupId.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        response?: TaskEnvelope;
        errors?: string[];
      };
      if (data.response) setLookupResponse(data.response);
      if (!res.ok || !data.ok) {
        const errs =
          (data.errors && data.errors.length ? data.errors : null) ??
          extractTaskErrors(data.response) ?? ["Task lookup failed"];
        setLookupError(errs.join("; "));
      }
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : String(err));
    } finally {
      setLookupLoading(false);
    }
  }, [lookupId]);

  /* ----- derived ----- */

  const decideArtifact = useMemo(
    () => extractDecisionArtifact(taskResponse),
    [taskResponse],
  );
  const lookupDecision = useMemo(
    () => extractDecisionArtifact(lookupResponse),
    [lookupResponse],
  );
  const taskState = taskResponse?.status?.state ?? null;
  const lookupState = lookupResponse?.status?.state ?? null;

  return (
    <ConsolePage title="A2A demo">
      <div className="space-y-12">
        <header className="space-y-1">
          <h1 className="text-on-surface text-2xl font-semibold tracking-tight">
            A2A demo
          </h1>
          <p className="text-on-surface-variant max-w-2xl text-sm">
            Drive NetIQ over the Agent-to-Agent protocol from this browser. The
            page acts as a peer agent: it discovers NetIQ via the public Agent
            Card, dispatches a task, and replays the audit trail by task id —
            mirroring{" "}
            <code className="text-on-surface font-mono text-xs">
              examples/a2a_client.py
            </code>
            .
          </p>
        </header>

        <DiscoverSection
          card={card}
          loading={cardLoading}
          error={cardError}
          onDiscover={() => void discoverAgent()}
        />

        <SendSection
          scenarioId={scenarioId}
          onScenarioChange={onScenarioChange}
          skill={skill}
          onSkillChange={setSkill}
          intent={intent}
          onIntentChange={setIntent}
          phone={phone}
          onPhoneChange={setPhone}
          mode={mode}
          onModeChange={setMode}
          contextJson={contextJson}
          onContextChange={setContextJson}
          sending={sending}
          onSend={() => void sendTask()}
          error={sendError}
          requestEnvelope={requestEnvelope}
          taskResponse={taskResponse}
          decideArtifact={decideArtifact}
          taskState={taskState}
          latencyMs={latencyMs}
        />

        <ReplaySection
          lookupId={lookupId}
          onLookupIdChange={setLookupId}
          loading={lookupLoading}
          onLookup={() => void lookupTask()}
          error={lookupError}
          taskResponse={lookupResponse}
          decision={lookupDecision}
          taskState={lookupState}
          lastTaskId={lastTaskId}
        />
      </div>
    </ConsolePage>
  );
}

/* -------------------------------------------------------------------------- */
/* Section: Discover                                                          */
/* -------------------------------------------------------------------------- */

function DiscoverSection({
  card,
  loading,
  error,
  onDiscover,
}: {
  card: AgentCard | null;
  loading: boolean;
  error: string | null;
  onDiscover: () => void;
}) {
  return (
    <section className="border-outline-variant rounded-md border">
      <header className="border-outline-variant flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-on-surface text-base font-medium">
            1. Discover NetIQ via Agent Card
          </h2>
          <p className="text-on-surface-variant text-xs">
            Public, no auth required. Reads{" "}
            <code className="font-mono text-[11px]">/.well-known/agent.json</code> to
            learn the skills and capabilities NetIQ advertises.
          </p>
        </div>
        <button
          type="button"
          onClick={onDiscover}
          disabled={loading}
          className="bg-primary text-on-primary hover:opacity-90 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px] leading-none">
            {loading ? "graphic_eq" : "travel_explore"}
          </span>
          {loading ? "Discovering…" : "Discover Agent"}
        </button>
      </header>
      <div className="space-y-4 p-4">
        {error ? <ErrorBanner message={error} /> : null}
        {!card && !error ? (
          <p className="text-on-surface-variant text-sm">
            Click <span className="font-medium">Discover Agent</span> to fetch
            NetIQ&apos;s public Agent Card.
          </p>
        ) : null}
        {card ? <AgentCardDisplay card={card} /> : null}
      </div>
    </section>
  );
}

function AgentCardDisplay({ card }: { card: AgentCard }) {
  const auth = card.authentication?.schemes?.join(", ") || "none";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Pair label="Name" value={card.name ?? "—"} />
        <Pair label="Version" value={card.version ?? "—"} />
        <Pair label="A2A endpoint" value={card.url ?? "—"} mono />
        <Pair label="Auth" value={auth} />
      </div>
      <div className="text-on-surface-variant text-sm leading-relaxed">
        {card.description}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {card.capabilities?.streaming ? (
          <Capability label="streaming" />
        ) : null}
        {card.capabilities?.stateTransitionHistory ? (
          <Capability label="state-transition-history" />
        ) : null}
        {card.capabilities?.pushNotifications ? (
          <Capability label="push-notifications" />
        ) : null}
      </div>
      {card.skills && card.skills.length > 0 ? (
        <div className="space-y-2">
          <div className="text-on-surface-variant text-xs">Skills advertised</div>
          <ul className="space-y-2">
            {card.skills.map((s) => (
              <li
                key={s.id}
                className="border-outline-variant rounded-md border p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-on-surface text-sm font-medium">
                    {s.name}
                  </div>
                  <code className="text-on-surface-variant font-mono text-[11px]">
                    {s.id}
                  </code>
                </div>
                {s.description ? (
                  <p className="text-on-surface-variant mt-1 text-xs leading-relaxed">
                    {s.description}
                  </p>
                ) : null}
                {s.tags && s.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.tags.map((t) => (
                      <span
                        key={t}
                        className="bg-surface-container-low text-on-surface-variant rounded px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Capability({ label }: { label: string }) {
  return (
    <span className="bg-surface-container-high text-on-surface inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
      <span className="bg-success h-1.5 w-1.5 rounded-full" />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Section: Send                                                              */
/* -------------------------------------------------------------------------- */

function SendSection({
  scenarioId,
  onScenarioChange,
  skill,
  onSkillChange,
  intent,
  onIntentChange,
  phone,
  onPhoneChange,
  mode,
  onModeChange,
  contextJson,
  onContextChange,
  sending,
  onSend,
  error,
  requestEnvelope,
  taskResponse,
  decideArtifact,
  taskState,
  latencyMs,
}: {
  scenarioId: string;
  onScenarioChange: (id: string) => void;
  skill: Skill;
  onSkillChange: (s: Skill) => void;
  intent: string;
  onIntentChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  mode: "agent" | "policy";
  onModeChange: (m: "agent" | "policy") => void;
  contextJson: string;
  onContextChange: (v: string) => void;
  sending: boolean;
  onSend: () => void;
  error: string | null;
  requestEnvelope: unknown;
  taskResponse: TaskEnvelope | null;
  decideArtifact: DecisionArtifactData | null;
  taskState: string | null;
  latencyMs: number | null;
}) {
  const isLookup = skill === "lookup_phone_history";
  return (
    <section className="border-outline-variant rounded-md border">
      <header className="border-outline-variant border-b px-4 py-3">
        <h2 className="text-on-surface text-base font-medium">
          2. Send an A2A task
        </h2>
        <p className="text-on-surface-variant text-xs">
          Wraps the inputs in an A2A task envelope and posts to{" "}
          <code className="font-mono text-[11px]">/a2a/tasks/send</code>. The
          API key stays server-side.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 p-4 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-on-surface-variant text-xs">Scenario</label>
            <select
              value={scenarioId}
              onChange={(e) => onScenarioChange(e.target.value)}
              className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-full rounded-md border px-3 py-2 text-sm outline-none"
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="text-on-surface-variant text-[11px]">
              {SCENARIOS.find((s) => s.id === scenarioId)?.hint}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-on-surface-variant text-xs">Skill</label>
            <SkillSelector skill={skill} onChange={onSkillChange} />
          </div>

          {!isLookup ? (
            <>
              <div className="space-y-2">
                <label className="text-on-surface-variant text-xs">Intent</label>
                <input
                  value={intent}
                  onChange={(e) => onIntentChange(e.target.value)}
                  placeholder="e.g. payment, emergency_response"
                  className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-full rounded-md border px-3 py-2 font-mono text-xs outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-on-surface-variant text-xs">Mode</label>
                <ModeSelector mode={mode} onChange={onModeChange} />
              </div>
            </>
          ) : null}

          <div className="space-y-2">
            <label className="text-on-surface-variant text-xs">Phone (E.164)</label>
            <input
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder="+233241234567"
              className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-full rounded-md border px-3 py-2 font-mono text-xs outline-none"
            />
          </div>

          {!isLookup ? (
            <div className="space-y-2">
              <label className="text-on-surface-variant text-xs">
                Context (JSON object)
              </label>
              <textarea
                value={contextJson}
                onChange={(e) => onContextChange(e.target.value)}
                spellCheck={false}
                className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface min-h-[140px] w-full rounded-md border p-3 font-mono text-xs leading-relaxed outline-none"
              />
            </div>
          ) : null}

          <button
            type="button"
            disabled={sending}
            onClick={onSend}
            className="bg-primary text-on-primary hover:opacity-90 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">
              {sending ? "graphic_eq" : "send"}
            </span>
            {sending ? "Sending…" : "Send A2A task"}
          </button>
        </div>

        {/* Outputs */}
        <div className="space-y-4">
          {error ? <ErrorBanner message={error} /> : null}

          <div className="border-outline-variant rounded-md border">
            <div className="border-outline-variant bg-surface-container-low flex items-center justify-between gap-3 border-b px-3 py-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-on-surface-variant">State</span>
                <span className="text-on-surface font-mono">
                  {taskState ?? "—"}
                </span>
                <span className="text-on-surface-variant">·</span>
                <span className="text-on-surface-variant">Latency</span>
                <span className="text-on-surface font-mono">
                  {latencyMs != null ? `${latencyMs} ms` : "—"}
                </span>
              </div>
            </div>
            <div className="p-3">
              {decideArtifact ? (
                <DecisionSummary data={decideArtifact} />
              ) : taskResponse ? (
                <ArtifactSummary task={taskResponse} />
              ) : (
                <p className="text-on-surface-variant text-sm">
                  Send a task to see the decision artifact.
                </p>
              )}
            </div>
          </div>

          <Collapsible label="Request envelope" defaultOpen={false}>
            <JsonBlock value={requestEnvelope} placeholder="—" />
          </Collapsible>

          <Collapsible label="Response envelope" defaultOpen={false}>
            <JsonBlock value={taskResponse} placeholder="—" />
          </Collapsible>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Section: Replay                                                            */
/* -------------------------------------------------------------------------- */

function ReplaySection({
  lookupId,
  onLookupIdChange,
  loading,
  onLookup,
  error,
  taskResponse,
  decision,
  taskState,
  lastTaskId,
}: {
  lookupId: string;
  onLookupIdChange: (v: string) => void;
  loading: boolean;
  onLookup: () => void;
  error: string | null;
  taskResponse: TaskEnvelope | null;
  decision: DecisionArtifactData | null;
  taskState: string | null;
  lastTaskId: string;
}) {
  return (
    <section className="border-outline-variant rounded-md border">
      <header className="border-outline-variant border-b px-4 py-3">
        <h2 className="text-on-surface text-base font-medium">
          3. Replay task by id
        </h2>
        <p className="text-on-surface-variant text-xs">
          Calls <code className="font-mono text-[11px]">/a2a/tasks/get</code> to
          re-fetch the persisted decision — proof that every A2A task is
          auditable after the fact.
        </p>
      </header>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1 space-y-2">
            <label className="text-on-surface-variant text-xs">Task id</label>
            <input
              value={lookupId}
              onChange={(e) => onLookupIdChange(e.target.value)}
              placeholder={lastTaskId || "task-…"}
              className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-full rounded-md border px-3 py-2 font-mono text-xs outline-none"
            />
          </div>
          <button
            type="button"
            disabled={loading || !lookupId.trim()}
            onClick={onLookup}
            className="bg-primary text-on-primary hover:opacity-90 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">
              {loading ? "graphic_eq" : "history"}
            </span>
            {loading ? "Looking up…" : "Replay"}
          </button>
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        {taskResponse ? (
          <div className="border-outline-variant rounded-md border">
            <div className="border-outline-variant bg-surface-container-low border-b px-3 py-2 text-xs">
              <span className="text-on-surface-variant">State</span>{" "}
              <span className="text-on-surface font-mono">
                {taskState ?? "—"}
              </span>
            </div>
            <div className="p-3">
              {decision ? (
                <DecisionSummary data={decision} />
              ) : (
                <ArtifactSummary task={taskResponse} />
              )}
            </div>
          </div>
        ) : null}

        {taskResponse ? (
          <Collapsible label="Replay envelope" defaultOpen={false}>
            <JsonBlock value={taskResponse} placeholder="—" />
          </Collapsible>
        ) : null}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */

function ModeSelector({
  mode,
  onChange,
}: {
  mode: "agent" | "policy";
  onChange: (m: "agent" | "policy") => void;
}) {
  const opts: { id: "agent" | "policy"; label: string }[] = [
    { id: "agent", label: "Agent mode" },
    { id: "policy", label: "Policy mode" },
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

function SkillSelector({
  skill,
  onChange,
}: {
  skill: Skill;
  onChange: (s: Skill) => void;
}) {
  const opts: { id: Skill; label: string }[] = [
    { id: "decide", label: "decide" },
    { id: "evaluate_policy", label: "evaluate_policy" },
    { id: "lookup_phone_history", label: "lookup_phone_history" },
  ];
  return (
    <div className="border-outline-variant inline-flex w-full items-stretch overflow-hidden rounded-md border text-sm">
      {opts.map((o) => {
        const active = skill === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`flex-1 px-3 py-2 font-mono text-xs transition-colors ${
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

function DecisionSummary({ data }: { data: DecisionArtifactData }) {
  const decision = data.decision ?? "—";
  const confidence =
    typeof data.confidence === "number"
      ? Math.round(Math.min(100, Math.max(0, data.confidence * 100)))
      : null;
  const risk =
    typeof data.risk_score === "number" ? Math.round(data.risk_score) : null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-x-6">
        <div className="space-y-1">
          <div className="text-on-surface-variant text-xs">Decision</div>
          <DecisionBadge d={decision} />
        </div>
        <div className="space-y-1">
          <div className="text-on-surface-variant text-xs">Confidence</div>
          <div className="text-on-surface font-mono text-sm tabular-nums">
            {confidence != null ? `${confidence}%` : "—"}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-on-surface-variant text-xs">Risk</div>
          <div className="text-on-surface font-mono text-sm tabular-nums">
            {risk != null ? risk : "—"}
          </div>
        </div>
      </div>
      <div>
        <div className="text-on-surface-variant text-xs">Reason</div>
        <p className="text-on-surface mt-1 text-sm leading-relaxed">
          {data.reason || "—"}
        </p>
      </div>
      <div className="text-on-surface-variant flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {data.intent ? (
          <span>
            Intent <span className="text-on-surface font-mono">{data.intent}</span>
          </span>
        ) : null}
        {data.event_id != null ? (
          <span>
            Event id{" "}
            <span className="text-on-surface font-mono">{data.event_id}</span>
          </span>
        ) : null}
        {typeof data.duration_ms === "number" ? (
          <span>
            Duration{" "}
            <span className="text-on-surface font-mono">
              {Math.round(data.duration_ms)} ms
            </span>
          </span>
        ) : null}
      </div>
      {data.api_calls && data.api_calls.length > 0 ? (
        <div>
          <div className="text-on-surface-variant text-xs">CAMARA calls</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {data.api_calls.map((c) => (
              <span
                key={c}
                className="bg-surface-container-high text-on-surface rounded px-1.5 py-0.5 font-mono text-[11px]"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ArtifactSummary({ task }: { task: TaskEnvelope }) {
  const text = task.status?.message?.parts?.find((p) => p.type === "text")?.text;
  const artifact = task.artifacts?.[0];
  const data = artifact?.parts?.[0]?.data;
  return (
    <div className="space-y-2">
      {text ? (
        <p className="text-on-surface text-sm leading-relaxed">{text}</p>
      ) : null}
      {artifact?.name ? (
        <div className="text-on-surface-variant text-xs">
          Artifact{" "}
          <code className="text-on-surface font-mono">{artifact.name}</code>
        </div>
      ) : null}
      {data ? (
        <pre className="bg-surface-container-low text-on-surface no-scrollbar max-h-[200px] overflow-auto rounded-md p-2 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function Pair({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-on-surface-variant text-xs">{label}</div>
      <div
        className={`text-on-surface text-sm break-all ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="border-error/40 bg-error/10 text-error rounded-md border px-3 py-2 text-xs">
      {message}
    </div>
  );
}

function Collapsible({
  label,
  defaultOpen,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="border-outline-variant overflow-hidden rounded-md border"
      open={defaultOpen}
    >
      <summary className="bg-surface-container-low text-on-surface-variant hover:text-on-surface cursor-pointer px-3 py-2 text-xs transition-colors">
        {label}
      </summary>
      <div className="p-3">{children}</div>
    </details>
  );
}

function JsonBlock({
  value,
  placeholder,
}: {
  value: unknown;
  placeholder?: string;
}) {
  if (value == null) {
    return (
      <p className="text-on-surface-variant text-xs">{placeholder ?? "—"}</p>
    );
  }
  return (
    <pre className="bg-surface-container-low text-on-surface no-scrollbar max-h-[320px] overflow-auto rounded-md p-2 font-mono text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function extractDecisionArtifact(
  task: TaskEnvelope | null,
): DecisionArtifactData | null {
  if (!task || !Array.isArray(task.artifacts)) return null;
  const decideArtifact = task.artifacts.find(
    (a) => a?.name === "decide" || a?.name === "decision" || a?.name === "result",
  );
  const data = decideArtifact?.parts?.[0]?.data;
  if (data && typeof data === "object" && "decision" in data) {
    return data as DecisionArtifactData;
  }
  return null;
}

function extractTaskErrors(task: TaskEnvelope | undefined): string[] | null {
  if (!task) return null;
  if (task.status?.state === "failed") {
    const text = task.status?.message?.parts?.find((p) => p.type === "text")?.text;
    if (text) return [text];
  }
  return null;
}
