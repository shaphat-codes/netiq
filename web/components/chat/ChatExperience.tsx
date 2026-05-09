"use client";

import Link from "next/link";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type ConsumerStreamEvent,
  streamConsumerChat,
} from "@/lib/analyzeClient";

export type ChatMode =
  | { kind: "public" }
  | { kind: "authenticated"; apiKey: string };

type AssistantMeta = {
  intent?: string;
  phone?: string;
  toolsUsed: { step: number; tool: string; degraded?: boolean }[];
  decision?: string;
  signalsChecked?: number;
  durationMs?: number;
  reason?: string;
  confidence?: number;
  riskScore?: number;
  apiCalls?: string[];
  selectedAgents?: string[];
  fallback?: string;
  errored?: boolean;
};

type Message =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      meta: AssistantMeta;
      streaming: boolean;
      currentTool?: string;
    };

const HISTORY_TURNS = 6;
const MAX_PROMPT_CHARS = 500;

const SUGGESTED_PROMPTS = [
  "I'm about to send 5,000 GHS to +233241234567 — should I?",
  "Is it safe to deliver a parcel to +254712345678 today?",
  "Someone with +2348012345678 wants to register for our app, looks legit?",
  "Should I assign +233501234567 a ride right now?",
];

function uid() {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function prettifyTool(tool: string): string {
  if (!tool) return "signals";
  return tool
    .replace(/^check_/, "")
    .replace(/^get_/, "")
    .replace(/^verify_/, "")
    .replace(/^retrieve_/, "")
    .replace(/_/g, " ");
}

function decisionTone(decision?: string) {
  switch ((decision || "").toUpperCase()) {
    case "ALLOW":
      return { label: "Looks safe", className: "text-success border-success/40 bg-success/10" };
    case "VERIFY":
      return { label: "Verify first", className: "text-warning border-warning/40 bg-warning/10" };
    case "BLOCK":
      return { label: "Hold off", className: "text-error border-error/40 bg-error/10" };
    case "PRIORITIZE":
      return { label: "Urgent", className: "text-warning border-warning/40 bg-warning/10" };
    case "DEGRADE":
      return { label: "Degraded", className: "text-on-surface-variant border-outline-variant bg-surface-container-low" };
    default:
      return { label: decision || "Pending", className: "text-on-surface-variant border-outline-variant bg-surface-container-low" };
  }
}

export function ChatExperience({ mode }: { mode: ChatMode }) {
  const isAuthed = mode.kind === "authenticated";
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  // Phone is extracted from the user's prose by the LLM. We carry the most
  // recently extracted phone forward so follow-ups like "what about 500
  // instead?" don't require the user to repeat the number.
  const [conversationPhone, setConversationPhone] = useState("");

  const threadRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const buildHistory = useCallback(
    (msgs: Message[]) =>
      msgs
        .slice(-HISTORY_TURNS * 2)
        .filter((m) => m.role === "user" || (m.role === "assistant" && !m.streaming))
        .map((m) => ({
          role: m.role,
          content: m.content,
        })),
    [],
  );

  const send = useCallback(
    async (rawPrompt: string) => {
      const promptText = rawPrompt.trim().slice(0, MAX_PROMPT_CHARS);
      if (!promptText || streaming) return;

      const userMsg: Message = { id: uid(), role: "user", content: promptText };
      const assistantId = uid();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        meta: { toolsUsed: [] },
        streaming: true,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setDraft("");
      setStreaming(true);

      const history = buildHistory(messages);
      let answerStarted = false;

      const updateAssistant = (patcher: (m: Extract<Message, { role: "assistant" }>) => Extract<Message, { role: "assistant" }>) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId && m.role === "assistant" ? patcher(m) : m)),
        );
      };

      try {
        await streamConsumerChat(
          isAuthed ? mode.apiKey : null,
          { phone: conversationPhone, prompt: promptText, history },
          (event: ConsumerStreamEvent) => {
            switch (event.type) {
              case "understanding":
                updateAssistant((m) => ({ ...m, currentTool: "Understanding your question…" }));
                break;
              case "extracted":
                if (event.phone) setConversationPhone(event.phone);
                updateAssistant((m) => ({
                  ...m,
                  meta: { ...m.meta, intent: event.intent, phone: event.phone || conversationPhone },
                  currentTool: event.phone
                    ? `Pulling network signals for ${event.phone}…`
                    : "Pulling network signals…",
                }));
                break;
              case "tool_call":
                updateAssistant((m) => ({
                  ...m,
                  currentTool: `Checking ${prettifyTool(event.tool)}…`,
                  meta: {
                    ...m.meta,
                    toolsUsed: [...m.meta.toolsUsed, { step: event.step, tool: event.tool }],
                  },
                }));
                break;
              case "tool_result":
                updateAssistant((m) => ({
                  ...m,
                  meta: {
                    ...m.meta,
                    toolsUsed: m.meta.toolsUsed.map((t) =>
                      t.step === event.step ? { ...t, degraded: event.degraded } : t,
                    ),
                  },
                }));
                break;
              case "decision":
                updateAssistant((m) => ({
                  ...m,
                  currentTool: undefined,
                  meta: {
                    ...m.meta,
                    decision: event.decision,
                    reason: event.reason,
                    confidence: event.confidence,
                    riskScore: event.risk_score,
                  },
                }));
                break;
              case "fallback":
                updateAssistant((m) => ({
                  ...m,
                  meta: { ...m.meta, fallback: event.reason },
                }));
                break;
              case "answer_start":
                answerStarted = true;
                updateAssistant((m) => ({ ...m, currentTool: "Writing answer…", content: "" }));
                break;
              case "answer_chunk":
                if (!answerStarted) answerStarted = true;
                updateAssistant((m) => ({
                  ...m,
                  currentTool: undefined,
                  content: m.content + event.text,
                }));
                break;
              case "done":
                updateAssistant((m) => ({
                  ...m,
                  streaming: false,
                  currentTool: undefined,
                  meta: {
                    ...m.meta,
                    decision:
                      (event.decision_summary?.decision as string | undefined) || m.meta.decision,
                    signalsChecked: Number(event.decision_summary?.signals_checked ?? 0),
                    durationMs: typeof event.duration_ms === "number" ? event.duration_ms : undefined,
                    apiCalls:
                      (event.decision_summary?.api_calls as string[] | undefined) ||
                      m.meta.apiCalls,
                    selectedAgents:
                      (event.decision_summary?.selected_agents as string[] | undefined) ||
                      m.meta.selectedAgents,
                  },
                }));
                break;
              case "error":
                updateAssistant((m) => ({
                  ...m,
                  streaming: false,
                  currentTool: undefined,
                  content: m.content || `I couldn't reach the network signals right now (${event.message}). Please try again.`,
                  meta: { ...m.meta, errored: true },
                }));
                break;
              default:
                break;
            }
          },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Network error";
        updateAssistant((m) => ({
          ...m,
          streaming: false,
          currentTool: undefined,
          content: m.content || `Something went wrong: ${message}`,
          meta: { ...m.meta, errored: true },
        }));
      } finally {
        setStreaming(false);
      }
    },
    [buildHistory, conversationPhone, isAuthed, messages, mode, streaming],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  const onComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  };

  const tooLong = draft.length > MAX_PROMPT_CHARS;
  const empty = messages.length === 0;
  const sendDisabled = streaming || !draft.trim() || tooLong;

  const onClearPhone = () => setConversationPhone("");

  return (
    <div className="bg-background text-on-surface flex h-full min-h-0 flex-1 flex-col">
      <div ref={threadRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
          {empty ? (
            <EmptyState onPick={(t) => setDraft(t)} authed={isAuthed} />
          ) : (
            messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} content={m.content} />
              ) : (
                <AssistantBubble key={m.id} message={m} authed={isAuthed} />
              ),
            )
          )}
        </div>
      </div>

      <div className="border-outline-variant bg-surface sticky bottom-0 z-10 border-t">
        <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl px-4 py-3 md:px-6">
          {conversationPhone ? (
            <div className="mb-2 flex items-center gap-1.5 text-[11px]">
              <span className="border-outline-variant bg-surface-container-low text-on-surface inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
                <span className="material-symbols-outlined text-[12px] leading-none">call</span>
                {conversationPhone}
                <button
                  type="button"
                  onClick={onClearPhone}
                  className="text-on-surface-variant hover:text-on-surface ml-0.5 inline-flex items-center"
                  title="Forget this number"
                  aria-label="Forget this number"
                >
                  <span className="material-symbols-outlined text-[12px] leading-none">close</span>
                </button>
              </span>
              <span className="text-on-surface-variant">
                follow-ups will reuse this number — mention a different one to switch
              </span>
            </div>
          ) : null}
          <div className="border-outline-variant bg-surface-container-low focus-within:border-outline relative flex items-end gap-2 rounded-lg border p-2 transition-colors">
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onComposerKey}
              rows={1}
              placeholder={
                conversationPhone
                  ? "Ask a follow-up — or paste a different number to switch"
                  : "Type a phone number and describe what you want to do…"
              }
              className="text-on-surface placeholder:text-on-surface-variant max-h-40 min-h-[28px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm focus:outline-none"
            />
            <button
              type="submit"
              disabled={sendDisabled}
              className="bg-on-surface text-surface inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">arrow_upward</span>
              {streaming ? "Thinking" : "Send"}
            </button>
          </div>
          <div className="text-on-surface-variant mt-1.5 flex items-center justify-between px-1 text-[11px]">
            <span>
              Press <kbd className="border-outline-variant rounded border px-1">Enter</kbd> to send,{" "}
              <kbd className="border-outline-variant rounded border px-1">Shift+Enter</kbd> for newline
            </span>
            <span className={tooLong ? "text-error" : ""}>{draft.length}/{MAX_PROMPT_CHARS}</span>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bubbles                                                                    */
