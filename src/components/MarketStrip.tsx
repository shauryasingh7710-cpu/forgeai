"use client";

import type { Quote } from "@/lib/data/types";
import Sparkline from "./Sparkline";

interface Props {
  title: string;
  quotes: Quote[];
  compact?: boolean;
}

export default function MarketStrip({ title, quotes, compact }: Props) {
  if (quotes.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
        {quotes.map((q) => {
          const up = q.changePct >= 0;
          return (
            <div
              key={q.symbol}
              className="min-w-[150px] shrink-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
            >
              <div className="text-xs font-medium text-slate-300">{q.name}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-base font-bold">
                  {q.price >= 1000 ? q.price.toFixed(0) : q.price.toFixed(2)}
                </span>
                <span className={`text-xs font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
                  {up ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
                </span>
              </div>
              {!compact && <Sparkline data={q.spark} className="mt-1 h-7 w-full" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
