"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { getApiBase, NETIQ_PRODUCTION_API_ORIGIN } from "@/lib/api";

const INTENTS = [
  "fraud_prevention",
  "onboarding",
  "emergency_response",
  "mobility",
  "health",
  "agri",
  "finance",
  "insurance",
  "ecommerce",
  "logistics",
  "education",
];

type Protocol = "rest" | "mcp" | "a2a";

function FieldRow({
  name,
  type,
  required,
  children,
}: {
  name: string;
  type: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="border-outline-variant grid grid-cols-1 gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[200px_1fr]">
      <div className="flex items-baseline gap-2">
        <span className="text-on-surface font-mono text-sm">{name}</span>
        <span className="text-on-surface-variant font-mono text-xs">{type}</span>
        {required ? <span className="text-error text-xs">required</span> : null}
      </div>
      <p className="text-on-surface-variant text-sm leading-relaxed">{children}</p>
    </div>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

export default function DocsPage() {
  const base = useMemo(() => getApiBase().replace(/\/$/, ""), []);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<Protocol>("rest");

  const agentCurl = useMemo(
    () =>
      `curl -X POST ${base}/decision/run \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      intent: "fraud_prevention",
      phone: "+233201234567",
      mode: "agent",
      context: { amount: 500 },
    },
    null,
    2,
  )}'`,
    [base],
  );

  const policyCurl = useMemo(
    () =>
      `curl -X POST ${base}/decision/run \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      intent: "onboarding",
      phone: "+233201234567",
      mode: "policy",
      context: {},
    },
    null,
    2,
  )}'`,
    [base],
  );

  const responseExample = `{
  "mode": "agent",
  "intent": "fraud_prevention",
  "decision": "VERIFY",
  "confidence": 0.663,
  "risk_score": 56.1,
  "reason": "Moderate fraud risk — step-up required; Recent SIM swap detected",
  "reasoning_summary": "Decision=VERIFY via RiskAgent, NetworkAgent. Memory weight=0.85 (sector=finance).",
  "selected_agents": ["RiskAgent", "NetworkAgent"],
  "api_calls": ["sim_swap", "device_swap", "number_verification", "qos_status", "location", "device_status", "reachability"],
  "memory_influence": {
    "global_risk_weight": 0.85,
    "global_risk_score": 34.2,
    "primary_sector": "finance",
    "sector_adjustment": { "finance": 0.72 },
    "events_consulted": [{ "type": "SIM_SWAP", "impact": 30, "ts": "2026-04-29T00:27:09Z" }]
  },
  "trace": [...],
  "visualization_payload": { "nodes": [...], "edges": [...] },
  "policy_applied": { "rule_id": null, "source": "agent_mode" },
  "duration_ms": 5436.12
}`;

  const openapiUrl = `${base}/api/v1/openapi.json`;

  const claudeConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            netiq: {
              command: "python",
              args: ["/absolute/path/to/netiq/mcp_server.py"],
              env: { NETIQ_API_KEY: "ntq_..." },
            },
          },
        },
        null,
        2,
      ),
    [],
  );

  /** Cursor remote MCP — Streamable HTTP against production API (no local Python). */
  const cursorRemoteMcpJson = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            netiq: {
              url: `${NETIQ_PRODUCTION_API_ORIGIN}/mcp`,
              headers: {
                Authorization: "Bearer ${env:NETIQ_API_KEY}",
              },
            },
          },
        },
        null,
        2,
      ),
    [],
  );

  const mcpHttpCurl = useMemo(
    () => `curl -X POST ${base}/mcp \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "decide",
        arguments: {
          intent: "fraud_prevention",
          phone: "+233201234567",
          mode: "agent",
        },
      },
    },
    null,
    2,
  )}'`,
    [base],
  );

  const mcpListCurl = useMemo(
    () => `curl -X POST ${base}/mcp \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }, null, 2)}'`,
    [base],
  );

  const a2aCardCurl = useMemo(() => `curl ${base}/.well-known/agent.json`, [base]);

  const a2aSendCurl = useMemo(
    () => `curl -X POST ${base}/a2a/tasks/send \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      id: "task-001",
      sessionId: "sess-001",
      message: {
        role: "user",
        parts: [
          {
            type: "data",
            data: {
              skill: "decide",
              intent: "fraud_prevention",
              phone: "+233201234567",
              mode: "agent",
              context: { amount: 500 },
            },
          },
        ],
      },
    },
    null,
    2,
  )}'`,
    [base],
  );

  const a2aStreamCurl = useMemo(
    () => `curl -N -X POST ${base}/a2a/tasks/sendSubscribe \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      id: "task-002",
      message: {
        role: "user",
        parts: [
          {
            type: "data",
            data: {
              skill: "decide",
              intent: "onboarding",
              phone: "+233201234567",
              mode: "agent",
            },
          },
        ],
      },
    },
    null,
    2,
  )}'`,
    [base],
  );

  function doCopy(key: string, text: string) {
    void copyText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <ConsolePage title="Docs">
      <div className="space-y-12">
        <header className="space-y-2">
          <h1 className="text-on-surface text-2xl font-semibold tracking-tight">API reference</h1>
          <p className="text-on-surface-variant max-w-2xl text-sm">
            NetIQ exposes the same decision pipeline through three protocols. Pick the one your stack
            already speaks. Production API host:{" "}
            <code className="font-mono text-xs">{NETIQ_PRODUCTION_API_ORIGIN}</code>. Examples below use{" "}
            <code className="font-mono text-xs">{base}</code> (from{" "}
            <code className="font-mono text-xs">NEXT_PUBLIC_NETIQ_API_URL</code> in this browser session).
            All three honour the same API key when required, share the same cross-sector memory, and
            produce identical audit records.
          </p>
        </header>

        {/* Auth (shared) */}
        <section className="space-y-3">
          <h2 className="text-on-surface text-base font-medium">Authentication</h2>
          <p className="text-on-surface-variant text-sm">
            Create and revoke keys on the{" "}
            <Link href="/console/keys" className="text-on-surface underline">
              API keys
            </Link>{" "}
            page. Send the secret as{" "}
            <code className="font-mono text-xs">Authorization: Bearer YOUR_API_KEY</code> on every
            request. Stdio MCP reads it from the{" "}
            <code className="font-mono text-xs">NETIQ_API_KEY</code> environment variable instead.
          </p>
        </section>

        {/* Protocol tabs */}
        <div className="border-outline-variant flex border-b">
          {(
            [
              { id: "rest", label: "REST" },
              { id: "mcp", label: "MCP" },
              { id: "a2a", label: "A2A" },
            ] as { id: Protocol; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-primary text-on-surface"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "rest" && (
          <RestSection
            agentCurl={agentCurl}
            policyCurl={policyCurl}
            responseExample={responseExample}
            openapiUrl={openapiUrl}
            copied={copied}
            doCopy={doCopy}
          />
        )}

        {tab === "mcp" && (
          <McpSection
            base={base}
            claudeConfig={claudeConfig}
            cursorRemoteMcpJson={cursorRemoteMcpJson}
            mcpHttpCurl={mcpHttpCurl}
            mcpListCurl={mcpListCurl}
            copied={copied}
            doCopy={doCopy}
          />
        )}

        {tab === "a2a" && (
          <A2aSection
            base={base}
            a2aCardCurl={a2aCardCurl}
            a2aSendCurl={a2aSendCurl}
            a2aStreamCurl={a2aStreamCurl}
            copied={copied}
            doCopy={doCopy}
          />
        )}
      </div>
    </ConsolePage>
  );
}

