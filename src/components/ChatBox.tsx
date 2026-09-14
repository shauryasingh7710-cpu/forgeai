"use client";

import { useEffect, useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  source?: "llm" | "template";
  quality?: { groundedness: boolean; adviceSafety: boolean };
}

const SUGGESTIONS = [
  "Why is the market down today?",
  "What does the score mean?",
  "How is India VIX looking?",
  "Which news is driving sentiment?",
  "What are the key trend levels?",
];

export default function ChatBox() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy, open]);

  // Focus the input when opened; Escape closes.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setError(null);
    const history = msgs
      .filter((m) => m.role === "user" || m.source !== undefined)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    setMsgs((prev) => [...prev, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const j = (await res.json()) as {
        answer?: string;
        source?: "llm" | "template";
        quality?: { groundedness: boolean; adviceSafety: boolean };
        error?: string;
      };
      if (!res.ok || !j.answer) throw new Error(j.error ?? "chat request failed");
      setMsgs((prev) => [
        ...prev,
        { role: "assistant", content: j.answer!, source: j.source, quality: j.quality },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the assistant");
    } finally {
      setBusy(false);
    }
  }

  const unanswered = msgs.length === 0;

  return (
    <>
      {/* floating launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open the MarketPulse assistant chat"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-500/40 bg-gradient-to-br from-cyan-600 to-blue-700 text-2xl text-white shadow-lg shadow-cyan-900/40 transition hover:scale-105 hover:shadow-cyan-700/40"
      >
        {open ? "✕" : "💬"}
      </button>

      {/* panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-40 flex h-[520px] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60">
          {/* header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">
                Ask Market<span className="text-cyan-400">Pulse</span>
              </div>
              <div className="text-[10px] text-slate-500">
                answers grounded in today&apos;s live signals · not advice
              </div>
            </div>
            {msgs.length > 0 && (
              <button
                onClick={() => setMsgs([])}
                className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:border-slate-500"
              >
                clear
              </button>
            )}
          </div>

          {/* messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {unanswered && !busy && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs leading-relaxed text-slate-400">
                I answer questions about <span className="text-slate-200">today&apos;s computed signals</span> —
                the score, trend levels, VIX, news tone, global cues. Ask me anything on this page,
                e.g.:
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-cyan-300 transition hover:border-cyan-500 hover:bg-cyan-500/10"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-cyan-600/90 text-white"
                      : "rounded-bl-sm border border-slate-800 bg-slate-950/80 text-slate-200"
                  }`}
                >
                  {m.content}
                  {m.role === "assistant" && m.source && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className={`rounded px-1 py-0.5 text-[9px] font-medium ${
                          m.source === "llm"
                            ? "bg-violet-500/15 text-violet-300"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {m.source === "llm" ? "Gemini · grounded" : "template · grounded"}
                      </span>
                      {m.quality?.groundedness && (
                        <span className="rounded bg-emerald-500/10 px-1 py-0.5 text-[9px] text-emerald-300">
                          grounded ✓
                        </span>
                      )}
                      {m.quality?.adviceSafety && (
                        <span className="rounded bg-emerald-500/10 px-1 py-0.5 text-[9px] text-emerald-300">
                          safe ✓
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-slate-800 bg-slate-950/80 px-3 py-2.5">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400"
                      style={{ animationDelay: `${d * 0.15}s` }}
                    />
                  ))}
                  <span className="ml-1 text-[10px] text-slate-500">reading the signals…</span>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-2 text-[11px] text-red-200">
                {error}
              </div>
            )}
          </div>

          {/* input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="flex items-center gap-2 border-t border-slate-800 bg-slate-950/80 p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about today's signals…"
              maxLength={400}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-600"
            />
            <button
              type="submit"
              disabled={busy || input.trim().length < 2}
              className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
