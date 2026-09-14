"use client";

import type { Quote } from "@/lib/data/types";

interface Props {
  world: Quote[];
  gift: Quote | null;
  fx: Quote[];
  className?: string;
}

function Tile({ q, highlight }: { q: Quote; highlight?: boolean }) {
  const up = q.changePct >= 0;
  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        highlight
          ? "border-cyan-800/60 bg-gradient-to-b from-cyan-950/40 to-slate-950/60"
          : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
      }`}
    >
      <div className="truncate text-[11px] font-medium text-slate-400">{q.name}</div>
      <div className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-100">
        {q.price.toLocaleString("en-IN", { maximumFractionDigits: q.price < 1000 ? 2 : 0 })}
      </div>
      <div
        className={`mt-0.5 font-mono text-[11px] font-semibold tabular-nums ${
          up ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {up ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
      </div>
    </div>
  );
}

export default function WorldStrip({ world, gift, fx, className }: Props) {
  const regions: { title: string; rows: Quote[] }[] = [
    { title: "🇮🇳 Offshore (GIFT)", rows: gift ? [gift] : [] },
    { title: "🇺🇸 Americas", rows: world.filter((q) => ["DJIA", "SPX", "IXIC"].includes(q.symbol)) },
    { title: "🇪🇺 Europe", rows: world.filter((q) => ["FTSE", "DAX", "CAC", "STOXX50"].includes(q.symbol)) },
    { title: "🌏 Asia", rows: world.filter((q) => ["N225", "HSI", "KS11"].includes(q.symbol)) },
    { title: "💱 Currency", rows: fx },
  ].filter((r) => r.rows.length > 0);

  if (regions.length === 0) {
    return (
      <div className={`rounded-2xl border border-amber-900/40 bg-amber-950/20 p-4 text-xs text-amber-200 ${className ?? ""}`}>
        ⚠ World index feed is unreachable right now — Indian market data below is unaffected.
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      {regions.map((r) => (
        <div key={r.title}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {r.title}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {r.rows.map((q) => (
              <Tile key={q.symbol} q={q} highlight={q.symbol === "GIFTNIFTY"} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
