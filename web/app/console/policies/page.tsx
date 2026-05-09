"use client";

import { useEffect, useState } from "react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { apiFetch } from "@/lib/api";

/* ─── types ──────────────────────────────────────────────────────────────── */

type Op = "eq" | "gte" | "lte";
type CondValue = boolean | number | string;

interface Condition {
  fact: string;
  op: Op;
  value: CondValue;
}

interface Rule {
  id: string;
  intent: string; // "" = any intent
  conditions: Condition[];
  decision: string;
  reason: string;
}

interface Policy {
  id: number;
  name: string;
  version: string;
  is_active: boolean;
  created_at: string;
  content: { rules: Rule[] };
}

/* ─── constants ──────────────────────────────────────────────────────────── */

const INTENTS = [
  { value: "", label: "Any intent" },
  { value: "fraud_prevention", label: "Fraud prevention" },
  { value: "onboarding", label: "Onboarding" },
  { value: "emergency_response", label: "Emergency response" },
  { value: "mobility", label: "Mobility" },
  { value: "health", label: "Health" },
  { value: "agri", label: "Agri" },
];

const FACTS: { value: string; label: string; type: "bool" | "number"; group: string }[] = [
  // Identity & fraud
  { value: "sim_swap_recent", label: "SIM swap detected", type: "bool", group: "Identity" },
  { value: "device_swap_recent", label: "Device swap detected", type: "bool", group: "Identity" },
  { value: "new_device", label: "New device detected", type: "bool", group: "Identity" },
  { value: "number_verified", label: "Number verified", type: "bool", group: "Identity" },
  { value: "recycled_risk", label: "Number recycling risk", type: "bool", group: "Identity" },
  { value: "is_roaming", label: "Device is roaming", type: "bool", group: "Identity" },
  { value: "call_forwarding_active", label: "Call forwarding active", type: "bool", group: "Identity" },
  // KYC
  { value: "kyc_match", label: "KYC identity matches", type: "bool", group: "KYC" },
  { value: "age_verified", label: "Age verified", type: "bool", group: "KYC" },
  { value: "low_tenure", label: "Low tenure (< 3 months)", type: "bool", group: "KYC" },
  { value: "tenure_months", label: "Tenure (months)", type: "number", group: "KYC" },
  { value: "consent_granted", label: "Consent granted", type: "bool", group: "KYC" },
  // Network
  { value: "location_matches", label: "Location matches", type: "bool", group: "Network" },
  { value: "degraded_any", label: "Some signals degraded", type: "bool", group: "Network" },
  // Transaction
  { value: "amount_band_high", label: "Amount is high value", type: "bool", group: "Transaction" },
  { value: "amount", label: "Transaction amount", type: "number", group: "Transaction" },
  // History
  { value: "velocity_spike", label: "Velocity spike detected", type: "bool", group: "History" },
  { value: "previous_risk", label: "Previous risk score", type: "number", group: "History" },
  { value: "profile_decision_count", label: "Prior decision count", type: "number", group: "History" },
];

const DECISIONS = ["ALLOW", "VERIFY", "BLOCK", "PRIORITIZE", "DEGRADE"];

function factType(fact: string): "bool" | "number" {
  return FACTS.find((f) => f.value === fact)?.type ?? "bool";
}

function emptyRule(): Rule {
  return {
    id: `rule_${Date.now()}`,
    intent: "",
    conditions: [],
    decision: "BLOCK",
    reason: "",
  };
}

function emptyCondition(): Condition {
  return { fact: "sim_swap_recent", op: "eq", value: true };
}

function ruleToContent(rules: Rule[]) {
  return {
    rules: rules.map((r) => ({
      id: r.id,
      when: {
        ...(r.intent ? { intent: r.intent } : {}),
        all: r.conditions.map((c) => ({
          fact: c.fact,
          op: c.op,
          ...(c.op === "eq" ? { eq: c.value } : { [c.op]: c.value }),
        })),
      },
      then: {
        decision: r.decision,
        ...(r.reason.trim() ? { append_reason: r.reason.trim() } : {}),
      },
    })),
  };
}

