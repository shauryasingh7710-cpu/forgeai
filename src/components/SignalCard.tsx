"use client";

import { useState } from "react";
import type { Signal } from "@/lib/data/types";
import { EXPLAINERS } from "@/lib/education/explainers";
import Sparkline from "./Sparkline";

const GROUP_ICON: Record<string, string> = {
  trend: "📈",
  momentum: "⚡",
  volatility: "🌊",
  volume: "🔊",
  structure: "🏗️",
  global: "🌍",
  news: "📰",
  flows: "🏦",
};

function scoreColor(score: number): string {
  if (score > 0.5) return "bg-emerald-500/15 text-emerald-300 border-emerald-700/40";
  if (score < -0.5) return "bg-red-500/15 text-red-300 border-red-700/40";
  return "bg-amber-500/10 text-amber-300 border-amber-700/40";
}

interface Props {
  signal: Signal;
  beginner: boolean;
}

export default function SignalCard({ signal, beginner }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [explaining, setExplaining] = useState<string | null>(null);

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden>{GROUP_ICON[signal.group] ?? "📊"}</span>
          <span className="text-sm font-semibold">{signal.label}</span>
        </div>
        {signal.available ? (
          <span className={`rounded-md border px-2 py-0.5 font-mono text-xs ${scoreColor(signal.score)}`}>
            {signal.score >= 0 ? "+" : ""}
            {signal.score.toFixed(1)}
          </span>
        ) : (
          <span className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-500">
            N/A
          </span>
        )}
      </div>

      {signal.available ? (
        <>
          <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-300">{signal.why}</p>
          {signal.spark && signal.spark.length > 2 && (
            <Sparkline data={signal.spark} className="mt-3" />
          )}
          {!beginner && signal.readings.length > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 self-start text-[11px] font-medium text-cyan-400 hover:text-cyan-300"
            >
              {expanded ? "Hide indicators ▲" : `Show ${signal.readings.length} indicators ▼`}
            </button>
          )}
          {expanded && (
            <div className="mt-2 space-y-2 border-t border-slate-800 pt-2">
              {signal.readings.map((r) => (
                <div key={r.name} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-300">{r.name}</span>
                    <span className="font-mono text-slate-400">{r.value}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">{r.note}</p>
                  <button
                    onClick={() => setExplaining(explaining === r.name ? null : r.name)}
                    className="mt-0.5 text-[10px] text-cyan-500 hover:text-cyan-300"
                  >
                    What is this?
                  </button>
                  {explaining === r.name && EXPLAINERS[r.explainKey] && (
                    <div className="mt-1 rounded-lg border border-cyan-900/40 bg-cyan-950/20 p-2">
                      <div className="text-[11px] font-semibold text-cyan-300">
                        {EXPLAINERS[r.explainKey].title}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-300">{EXPLAINERS[r.explainKey].what}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        <span className="font-semibold">Why it matters: </span>
                        {EXPLAINERS[r.explainKey].why}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 flex-1 text-xs italic text-slate-500">{signal.why}</p>
      )}
    </div>
  );
}
