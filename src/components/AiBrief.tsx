"use client";

import { useMemo, useState } from "react";
import type { Narrative, PrismSession } from "@/lib/data/types";

interface Props {
  narrative: Narrative;
  session: PrismSession;
  className?: string;
}

const EVAL_BADGE: Record<string, string> = {
  groundedness: "◈ Grounded",
  consistency: "◇ Consistent",
  advice_safety: "⛨ Advice-safe",
  completeness: "✓ Complete",
};

/** Structured sections of the narrative body (the template already formats
 *  with • bullets / "KEY READINGS:" / "HOW TO READ THIS:" markers). */
function splitBody(body: string): { summary: string[]; drivers: string[]; outro: string[] } {
  const lines = body.split("\n");
  const summary: string[] = [];
  const drivers: string[] = [];
  const outro: string[] = [];
  let mode: "s" | "d" | "o" = "s";
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^HOW TO READ THIS/i.test(t)) mode = "o";
    if (/^WHY THE SCORE/i.test(t)) { mode = "d"; continue; } // section marker → the cards' own header
    if (t.startsWith("•")) mode = "d";
    if (mode === "s" && !t.startsWith("•")) summary.push(t);
    else if (mode === "d" && t.startsWith("•")) drivers.push(t.replace(/^•\s*/, ""));
    else if (mode === "o") outro.push(t);
    else summary.push(t);
  }
  return { summary, drivers, outro };
}

function DriverCard({ text, index }: { text: string; index: number }) {
  // Format: "Label contributing ±N points — score X of ±2: why. Key readings: ..."
  const m = text.match(
    /^(.+?)\s+contributing\s+([+\-−]?\d+)\s+points\s+—\s+score\s+([+\-−]?[\d.]+)\s+of\s+±2:\s*(.+)$/,
  );
  if (!m) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs leading-relaxed text-slate-300">
        {text}
      </div>
    );
  }
  const [, label, contrib, score, rest] = m;
  const [why, ...restParts] = rest.split(/Key readings?/i);
  const readingsRaw = restParts.join(" Key readings").replace(/^\s*:\s*/, "");
  const positive = !contrib.startsWith("-") && !contrib.startsWith("−");
  const accent = positive ? "emerald" : "rose";

  const readings = readingsRaw
    .split(/\);\s*/)
    .map((r) => r.replace(/\)\s*\.?\s*$/, "").trim())
    .filter(Boolean)
    .map((r) => {
      const nm = r.match(/^(.*?)\s+at\s+(.+?)\s*\(/);
      return nm
        ? { name: nm[1], value: nm[2], note: r.slice(r.indexOf("(") + 1) }
        : { name: null, value: null, note: r };
    });

  const [open, setOpen] = useState(index === 0);

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-gradient-to-b from-slate-900/70 to-slate-950/40 transition-colors ${
        positive ? "border-emerald-900/50" : "border-rose-900/50"
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-slate-900/60"
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-bold tabular-nums ${
            positive ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"
          }`}
        >
          {contrib.replace("-", "-")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-100">{label}</span>
            <span className="shrink-0 font-mono text-[10px] text-slate-500">
              {score.replace("-", "-")} / ±2
            </span>
          </span>
          <span className="mt-0.5 line-clamp-1 block text-[11px] text-slate-400">{why.trim()}</span>
        </span>
        <span className={`shrink-0 text-xs text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-800/70 px-3.5 pb-3 pt-2.5">
          <p className="text-xs leading-relaxed text-slate-300">{why.trim()}</p>
          {readings.length > 0 && (
            <div className="mt-2.5 space-y-1.5">
              {readings.map((r, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-slate-800/70 bg-slate-950/50 px-2.5 py-1.5"
                >
                  {r.name && (
                    <>
                      <span className="shrink-0 font-mono text-[10px] font-semibold text-cyan-300">
                        {r.value}
                      </span>
                      <span className="text-[11px] leading-snug text-slate-300">
                        <span className="font-medium text-slate-200">{r.name}</span>
                        {" — "}
                        {r.note}
                      </span>
                    </>
                  )}
                  {!r.name && <span className="text-[11px] text-slate-400">{r.note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AiBrief({ narrative, session, className }: Props) {
  const sections = useMemo(() => splitBody(narrative.body), [narrative.body]);
  const [showRaw, setShowRaw] = useState(false);
  const failed = session.evaluators.filter((e) => !e.passed);
  const isLlm = narrative.source === "llm";

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/80 via-slate-900/40 to-transparent ${className ?? ""}`}
    >
      {/* header band */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-600 text-lg shadow-lg shadow-violet-900/30">
            ✧
          </span>
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-slate-100">AI Briefing</h3>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span
                className={`rounded px-1.5 py-0.5 font-medium ${
                  isLlm ? "bg-violet-500/15 text-violet-300" : "bg-slate-800 text-slate-400"
                }`}
              >
                {isLlm ? `Gemini · ${narrative.model}` : "deterministic engine"}
              </span>
              <span>grounded in today&apos;s signals</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {session.evaluators.map((e) => (
            <span
              key={e.name}
              title={e.details}
              className={`rounded-md border px-2 py-1 text-[10px] font-medium ${
                e.passed
                  ? "border-emerald-800/60 bg-emerald-500/10 text-emerald-300"
                  : "border-red-800/60 bg-red-500/10 text-red-300"
              }`}
            >
              {e.passed ? EVAL_BADGE[e.name] ?? e.name : `✗ ${e.name}`}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        {/* headline + summary */}
        <div>
          <h4 className="text-xl font-bold leading-snug tracking-tight text-slate-50">
            {narrative.headline}
          </h4>
          <div className="mt-3 space-y-2">
            {sections.summary.map((s, i) => (
              <p key={i} className="text-sm leading-relaxed text-slate-300">
                {s}
              </p>
            ))}
          </div>
        </div>

        {/* driver cards */}
        {sections.drivers.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Why the score is what it is — tap a driver to expand
              </h5>
            </div>
            <div className="space-y-2">
              {sections.drivers.map((d, i) => (
                <DriverCard key={i} text={d} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* outro / how to read */}
        {sections.outro.length > 0 && (
          <div className="rounded-xl border border-cyan-900/40 bg-cyan-950/20 p-4">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
              How to read this
            </div>
            {sections.outro.map((o, i) => (
              <p key={i} className="text-xs leading-relaxed text-slate-300">
                {o}
              </p>
            ))}
          </div>
        )}

        {/* watchlist */}
        {narrative.watchList.length > 0 && (
          <div>
            <h5 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              What to watch next
            </h5>
            <div className="grid gap-2 sm:grid-cols-3">
              {narrative.watchList.map((w, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-[11px] leading-relaxed text-slate-300"
                >
                  <span className="mb-1 block font-mono text-[10px] text-slate-600">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {w}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/60 pt-3 text-[10px] text-slate-600">
          <span>
            AI run {session.sessionId} · every number traces to the signal cards above
          </span>
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="rounded border border-slate-800 px-2 py-0.5 text-slate-500 transition hover:border-slate-600 hover:text-slate-300"
          >
            {showRaw ? "hide" : "show"} full text
          </button>
        </div>
        {showRaw && (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-[11px] leading-relaxed text-slate-400">
            {narrative.body}
          </pre>
        )}

        {failed.length > 0 && (
          <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-2.5 text-[11px] text-amber-200">
            Quality checks caught an issue: {failed.map((f) => f.details).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}