/* -------------------------------------------------------------------------- */

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="bg-surface-container text-on-surface max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({
  message,
  authed,
}: {
  message: Extract<Message, { role: "assistant" }>;
  authed: boolean;
}) {
  const tone = decisionTone(message.meta.decision);
  const showStatusPill = message.streaming && !message.content;

  return (
    <div className="flex justify-start">
      <div className="flex max-w-[90%] flex-col gap-2">
        <div className="bg-surface text-on-surface border-outline-variant rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed">
          <div className="text-on-surface-variant mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
            <span className="material-symbols-outlined text-[12px] leading-none">smart_toy</span>
            NetIQ
            {message.meta.decision ? (
              <span
                className={`ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal ${tone.className}`}
              >
                {tone.label}
              </span>
            ) : null}
          </div>

          {showStatusPill ? (
            <div className="text-on-surface-variant inline-flex items-center gap-1.5 text-sm italic">
              <span className="material-symbols-outlined animate-pulse-soft text-[14px] leading-none">
                radio_button_checked
              </span>
              {message.currentTool || "Thinking…"}
            </div>
          ) : (
            <>
              <div className="whitespace-pre-wrap">{message.content || (message.streaming ? "…" : "")}</div>
              {message.streaming && message.currentTool ? (
                <div className="text-on-surface-variant mt-2 inline-flex items-center gap-1.5 text-xs italic">
                  <span className="material-symbols-outlined animate-pulse-soft text-[12px] leading-none">
                    radio_button_checked
                  </span>
                  {message.currentTool}
                </div>
              ) : null}
            </>
          )}
        </div>

        {!message.streaming ? <BubbleFooter message={message} authed={authed} /> : null}
      </div>
    </div>
  );
}

