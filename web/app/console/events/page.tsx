"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { DecisionBadge } from "@/components/console/DecisionBadge";
import { apiFetch } from "@/lib/api";

type EventRow = {
  id: number;
  created_at: string;
  phone: string;
  intent: string;
  decision: string;
  confidence: number;
  risk_score: number;
  reason: string;
  signals: Record<string, unknown>;
  apis_called: string[];
  api_errors: unknown[];
  duration_ms: number;
  policy_version: string;
  idempotency_key?: string | null;
  http_status?: number;
  decision_trace?: unknown;
  policy_rule_id?: string | null;
};

type ByDecision = Record<string, { count: number; avg_risk?: number; avg_ms?: number }>;

type MetricsSummary = {
  total_requests?: number;
  error_count?: number;
  blocked_count?: number;
  by_decision?: ByDecision;
};

const PAGE_OPTIONS = [25, 50, 100] as const;
const SUMMARY_WINDOW_DAYS = 30;

function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function weightedAvgMs(by?: ByDecision) {
  if (!by) return null;
  let sum = 0;
  let n = 0;
  for (const v of Object.values(by)) {
    const c = v.count || 0;
    const m = typeof v.avg_ms === "number" ? v.avg_ms : 0;
    sum += m * c;
    n += c;
  }
  return n > 0 ? sum / n : null;
}

function fmtUtc(iso: string) {
  try {
    const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 19);
    return d.toISOString().replace("T", " ").slice(0, 19);
  } catch {
    return iso.slice(0, 19);
  }
}

function formatRequestId(ev: EventRow) {
  const k = ev.idempotency_key?.trim();
  if (k) {
    if (k.length <= 18) return k;
    return `${k.slice(0, 10)}…${k.slice(-4)}`;
  }
  return `evt_${ev.id}`;
}

function maskPhone(p?: string) {
  if (!p || p.length < 5) return p || "—";
  return `${p.slice(0, -4).replace(/./g, "•")}${p.slice(-4)}`;
}

function riskTone(score: number | undefined) {
  const v = typeof score === "number" ? score : 0;
  if (v >= 70) return "text-error";
  if (v >= 30) return "text-warning";
  return "text-on-surface-variant";
}

