"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { apiFetch, getApiBase } from "@/lib/api";

type KeyRow = {
  id: number;
  name: string;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

function fmtCreated(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export default function KeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [name, setName] = useState("default");
  const [modal, setModal] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch<{ keys: KeyRow[] }>("/api/v1/keys");
    if (r.ok && r.data && "keys" in r.data) setKeys(r.data.keys);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const base = useMemo(() => getApiBase().replace(/\/$/, ""), []);

  const curlSnippet = useMemo(
    () =>
      `curl --request POST \\
  --url ${base}/decision/run \\
  --header 'Authorization: Bearer YOUR_API_KEY' \\
  --header 'Content-Type: application/json' \\
  --data '{"intent":"fraud_prevention","phone":"+233201234567","mode":"agent","context":{}}'`,
    [base]
  );

  async function createKey() {
    setErr("");
    setCreating(true);
    const r = await apiFetch<{ api_key?: string; warning?: string; errors?: string[] }>(
      "/api/v1/keys",
      { method: "POST", body: JSON.stringify({ name: name.trim() || "default" }) }
    );
    setCreating(false);
    if (!r.ok) {
      setErr((r.data as { errors?: string[] })?.errors?.join(", ") || "Failed to create key");
      return;
    }
    const secret = (r.data as { api_key: string }).api_key;
    setModal(secret);
    setName("default");
    setShowCreate(false);
    await load();
  }

  async function revoke(id: number) {
    if (!confirm("Revoke this key? Apps using it will stop working.")) return;
    await apiFetch(`/api/v1/keys/${id}`, { method: "DELETE" });
    await load();
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  return (
    <ConsolePage title="API keys">
      <div className="space-y-12">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="space-y-1">
            <h1 className="text-on-surface text-2xl font-semibold tracking-tight">API keys</h1>
            <p className="text-on-surface-variant max-w-xl text-sm">
              Long-lived bearer tokens for authenticating <code className="font-mono text-xs">POST /decision/run</code>{" "}
              calls. Each key is shown once at creation — store it somewhere safe.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="bg-primary text-on-primary hover:opacity-90 inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">add</span>
            New key
          </button>
        </header>

        {/* Key list */}
        <section className="border-outline-variant -mx-1 overflow-x-auto rounded-md border sm:mx-0">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-outline-variant border-b">
                <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Name</th>
                <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Token</th>
                <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Created</th>
                <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Last used</th>
                <th className="text-on-surface-variant px-4 py-2.5 text-xs font-medium">Status</th>
                <th className="text-on-surface-variant px-4 py-2.5 text-right text-xs font-medium" />
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-on-surface-variant px-4 py-8 text-sm">
                    No API keys yet.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className="border-outline-variant border-t">
                    <td className="text-on-surface px-4 py-2.5">{k.name}</td>
                    <td className="text-on-surface-variant px-4 py-2.5 font-mono text-xs">{k.key_prefix}…</td>
                    <td className="text-on-surface-variant px-4 py-2.5 text-xs">{fmtCreated(k.created_at)}</td>
                    <td className="text-on-surface-variant px-4 py-2.5 text-xs">
                      {k.last_used_at ? fmtCreated(k.last_used_at) : "Never"}
                    </td>
                    <td className="px-4 py-2.5">
                      {k.revoked_at ? (
                        <span className="text-on-surface-variant text-xs">Revoked</span>
                      ) : (
                        <span className="text-on-surface text-xs">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!k.revoked_at ? (
                        <button
                          type="button"
                          onClick={() => revoke(k.id)}
                          className="text-on-surface-variant hover:text-error inline-flex items-center gap-1 text-xs transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px] leading-none">delete</span>
                          Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* Quickstart */}
        <section className="space-y-4">
          <div>
            <h2 className="text-on-surface text-base font-medium">Quickstart</h2>
            <p className="text-on-surface-variant mt-1 text-sm">
              Replace <code className="font-mono text-xs">YOUR_API_KEY</code> with the value shown when you created
              the key.
            </p>
          </div>
          <div className="border-outline-variant overflow-hidden rounded-md border">
            <div className="border-outline-variant bg-surface-container-low flex items-center justify-between border-b px-4 py-2">
              <span className="text-on-surface-variant font-mono text-xs">bash</span>
              <button
                type="button"
                onClick={() => copyText(curlSnippet)}
                className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 text-xs transition-colors"
              >
                <span className="material-symbols-outlined text-[14px] leading-none">content_copy</span>
                Copy
              </button>
            </div>
            <pre className="text-on-surface bg-surface-container-low overflow-x-auto p-4 font-mono text-xs leading-relaxed">
              {curlSnippet}
            </pre>
          </div>
        </section>
      </div>

      {/* Create key dialog */}
      {showCreate ? (
        <DialogShell onClose={() => setShowCreate(false)}>
          <h3 className="text-on-surface text-base font-semibold">Create a new key</h3>
          <p className="text-on-surface-variant mt-1 text-sm">Give the key a recognizable name.</p>
          <label className="mt-5 block">
            <span className="text-on-surface-variant text-xs">Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-outline-variant bg-surface-container-low text-on-surface focus:border-on-surface mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
              placeholder="e.g. production-backend"
            />
          </label>
          {err ? <p className="text-error mt-3 text-sm">{err}</p> : null}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="border-outline-variant text-on-surface hover:bg-surface-container-low rounded-md border px-3 py-1.5 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createKey}
              disabled={creating}
              className="bg-primary text-on-primary hover:opacity-90 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </DialogShell>
      ) : null}

      {/* Token-shown-once dialog */}
      {modal ? (
        <DialogShell onClose={() => setModal(null)}>
          <h3 className="text-on-surface text-base font-semibold">Save this key</h3>
          <p className="text-on-surface-variant mt-1 text-sm">
            This is the only time the full token will be shown. Copy it now and store it somewhere safe.
          </p>
          <div className="border-outline-variant bg-surface-container-low mt-5 flex items-center justify-between gap-3 rounded-md border p-3">
            <code className="text-on-surface font-mono text-xs break-all">{modal}</code>
            <button
              type="button"
              onClick={() => copyText(modal)}
              className="text-on-surface-variant hover:text-on-surface inline-flex shrink-0 items-center gap-1 text-xs transition-colors"
            >
              <span className="material-symbols-outlined text-[14px] leading-none">content_copy</span>
              Copy
            </button>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="bg-primary text-on-primary hover:opacity-90 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity"
            >
              Done
            </button>
          </div>
        </DialogShell>
      ) : null}
    </ConsolePage>
  );
}

function DialogShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{ background: "var(--backdrop)" }}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4">
        <div className="border-outline-variant bg-surface w-full rounded-lg border p-6 shadow-xl">{children}</div>
      </div>
    </>
  );
}