function contentToRules(content: unknown): Rule[] {
  if (!content || typeof content !== "object") return [];
  const c = content as { rules?: unknown[] };
  if (!Array.isArray(c.rules)) return [];
  return c.rules.map((raw: unknown) => {
    const r = raw as Record<string, unknown>;
    const when = (r.when ?? {}) as Record<string, unknown>;
    const then = (r.then ?? {}) as Record<string, unknown>;
    const allConds = (when.all ?? []) as Record<string, unknown>[];
    return {
      id: String(r.id ?? `rule_${Math.random().toString(36).slice(2)}`),
      intent: String(when.intent ?? ""),
      conditions: allConds.map((c) => {
        const fact = String(c.fact ?? "sim_swap_recent");
        const op: Op = (c.op as Op) ?? "eq";
        const val = c.eq !== undefined ? c.eq : c.gte !== undefined ? c.gte : c.lte ?? true;
        return { fact, op, value: val as CondValue };
      }),
      decision: String(then.decision ?? "BLOCK"),
      reason: String(then.append_reason ?? ""),
    };
  });
}

/* ─── main page ──────────────────────────────────────────────────────────── */

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    const r = await apiFetch<{ policies: Policy[] }>("/api/v1/policies");
    if (r.ok && r.data && "policies" in r.data) setPolicies(r.data.policies ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditing({
      id: 0,
      name: "New policy",
      version: "1",
      is_active: false,
      created_at: "",
      content: { rules: [emptyRule()] },
    });
    setMsg("");
    setErr("");
    setView("edit");
  }

  function openEdit(p: Policy) {
    setEditing(JSON.parse(JSON.stringify(p)) as Policy);
    setMsg("");
    setErr("");
    setView("edit");
  }

  async function activate(id: number) {
    setBusy(true);
    const r = await apiFetch(`/api/v1/policies/${id}/activate`, { method: "POST" });
    if (r.ok) { await load(); setMsg("Policy activated."); }
    else setErr("Failed to activate.");
    setBusy(false);
  }

  async function remove(id: number) {
    if (!confirm("Delete this policy?")) return;
    setBusy(true);
    const r = await apiFetch(`/api/v1/policies/${id}`, { method: "DELETE" });
    if (r.ok) await load();
    else setErr("Delete failed.");
    setBusy(false);
  }

  async function save(p: Policy, rules: Rule[]) {
    setErr("");
    setMsg("");
    const content = ruleToContent(rules);
    setBusy(true);
    let r;
    if (p.id === 0) {
      r = await apiFetch("/api/v1/policies", {
        method: "POST",
        body: JSON.stringify({ name: p.name, version: p.version, content }),
      });
    } else {
      r = await apiFetch(`/api/v1/policies/${p.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: p.name, version: p.version, content }),
      });
    }
    setBusy(false);
    if (!r.ok) { setErr("Save failed."); return; }
    setMsg("Saved.");
    await load();
    setView("list");
  }

  if (view === "edit" && editing !== null) {
    return (
      <PolicyEditor
        policy={editing}
        busy={busy}
        msg={msg}
        err={err}
        onCancel={() => setView("list")}
        onSave={(p, rules) => void save(p, rules)}
      />
    );
  }

  return (
    <ConsolePage title="Policies">
      <div className="space-y-8">
        <header className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-on-surface text-2xl font-semibold tracking-tight">Policies</h1>
            <p className="text-on-surface-variant max-w-2xl text-sm">
              Rules evaluated when a request uses <strong className="text-on-surface font-medium">policy mode</strong>.
              One policy can be active at a time. Requests in policy mode are blocked until at least one policy with rules is active.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="bg-primary text-on-primary hover:opacity-90 inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">add</span>
            New policy
          </button>
        </header>

        {msg ? <p className="text-on-surface-variant text-sm">{msg}</p> : null}
        {err ? <p className="text-error text-sm">{err}</p> : null}

        {loading ? (
          <p className="text-on-surface-variant text-sm">Loading…</p>
        ) : policies.length === 0 ? (
          <div className="border-outline-variant rounded-md border px-6 py-10 text-center">
            <p className="text-on-surface-variant text-sm">No policies yet.</p>
            <p className="text-on-surface-variant mt-1 text-sm">
              Create one and activate it to enable policy mode.
            </p>
            <button
              type="button"
              onClick={openNew}
              className="text-on-surface hover:text-on-surface/80 mt-4 inline-flex items-center gap-1 text-sm underline"
            >
              Create first policy
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {policies.map((p) => (
              <PolicyCard
                key={p.id}
                policy={p}
                busy={busy}
                onEdit={() => openEdit(p)}
                onActivate={() => void activate(p.id)}
                onDelete={() => void remove(p.id)}
              />
            ))}
          </div>
        )}
      </div>
    </ConsolePage>
  );
}

/* ─── policy card ────────────────────────────────────────────────────────── */

function PolicyCard({
  policy,
  busy,
  onEdit,
  onActivate,
  onDelete,
}: {
  policy: Policy;
  busy: boolean;
  onEdit: () => void;
  onActivate: () => void;
  onDelete: () => void;
}) {
  const rules = contentToRules(policy.content);
  const ruleCount = rules.length;
  const ts = policy.created_at ? new Date(policy.created_at).toLocaleDateString() : "—";
  return (
    <div
      className={`border-outline-variant rounded-md border px-5 py-4 ${
        policy.is_active ? "ring-on-surface/20 ring-1" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {policy.is_active ? (
            <span className="bg-success/15 text-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
              <span className="bg-success h-1.5 w-1.5 rounded-full" />
              Active
            </span>
          ) : (
            <span className="bg-surface-container-high text-on-surface-variant rounded-full px-2 py-0.5 text-xs">
              Inactive
            </span>
          )}
          <span className="text-on-surface truncate font-medium">{policy.name}</span>
          <span className="text-on-surface-variant font-mono text-xs">v{policy.version}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-on-surface-variant text-xs">
            {ruleCount} {ruleCount === 1 ? "rule" : "rules"} · {ts}
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="text-on-surface-variant hover:text-on-surface text-xs transition-colors"
          >
            Edit
          </button>
          {!policy.is_active ? (
            <button
              type="button"
              onClick={onActivate}
              disabled={busy}
              className="text-on-surface-variant hover:text-on-surface text-xs transition-colors disabled:opacity-40"
            >
              Activate
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="text-error/70 hover:text-error text-xs transition-colors disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>

      {ruleCount > 0 ? (
        <ul className="mt-3 space-y-1">
          {rules.map((r) => (
            <li key={r.id} className="text-on-surface-variant text-xs">
              <RuleSummary rule={r} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-on-surface-variant mt-3 text-xs italic">No rules defined yet.</p>
      )}
    </div>
  );
}

function RuleSummary({ rule }: { rule: Rule }) {
  const intentLabel = INTENTS.find((i) => i.value === rule.intent)?.label ?? "Any intent";
  const condLabels = rule.conditions.map((c) => {
    const fl = FACTS.find((f) => f.value === c.fact)?.label ?? c.fact;
    if (c.op === "eq") return `${fl} = ${String(c.value)}`;
    return `${fl} ${c.op} ${c.value}`;
  });
  const parts = [intentLabel, ...condLabels].join(", ");
  return (
    <span>
      <span className="text-on-surface font-medium">{rule.decision}</span>
      {" — "}
      {parts || "always"}
      {rule.reason ? <span className="italic"> ({rule.reason})</span> : null}
    </span>
  );
}

/* ─── policy editor ──────────────────────────────────────────────────────── */

function PolicyEditor({
  policy,
  busy,
  msg,
  err,
  onCancel,
  onSave,
}: {
  policy: Policy;
  busy: boolean;
  msg: string;
  err: string;
  onCancel: () => void;
  onSave: (p: Policy, rules: Rule[]) => void;
}) {
  const [name, setName] = useState(policy.name);
  const [version, setVersion] = useState(policy.version);
  const [rules, setRules] = useState<Rule[]>(() =>
    policy.content?.rules?.length
      ? contentToRules(policy.content)
      : [emptyRule()]
  );

  function addRule() {
    setRules((r) => [...r, emptyRule()]);
  }

  function removeRule(idx: number) {
    setRules((r) => r.filter((_, i) => i !== idx));
  }

  function updateRule(idx: number, patch: Partial<Rule>) {
    setRules((r) => r.map((rule, i) => (i === idx ? { ...rule, ...patch } : rule)));
  }

  function addCondition(ruleIdx: number) {
    updateRule(ruleIdx, {
      conditions: [...rules[ruleIdx].conditions, emptyCondition()],
    });
  }

  function removeCondition(ruleIdx: number, condIdx: number) {
    updateRule(ruleIdx, {
      conditions: rules[ruleIdx].conditions.filter((_, i) => i !== condIdx),
    });
  }

  function updateCondition(ruleIdx: number, condIdx: number, patch: Partial<Condition>) {
    const updated = rules[ruleIdx].conditions.map((c, i) =>
      i === condIdx ? { ...c, ...patch } : c
    );
    updateRule(ruleIdx, { conditions: updated });
  }

  return (
    <ConsolePage title="Policies">
      <div className="space-y-8">
        <header className="flex items-center gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 text-sm transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">arrow_back</span>
            Policies
          </button>
          <span className="text-on-surface-variant">/</span>
          <h1 className="text-on-surface text-xl font-semibold">{policy.id === 0 ? "New policy" : "Edit policy"}</h1>
        </header>

        {/* Meta */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-xl">
          <label className="space-y-1">
            <span className="text-on-surface-variant text-xs">Policy name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-full rounded-md border px-3 py-2 text-sm outline-none"
              placeholder="e.g. Strict fraud rules"
            />
          </label>
          <label className="space-y-1">
            <span className="text-on-surface-variant text-xs">Version label</span>
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-full rounded-md border px-3 py-2 text-sm outline-none"
              placeholder="1"
            />
          </label>
        </div>

        {/* Rules */}
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-on-surface text-base font-medium">Rules</h2>
            <p className="text-on-surface-variant text-xs">
              Rules are evaluated in order — first match wins.
            </p>
          </div>

          {rules.length === 0 ? (
            <p className="text-on-surface-variant text-sm">No rules yet. Add one below.</p>
          ) : (
            <div className="space-y-4">
              {rules.map((rule, ri) => (
                <RuleEditor
                  key={rule.id}
                  rule={rule}
                  index={ri}
                  onUpdate={(patch) => updateRule(ri, patch)}
                  onRemove={() => removeRule(ri)}
                  onAddCondition={() => addCondition(ri)}
                  onRemoveCondition={(ci) => removeCondition(ri, ci)}
                  onUpdateCondition={(ci, patch) => updateCondition(ri, ci, patch)}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addRule}
            className="border-outline-variant text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">add</span>
            Add rule
          </button>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSave({ ...policy, name, version }, rules)}
            disabled={busy || !name.trim()}
            className="bg-primary text-on-primary hover:opacity-90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">save</span>
            {busy ? "Saving…" : "Save policy"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-on-surface-variant hover:text-on-surface text-sm transition-colors"
          >
            Cancel
          </button>
          {err ? <span className="text-error text-sm">{err}</span> : null}
          {msg ? <span className="text-on-surface-variant text-sm">{msg}</span> : null}
        </div>
      </div>
    </ConsolePage>
  );
}

/* ─── rule editor ────────────────────────────────────────────────────────── */

function RuleEditor({
  rule,
  index,
  onUpdate,
  onRemove,
  onAddCondition,
  onRemoveCondition,
  onUpdateCondition,
}: {
  rule: Rule;
  index: number;
  onUpdate: (patch: Partial<Rule>) => void;
  onRemove: () => void;
  onAddCondition: () => void;
  onRemoveCondition: (ci: number) => void;
  onUpdateCondition: (ci: number, patch: Partial<Condition>) => void;
}) {
  const decisionTone = (d: string) => {
    if (d === "ALLOW") return "text-success";
    if (d === "BLOCK") return "text-error";
    return "text-warning";
  };

  return (
    <div className="border-outline-variant rounded-md border p-5 space-y-5">
      {/* Rule header */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-on-surface-variant text-xs font-medium">Rule {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-on-surface-variant hover:text-error text-xs transition-colors"
        >
          Remove rule
        </button>
      </div>

      {/* Intent filter */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-on-surface-variant text-xs">Apply to intent</span>
          <select
            value={rule.intent}
            onChange={(e) => onUpdate({ intent: e.target.value })}
            className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-full rounded-md border px-3 py-2 text-sm outline-none"
          >
            {INTENTS.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
          <p className="text-on-surface-variant text-xs">Skip to match all intents.</p>
        </label>

        {/* Decision */}
        <label className="space-y-1">
          <span className="text-on-surface-variant text-xs">Then decide</span>
          <select
            value={rule.decision}
            onChange={(e) => onUpdate({ decision: e.target.value })}
            className={`border-outline-variant bg-surface-container-low focus:border-on-surface w-full rounded-md border px-3 py-2 text-sm font-medium outline-none ${decisionTone(rule.decision)}`}
          >
            {DECISIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Conditions */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-on-surface-variant text-xs">
            When ALL of these are true
          </span>
          <span className="text-on-surface-variant text-xs italic">
            {rule.conditions.length === 0 ? "No conditions — rule always matches" : null}
          </span>
        </div>

        {rule.conditions.map((cond, ci) => (
          <ConditionRow
            key={ci}
            condition={cond}
            onUpdate={(patch) => onUpdateCondition(ci, patch)}
            onRemove={() => onRemoveCondition(ci)}
          />
        ))}

        <button
          type="button"
          onClick={onAddCondition}
          className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 text-xs transition-colors"
        >
          <span className="material-symbols-outlined text-[14px] leading-none">add</span>
          Add condition
        </button>
      </div>

      {/* Reason */}
      <label className="block space-y-1">
        <span className="text-on-surface-variant text-xs">Reason note (optional)</span>
        <input
          value={rule.reason}
          onChange={(e) => onUpdate({ reason: e.target.value })}
          placeholder="Appended to the reason field in the response"
          className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-full rounded-md border px-3 py-2 text-sm outline-none"
        />
      </label>
    </div>
  );
}

/* ─── condition row ──────────────────────────────────────────────────────── */

function ConditionRow({
  condition,
  onUpdate,
  onRemove,
}: {
  condition: Condition;
  onUpdate: (patch: Partial<Condition>) => void;
  onRemove: () => void;
}) {
  const type = factType(condition.fact);

  function handleFactChange(fact: string) {
    const newType = FACTS.find((f) => f.value === fact)?.type ?? "bool";
    const newOp: Op = newType === "number" ? "gte" : "eq";
    const newVal: CondValue = newType === "number" ? 0 : true;
    onUpdate({ fact, op: newOp, value: newVal });
  }

  function handleOpChange(op: Op) {
    onUpdate({ op });
  }

  function handleValueChange(raw: string) {
    if (type === "bool") {
      onUpdate({ value: raw === "true" });
    } else {
      const n = parseFloat(raw);
      onUpdate({ value: isNaN(n) ? 0 : n });
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Fact — grouped by category */}
      <select
        value={condition.fact}
        onChange={(e) => handleFactChange(e.target.value)}
        className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface rounded-md border px-2 py-1.5 text-xs outline-none"
      >
        {Array.from(new Set(FACTS.map((f) => f.group))).map((group) => (
          <optgroup key={group} label={group}>
            {FACTS.filter((f) => f.group === group).map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Operator */}
      {type === "bool" ? (
        <span className="text-on-surface-variant text-xs">is</span>
      ) : (
        <select
          value={condition.op}
          onChange={(e) => handleOpChange(e.target.value as Op)}
          className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface rounded-md border px-2 py-1.5 text-xs outline-none"
        >
          <option value="gte">≥</option>
          <option value="lte">≤</option>
          <option value="eq">=</option>
        </select>
      )}

      {/* Value */}
      {type === "bool" ? (
        <select
          value={String(condition.value)}
          onChange={(e) => handleValueChange(e.target.value)}
          className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface rounded-md border px-2 py-1.5 text-xs outline-none"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          type="number"
          value={String(condition.value)}
          onChange={(e) => handleValueChange(e.target.value)}
          className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface w-20 rounded-md border px-2 py-1.5 text-xs outline-none"
        />
      )}

      <button
        type="button"
        onClick={onRemove}
        className="text-on-surface-variant hover:text-error transition-colors"
      >
        <span className="material-symbols-outlined text-[14px] leading-none">close</span>
      </button>
    </div>
  );
}