function RestSection({
  agentCurl,
  policyCurl,
  responseExample,
  openapiUrl,
  copied,
  doCopy,
}: {
  agentCurl: string;
  policyCurl: string;
  responseExample: string;
  openapiUrl: string;
  copied: string | null;
  doCopy: (k: string, t: string) => void;
}) {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="bg-surface-container-high text-on-surface rounded px-1.5 py-0.5 font-mono text-xs">
            POST
          </span>
          <h2 className="text-on-surface text-base font-medium">/decision/run</h2>
        </div>
        <p className="text-on-surface-variant text-sm">
          Unified dual-mode decisioning. Returns a decision, execution trace, memory influence, and
          visualization payload in a single response.
        </p>
        <div className="border-outline-variant rounded-md border px-4">
          <FieldRow name="intent" type="string" required>
            One of{" "}
            {INTENTS.map((i, idx) => (
              <span key={i}>
                <code className="font-mono text-xs">{i}</code>
                {idx < INTENTS.length - 1 ? ", " : "."}
              </span>
            ))}
          </FieldRow>
          <FieldRow name="phone" type="string" required>
            E.164 phone number, e.g. <code className="font-mono text-xs">+233201234567</code>.
          </FieldRow>
          <FieldRow name="mode" type="string" required>
            <code className="font-mono text-xs">agent</code> — GPT-4o-mini dynamically picks CAMARA
            signals to call.
            <br />
            <code className="font-mono text-xs">policy</code> — runs the tenant policy engine on the
            collected signals.
          </FieldRow>
          <FieldRow name="context" type="object">
            Optional. Supported keys: <code className="font-mono text-xs">amount</code>,{" "}
            <code className="font-mono text-xs">location</code>,{" "}
            <code className="font-mono text-xs">device_info</code>,{" "}
            <code className="font-mono text-xs">compliance_mode</code>.
          </FieldRow>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">Supported intents</h2>
        <div className="border-outline-variant overflow-hidden rounded-md border">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-outline-variant border-b">
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Intent</th>
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">
                  Signals the LLM agent prioritises
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                { intent: "fraud_prevention", signals: "SIM swap, device swap, call forwarding, roaming, number recycling" },
                { intent: "onboarding", signals: "Number verify, KYC match, tenure, number recycling" },
                { intent: "emergency_response", signals: "Reachability, QoS, congestion (never blocks)" },
                { intent: "mobility", signals: "QoS, location, reachability, roaming" },
                { intent: "health", signals: "QoS, reachability, age verify, KYC match" },
                { intent: "agri", signals: "QoS, reachability, location" },
                { intent: "finance", signals: "SIM swap, KYC match, call forwarding, tenure, number recycling" },
                { intent: "insurance", signals: "KYC match, age verify, location verify, tenure" },
                { intent: "ecommerce", signals: "SIM swap, device swap, number recycling, location" },
                { intent: "logistics", signals: "Location, QoS, reachability, roaming" },
                { intent: "education", signals: "Number verify, KYC match, tenure" },
              ].map((r) => (
                <tr key={r.intent} className="border-outline-variant border-t">
                  <td className="text-on-surface px-4 py-2 font-mono text-xs">{r.intent}</td>
                  <td className="text-on-surface-variant px-4 py-2 text-sm">{r.signals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">Decision values</h2>
        <div className="border-outline-variant overflow-hidden rounded-md border">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-outline-variant border-b">
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Value</th>
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                { v: "ALLOW", m: "Low risk. Proceed normally." },
                { v: "VERIFY", m: "Moderate risk. Require step-up (OTP, biometric)." },
                { v: "BLOCK", m: "High risk. Deny the action." },
                { v: "PRIORITIZE", m: "Emergency or urgent flow — route with highest priority." },
                { v: "DEGRADE", m: "Network too weak for full service. Offer reduced experience." },
              ].map((r) => (
                <tr key={r.v} className="border-outline-variant border-t">
                  <td className="text-on-surface px-4 py-2 font-mono text-xs">{r.v}</td>
                  <td className="text-on-surface-variant px-4 py-2 text-sm">{r.m}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="bg-surface-container-high text-on-surface rounded px-1.5 py-0.5 font-mono text-xs">
            POST
          </span>
          <h2 className="text-on-surface text-base font-medium">/agent/run</h2>
        </div>
        <p className="text-on-surface-variant text-sm">
          Agent-mode shortcut. Identical body to{" "}
          <code className="font-mono text-xs">/decision/run</code> but without the{" "}
          <code className="font-mono text-xs">mode</code> field.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Snippet
          title="Agent mode — fraud_prevention (curl)"
          content={agentCurl}
          onCopy={() => doCopy("agent", agentCurl)}
          copied={copied === "agent"}
        />
        <Snippet
          title="Policy mode — onboarding (curl)"
          content={policyCurl}
          onCopy={() => doCopy("policy", policyCurl)}
          copied={copied === "policy"}
        />
      </section>

      <Snippet title="Example response" content={responseExample} />

      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">HTTP responses</h2>
        <div className="border-outline-variant overflow-hidden rounded-md border">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-outline-variant border-b">
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Code</th>
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Meaning</th>
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              <Resp code="200" tone="ok" meaning="Decision returned — always check the decision field" action="Log + act" />
              <Resp code="400" tone="err" meaning="Validation error (intent, phone, mode, …)" action="Fix JSON body" />
              <Resp code="401" tone="err" meaning="Missing or invalid API key" action="Rotate key" />
              <Resp code="429" tone="err" meaning="Per-key rate limit exceeded" action="Backoff / retry" />
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">OpenAPI</h2>
        <div className="border-outline-variant flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <span className="text-on-surface-variant break-all font-mono text-xs">{openapiUrl}</span>
          <button
            type="button"
            onClick={() => doCopy("openapi", openapiUrl)}
            className="text-on-surface-variant hover:text-on-surface inline-flex shrink-0 items-center gap-1 text-xs transition-colors"
          >
            <span className="material-symbols-outlined text-[14px] leading-none">
              {copied === "openapi" ? "check" : "content_copy"}
            </span>
            {copied === "openapi" ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="text-on-surface-variant text-sm">
          The simulator lets you send live requests — try it on the{" "}
          <Link href="/console/simulator" className="text-on-surface underline">
            Simulator
          </Link>{" "}
          page.
        </p>
      </section>
    </div>
  );
}

function McpSection({
  base,
  claudeConfig,
  cursorRemoteMcpJson,
  mcpHttpCurl,
  mcpListCurl,
  copied,
  doCopy,
}: {
  base: string;
  claudeConfig: string;
  cursorRemoteMcpJson: string;
  mcpHttpCurl: string;
  mcpListCurl: string;
  copied: string | null;
  doCopy: (k: string, t: string) => void;
}) {
  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">Model Context Protocol</h2>
        <p className="text-on-surface-variant text-sm">
          NetIQ ships an MCP server with two transports: stdio (for Claude Desktop, Cursor, VSCode)
          and Streamable HTTP at <code className="font-mono text-xs">{base}/mcp</code>. Unlike a raw
          per-API MCP wrapper, NetIQ exposes <strong className="text-on-surface font-medium">five
          high-level decision tools</strong> — your agent expresses intent and gets back a
          structured decision, no orchestration code required.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">Tools</h2>
        <div className="border-outline-variant overflow-hidden rounded-md border">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-outline-variant border-b">
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Tool</th>
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  name: "decide",
                  desc: "Run the full network-aware decision pipeline. Args: intent, phone, mode (agent|policy), context.",
                },
                {
                  name: "evaluate_policy",
                  desc: "Force tenant policy mode. Errors clearly if no rules are configured.",
                },
                {
                  name: "lookup_phone_history",
                  desc: "Read cross-sector memory: global risk, sector scores, events, trajectory. Read-only.",
                },
                { name: "list_intents", desc: "Discoverability. Returns supported intents and signal hints." },
                { name: "get_decision_audit", desc: "Fetch a prior decision by event id." },
              ].map((t) => (
                <tr key={t.name} className="border-outline-variant border-t">
                  <td className="text-on-surface px-4 py-2 font-mono text-xs">{t.name}</td>
                  <td className="text-on-surface-variant px-4 py-2 text-sm">{t.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">Install in Cursor (production API)</h2>
        <p className="text-on-surface-variant text-sm">
          Point Cursor at the deployed Streamable HTTP endpoint — no local Python or repo clone
          required. Add this to <code className="font-mono text-xs">~/.cursor/mcp.json</code> or{" "}
          <code className="font-mono text-xs">.cursor/mcp.json</code>. Set{" "}
          <code className="font-mono text-xs">NETIQ_API_KEY</code> in your environment (Cursor expands{" "}
          <code className="font-mono text-xs">${"{env:NETIQ_API_KEY}"}</code>). Omit{" "}
          <code className="font-mono text-xs">headers</code> if your deployment allows anonymous MCP (
          <code className="font-mono text-xs">REQUIRE_API_KEY=false</code>). Restart Cursor after saving.
        </p>
        <Snippet
          title="mcp.json — remote HTTP (netiq-api.onrender.com)"
          content={cursorRemoteMcpJson}
          onCopy={() => doCopy("cursor-remote", cursorRemoteMcpJson)}
          copied={copied === "cursor-remote"}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">Install in Claude Desktop / Cursor (local stdio)</h2>
        <p className="text-on-surface-variant text-sm">
          Run NetIQ&apos;s Python MCP server from a clone of the repo. Set{" "}
          <code className="font-mono text-xs">NETIQ_API_KEY</code> and add the snippet below to your
          client&apos;s MCP config (e.g. <code className="font-mono text-xs">claude_desktop_config.json</code>
          ). Restart the client. NetIQ tools become callable from natural-language prompts.
        </p>
        <Snippet
          title="claude_desktop_config.json — stdio"
          content={claudeConfig}
          onCopy={() => doCopy("claude", claudeConfig)}
          copied={copied === "claude"}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">HTTP transport</h2>
        <p className="text-on-surface-variant text-sm">
          For server-to-server agents that don&apos;t spawn child processes, hit{" "}
          <code className="font-mono text-xs">POST /mcp</code> with JSON-RPC 2.0. Same Bearer auth
          as the rest of the platform.
        </p>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Snippet
            title="tools/list"
            content={mcpListCurl}
            onCopy={() => doCopy("mcp-list", mcpListCurl)}
            copied={copied === "mcp-list"}
          />
          <Snippet
            title="tools/call → decide"
            content={mcpHttpCurl}
            onCopy={() => doCopy("mcp-call", mcpHttpCurl)}
            copied={copied === "mcp-call"}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">How this differs from Nokia&apos;s MCP</h2>
        <div className="border-outline-variant overflow-hidden rounded-md border">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-outline-variant border-b">
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Aspect</th>
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">
                  Nokia NaC MCP
                </th>
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">NetIQ MCP</th>
              </tr>
            </thead>
            <tbody>
              {[
                { a: "Granularity", n: "1 tool per CAMARA endpoint", q: "1 tool per decision" },
                { a: "Reasoning", n: "None — agent must orchestrate", q: "LLM agent + policy engine built in" },
                { a: "Memory", n: "Stateless", q: "Cross-sector phone-number memory" },
                { a: "Tenant rules", n: "—", q: "Honours tenant JSON policy" },
                { a: "Audit", n: "—", q: "Every call writes an analyze_event" },
                { a: "Output", n: "Raw API JSON", q: "ALLOW / VERIFY / BLOCK + reason + trace" },
              ].map((r) => (
                <tr key={r.a} className="border-outline-variant border-t">
                  <td className="text-on-surface px-4 py-2 text-sm">{r.a}</td>
                  <td className="text-on-surface-variant px-4 py-2 text-sm">{r.n}</td>
                  <td className="text-on-surface-variant px-4 py-2 text-sm">{r.q}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function A2aSection({
  base,
  a2aCardCurl,
  a2aSendCurl,
  a2aStreamCurl,
  copied,
  doCopy,
}: {
  base: string;
  a2aCardCurl: string;
  a2aSendCurl: string;
  a2aStreamCurl: string;
  copied: string | null;
  doCopy: (k: string, t: string) => void;
}) {
  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">Agent-to-Agent protocol</h2>
        <p className="text-on-surface-variant text-sm">
          A2A is the protocol Telefónica and Nokia are jointly piloting for inter-agent
          collaboration. NetIQ implements the standard surface so peer agents can discover and
          invoke its skills as one agent to another — with structured artifacts and streaming
          status updates.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">Skills</h2>
        <div className="border-outline-variant overflow-hidden rounded-md border">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-outline-variant border-b">
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Skill</th>
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  name: "decide",
                  desc: "Run NetIQ's full decision pipeline. Streaming-friendly.",
                },
                {
                  name: "evaluate_policy",
                  desc: "Tenant-rules-only mode (deterministic).",
                },
                {
                  name: "lookup_phone_history",
                  desc: "Read cross-sector phone trust memory.",
                },
              ].map((t) => (
                <tr key={t.name} className="border-outline-variant border-t">
                  <td className="text-on-surface px-4 py-2 font-mono text-xs">{t.name}</td>
                  <td className="text-on-surface-variant px-4 py-2 text-sm">{t.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">Endpoints</h2>
        <div className="border-outline-variant overflow-hidden rounded-md border">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-outline-variant border-b">
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Method</th>
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Path</th>
                <th className="text-on-surface-variant px-4 py-2 text-xs font-medium">Use</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  m: "GET",
                  p: "/.well-known/agent.json",
                  u: "Public Agent Card (no auth) — describes skills, auth scheme, streaming support.",
                },
                { m: "POST", p: "/a2a/tasks/send", u: "Synchronous task execution." },
                {
                  m: "POST",
                  p: "/a2a/tasks/sendSubscribe",
                  u: "SSE streaming task execution. Emits TaskStatusUpdateEvent + TaskArtifactUpdateEvent frames.",
                },
                { m: "POST", p: "/a2a/tasks/get", u: "Fetch a previously executed task by id." },
              ].map((r) => (
                <tr key={r.p} className="border-outline-variant border-t">
                  <td className="text-on-surface px-4 py-2 font-mono text-xs">{r.m}</td>
                  <td className="text-on-surface px-4 py-2 font-mono text-xs">{r.p}</td>
                  <td className="text-on-surface-variant px-4 py-2 text-sm">{r.u}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <Snippet
          title="Discover the Agent Card"
          content={a2aCardCurl}
          onCopy={() => doCopy("a2a-card", a2aCardCurl)}
          copied={copied === "a2a-card"}
        />
        <Snippet
          title="Send a task — sync"
          content={a2aSendCurl}
          onCopy={() => doCopy("a2a-send", a2aSendCurl)}
          copied={copied === "a2a-send"}
        />
        <Snippet
          title="Send a task — streaming SSE"
          content={a2aStreamCurl}
          onCopy={() => doCopy("a2a-stream", a2aStreamCurl)}
          copied={copied === "a2a-stream"}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-on-surface text-base font-medium">Reference client</h2>
        <p className="text-on-surface-variant text-sm">
          A minimal Python client is checked into the repo at{" "}
          <code className="font-mono text-xs">examples/a2a_client.py</code>. It fetches the
          Agent Card from <code className="font-mono text-xs">{base}/.well-known/agent.json</code>{" "}
          and sends one <code className="font-mono text-xs">decide</code> task end-to-end.
        </p>
      </section>
    </div>
  );
}

function Snippet({
  title,
  content,
  onCopy,
  copied,
}: {
  title: string;
  content: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="border-outline-variant overflow-hidden rounded-md border">
      <div className="border-outline-variant bg-surface-container-low flex items-center justify-between border-b px-3 py-2">
        <span className="text-on-surface-variant text-xs">{title}</span>
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 text-xs transition-colors"
          >
            <span className="material-symbols-outlined text-[14px] leading-none">
              {copied ? "check" : "content_copy"}
            </span>
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
      </div>
      <pre className="text-on-surface bg-surface-container-low overflow-x-auto p-3 font-mono text-xs leading-relaxed">
        {content}
      </pre>
    </div>
  );
}

function Resp({
  code,
  tone,
  meaning,
  action,
}: {
  code: string;
  tone: "ok" | "err";
  meaning: string;
  action: string;
}) {
  return (
    <tr className="border-outline-variant border-t">
      <td className={`px-4 py-2 font-mono text-xs ${tone === "err" ? "text-error" : "text-on-surface"}`}>
        {code}
      </td>
      <td className="text-on-surface-variant px-4 py-2 text-sm">{meaning}</td>
      <td className="text-on-surface-variant px-4 py-2 text-sm">{action}</td>
    </tr>
  );
}