function BubbleFooter({
  message,
  authed,
}: {
  message: Extract<Message, { role: "assistant" }>;
  authed: boolean;
}) {
  const signals = message.meta.signalsChecked ?? message.meta.toolsUsed.length;
  const tools = message.meta.toolsUsed;
  const fallback = message.meta.fallback;
  const phone = message.meta.phone;

  return (
    <div className="text-on-surface-variant flex flex-col gap-1.5 px-1 text-[11px]">
      <details className="group">
        <summary className="hover:text-on-surface inline-flex cursor-pointer list-none items-center gap-1.5">
          <span className="material-symbols-outlined text-[12px] leading-none transition-transform group-open:rotate-90">
            chevron_right
          </span>
          <span>
            Based on {signals} network signal{signals === 1 ? "" : "s"}
            {phone ? ` for ${phone}` : ""}
            {message.meta.intent ? ` · intent: ${message.meta.intent}` : ""}
            {fallback ? ` · fallback (${fallback})` : ""}
          </span>
        </summary>
        <div className="border-outline-variant bg-surface-container-low ml-4 mt-2 rounded-md border p-3 text-xs">
          {tools.length === 0 ? (
            <p className="text-on-surface-variant italic">No external signals were used.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-1">
              {tools.map((t) => (
                <li key={`${t.step}-${t.tool}`} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] opacity-50">#{t.step}</span>
                  <span className="material-symbols-outlined text-[12px] leading-none">
                    {t.degraded ? "error" : "check_circle"}
                  </span>
                  <span className="text-on-surface">{prettifyTool(t.tool)}</span>
                  {t.degraded ? <span className="text-warning">(degraded)</span> : null}
                </li>
              ))}
            </ul>
          )}
          {message.meta.reason ? (
            <p className="text-on-surface-variant border-outline-variant mt-2 border-t pt-2">
              <span className="font-medium">Reason:</span> {message.meta.reason}
            </p>
          ) : null}
          {typeof message.meta.confidence === "number" ||
          (authed && typeof message.meta.riskScore === "number") ? (
            <p className="text-on-surface-variant mt-1 flex gap-3">
              {typeof message.meta.confidence === "number" ? (
                <span>confidence {(message.meta.confidence * 100).toFixed(0)}%</span>
              ) : null}
              {authed && typeof message.meta.riskScore === "number" ? (
                <span>risk {message.meta.riskScore.toFixed(0)}</span>
              ) : null}
              {typeof message.meta.durationMs === "number" ? (
                <span>{message.meta.durationMs.toFixed(0)} ms</span>
              ) : null}
            </p>
          ) : null}
        </div>
      </details>

      {!authed ? (
        <Link
          href="/register"
          className="hover:text-on-surface inline-flex w-fit items-center gap-1 text-[11px] underline-offset-2 hover:underline"
        >
          Want to integrate this in your app?
          <span className="material-symbols-outlined text-[12px] leading-none">arrow_forward</span>
        </Link>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

function EmptyState({
  onPick,
  authed,
}: {
  onPick: (text: string) => void;
  authed: boolean;
}) {
  return (
    <div className="text-on-surface-variant flex flex-col gap-6 py-10 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="bg-surface-container border-outline-variant flex h-12 w-12 items-center justify-center rounded-full border">
          <span className="material-symbols-outlined text-on-surface text-[20px] leading-none">
            chat_bubble
          </span>
        </div>
        <h2 className="text-on-surface text-xl font-semibold tracking-tight">
          {authed ? "Ask NetIQ anything" : "Ask before you act"}
        </h2>
        <p className="max-w-md text-sm">
          Describe what you want to do — and include the phone number.{" "}
          NetIQ checks live network signals and tells you whether to{" "}
          <span className="text-success">go ahead</span>,{" "}
          <span className="text-warning">verify</span>, or{" "}
          <span className="text-error">hold off</span>.
        </p>
      </div>
      <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="border-outline-variant text-on-surface hover:bg-surface-container-low rounded-md border px-3 py-2 text-left text-xs leading-relaxed transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