function withinTimeframe(iso: string, tf: string) {
  if (tf === "all") return true;
  const t = new Date(iso.includes("Z") || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`).getTime();
  if (Number.isNaN(t)) return true;
  const now = Date.now();
  const h = tf === "24h" ? 24 : tf === "7d" ? 24 * 7 : 24 * 30;
  return now - t <= h * 3600 * 1000;
}

function escapeCsv(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(rows: EventRow[]) {
  const headers = ["timestamp_utc", "request_id", "subject", "intent", "decision", "risk_score", "reason"];
  const lines = [
    headers.join(","),
    ...rows.map((ev) =>
      [
        escapeCsv(fmtUtc(ev.created_at)),
        escapeCsv(formatRequestId(ev)),
        escapeCsv(maskPhone(ev.phone)),
        escapeCsv(ev.intent || ""),
        escapeCsv(ev.decision || ""),
        escapeCsv(String(Math.round(ev.risk_score ?? 0))),
        escapeCsv((ev.reason || "").slice(0, 500)),
      ].join(",")
    ),
  ].join("\n");
  const blob = new Blob([lines], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `netiq-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [live, setLive] = useState(false);
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [timeframe, setTimeframe] = useState<string>("all");
  const [minRisk, setMinRisk] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_OPTIONS)[number]>(25);
  const [detail, setDetail] = useState<EventRow | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    const [r, m] = await Promise.all([
      apiFetch<{ events: EventRow[] }>("/api/v1/events?limit=100"),
      apiFetch<MetricsSummary>(`/api/v1/metrics/summary?days=${SUMMARY_WINDOW_DAYS}`),
    ]);
    setLoading(false);
    if (r.ok && r.data && "events" in r.data) {
      const list = r.data.events;
      setEvents(list);
      setHasMore(list.length === 100);
    }
    if (m.ok && m.data) setMetrics(m.data);
  }, []);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      void loadFirst();
    }, 15_000);
    return () => clearInterval(t);
  }, [live, loadFirst]);

  const loadMore = useCallback(async () => {
    const last = events[events.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const r = await apiFetch<{ events: EventRow[] }>(
      `/api/v1/events?limit=100&before_id=${last.id}`
    );
    setLoadingMore(false);
    if (r.ok && r.data && "events" in r.data && r.data.events.length) {
      const batch = r.data.events;
      setEvents((prev) => [...prev, ...batch]);
      setHasMore(batch.length === 100);
    } else {
      setHasMore(false);
    }
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter((ev) => {
      if (decisionFilter !== "all" && ev.decision !== decisionFilter) return false;
      if (!withinTimeframe(ev.created_at, timeframe)) return false;
      const r = typeof ev.risk_score === "number" ? ev.risk_score : 0;
      if (r < minRisk) return false;
      return true;
    });
  }, [events, decisionFilter, timeframe, minRisk]);

  useEffect(() => {
    setPage(1);
  }, [decisionFilter, timeframe, minRisk, pageSize]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (pageClamped - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageClamped, pageSize]);

  const summary = useMemo(() => {
    const total = metrics?.total_requests ?? 0;
    const errors = metrics?.error_count ?? 0;
    const avgMs = weightedAvgMs(metrics?.by_decision);
    const avgRps = total > 0 ? total / (SUMMARY_WINDOW_DAYS * 86400) : 0;
    const successPct = total > 0 ? ((Math.max(0, total - errors) / total) * 100) : null;
    return { total, errors, avgMs, avgRps, successPct };
  }, [metrics]);

  return (
    <ConsolePage title="Activity">
      <div className="space-y-12">
        <header className="space-y-1">
          <h1 className="text-on-surface text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="text-on-surface-variant text-sm">
            Decisions emitted by <code className="font-mono text-xs">POST /decision/run</code> for this workspace.
          </p>
        </header>

        {/* Workspace summary */}
        <section className="grid grid-cols-1 gap-x-12 gap-y-8 sm:grid-cols-3">
          <Stat
            label="Avg latency"
            value={summary.avgMs != null ? `${Math.round(summary.avgMs)} ms` : "—"}
            caption="Weighted by decision volume"
          />
          <Stat
            label="Avg throughput"
            value={summary.total > 0 ? `${fmtCompact(summary.avgRps)} req/s` : "—"}
            caption="Mean over the last 30 days"
          />
          <Stat
            label="Request success"
            value={summary.successPct != null ? `${summary.successPct.toFixed(2)}%` : "—"}
            caption={`${fmtCompact(summary.total)} requests, ${summary.errors} errors`}
          />
        </section>

        {/* Filters */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Field label="Decision">
              <select
                value={decisionFilter}
                onChange={(e) => setDecisionFilter(e.target.value)}
                className="bg-transparent text-sm text-on-surface focus:ring-0"
              >
                <option value="all">All</option>
                <option value="ALLOW">Allow</option>
                <option value="BLOCK">Block</option>
                <option value="OTP">Challenge</option>
                <option value="PRIORITIZE">Prioritize</option>
              </select>
            </Field>
            <Field label="Timeframe">
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="bg-transparent text-sm text-on-surface focus:ring-0"
              >
                <option value="all">All loaded</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </Field>
            <Field label={`Min risk ≥ ${minRisk}`}>
              <input
                type="range"
                min={0}
                max={100}
                value={minRisk}
                onChange={(e) => setMinRisk(Number(e.target.value))}
                className="accent-primary h-1 w-28"
                aria-label="Minimum risk score"
              />
            </Field>
            <span className="text-on-surface-variant text-xs">
              {totalFiltered.toLocaleString()} request{totalFiltered === 1 ? "" : "s"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLive((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  live
                    ? "border-on-surface bg-on-surface text-background"
                    : "border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${live ? "bg-background animate-pulse" : "bg-on-surface-variant/50"}`}
                />
                {live ? "Live · on" : "Live"}
              </button>
              <button
                type="button"
                onClick={() => downloadCsv(filtered)}
                disabled={!filtered.length}
                className="border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[14px] leading-none">download</span>
                Export CSV
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="border-outline-variant overflow-hidden rounded-md border">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-outline-variant border-b">
                  <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Time (UTC)</th>
                  <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Request</th>
                  <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Subject</th>
                  <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Decision</th>
                  <th className="text-on-surface-variant px-4 py-2.5 text-right text-xs font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-on-surface-variant px-4 py-8 text-sm">
                      Loading…
                    </td>
                  </tr>
                ) : pageSlice.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-on-surface-variant px-4 py-8 text-sm">
                      No events match these filters.
                    </td>
                  </tr>
                ) : (
                  pageSlice.map((ev) => (
                    <tr
                      key={ev.id}
                      onClick={() => setDetail(ev)}
                      className="border-outline-variant hover:bg-surface-container-low cursor-pointer border-t transition-colors"
                    >
                      <td className="text-on-surface-variant px-4 py-2.5 font-mono text-xs">
                        {fmtUtc(ev.created_at)}
                      </td>
                      <td className="text-on-surface px-4 py-2.5 font-mono text-xs">
                        {formatRequestId(ev)}
                        <span className="text-on-surface-variant ml-2 text-[10px] uppercase tracking-widest">
                          {ev.intent}
                        </span>
                      </td>
                      <td className="text-on-surface-variant px-4 py-2.5 font-mono text-xs">
                        {maskPhone(ev.phone)}
                      </td>
                      <td className="px-4 py-2.5">
                        <DecisionBadge d={ev.decision} variant="pill" friendly />
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums ${riskTone(ev.risk_score)}`}
                      >
                        {Math.round(ev.risk_score ?? 0).toString().padStart(3, "0")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="border-outline-variant flex flex-wrap items-center justify-between gap-4 border-t px-4 py-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous page"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pageClamped === 1}
                  className="text-on-surface-variant hover:text-on-surface inline-flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">chevron_left</span>
                </button>
                <span className="text-on-surface-variant px-2 text-xs">
                  Page {pageClamped} of {totalPages}
                </span>
                <button
                  type="button"
                  aria-label="Next page"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={pageClamped === totalPages}
                  className="text-on-surface-variant hover:text-on-surface inline-flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">chevron_right</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-on-surface-variant text-xs">Per page</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_OPTIONS)[number])}
                  className="text-on-surface bg-transparent text-xs focus:ring-0"
                >
                  {PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {hasMore ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[14px] leading-none">expand_more</span>
              {loadingMore ? "Loading older…" : "Load older events"}
            </button>
          ) : null}
        </section>
      </div>

      {detail ? (
        <>
          <button
            type="button"
            aria-label="Close details"
            className="fixed inset-0 z-40"
            style={{ background: "var(--backdrop)" }}
            onClick={() => setDetail(null)}
          />
          <aside className="border-outline-variant bg-surface fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-on-surface text-base font-semibold tracking-tight">Request details</h3>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
              <Section label="Metadata">
                <dl className="bg-surface-container-low rounded-md p-3 text-xs">
                  <Row k="Intent" v={detail.intent} />
                  <Row k="Subject" v={maskPhone(detail.phone)} />
                  <Row k="Policy" v={detail.policy_version} />
                  <Row k="HTTP" v={String(detail.http_status ?? 200)} />
                  <Row k="Risk" v={String(Math.round(detail.risk_score ?? 0))} />
                  <Row
                    k="Duration"
                    v={typeof detail.duration_ms === "number" ? `${Math.round(detail.duration_ms)} ms` : "—"}
                  />
                </dl>
              </Section>
              <Section label="Reason">
                <p className="text-on-surface bg-surface-container-low rounded-md p-3 text-sm leading-relaxed">
                  {detail.reason}
                </p>
              </Section>
              <Section label="APIs called">
                <pre className="bg-surface-container-low text-on-surface-variant overflow-x-auto rounded-md p-3 font-mono text-[11px] leading-relaxed">
                  {JSON.stringify(detail.apis_called ?? [], null, 2)}
                </pre>
              </Section>
              <Section label="Signals">
                <pre className="bg-surface-container-low text-on-surface-variant overflow-x-auto rounded-md p-3 font-mono text-[11px] leading-relaxed">
                  {JSON.stringify(detail.signals ?? {}, null, 2)}
                </pre>
              </Section>
            </div>
          </aside>
        </>
      ) : null}
    </ConsolePage>
  );
}

function Stat({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-on-surface-variant text-xs">{label}</div>
      <div className="text-on-surface text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {caption ? <div className="text-on-surface-variant text-xs">{caption}</div> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="border-outline-variant flex items-center gap-2 rounded-md border px-3 py-1.5">
      <span className="text-on-surface-variant text-xs">{label}</span>
      {children}
    </label>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="text-on-surface-variant mb-2 text-[10px] font-medium uppercase tracking-widest">{label}</div>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-on-surface-variant">{k}</span>
      <span className="text-on-surface font-mono">{v}</span>
    </div>
  );
}
