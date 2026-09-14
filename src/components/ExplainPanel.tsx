"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Narrative, PrismSession } from "@/lib/data/types";

interface Props {
  narrative: Narrative;
  session: PrismSession;
  className?: string;
}

const EVAL_LABEL: Record<string, string> = {
  groundedness: "Grounded ✓",
  consistency: "Consistent ✓",
  advice_safety: "Advice-safe ✓",
  completeness: "Complete ✓",
};

export default function ExplainPanel({ narrative, session, className }: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const failed = session.evaluators.filter((e) => !e.passed);

  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-5 ${className ?? ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          AI explanation — grounded in the signals above
        </h3>
        <button
          onClick={() => {
            setRefreshing(true);
            router.refresh();
            setTimeout(() => setRefreshing(false), 1500);
          }}
          className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-600 hover:text-cyan-300"
        >
          {refreshing ? "Refreshing…" : "↻ Re-explain"}
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
          AI run {session.sessionId}
        </span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
          {narrative.source === "llm" ? `LLM: ${narrative.model}` : "deterministic template"}
        </span>
        {session.evaluators.map((e) => (
          <span
            key={e.name}
            title={e.details}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              e.passed ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
            }`}
          >
            {e.passed ? EVAL_LABEL[e.name] ?? e.name : `✗ ${e.name}`}
          </span>
        ))}
      </div>

      <h4 className="text-lg font-bold leading-snug">{narrative.headline}</h4>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-300">
        {narrative.body}
      </p>

      {narrative.watchList.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            What to watch next
          </div>
          <ul className="mt-1.5 space-y-1">
            {narrative.watchList.map((w, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-300">
                <span className="text-cyan-400">›</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {failed.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-800/50 bg-amber-950/30 p-2.5 text-[11px] text-amber-200">
          Quality checks caught an issue in this explanation: {failed.map((f) => f.details).join(" · ")}
          {session.failureClass?.startsWith("llm") && " (fallback explanation served)"}
        </div>
      )}
    </div>
  );
}
