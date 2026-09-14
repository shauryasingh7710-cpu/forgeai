"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, Narrative, Quote, Signal } from "@/lib/data/types";
import PriceChart from "./PriceChart";

/** Curated quick-pick list (resolved server-side via MoneyControl). */
const QUICK_PICKS: { symbol: string; name: string }[] = [
  { symbol: "RELIANCE", name: "Reliance" },
  { symbol: "TCS", name: "TCS" },
  { symbol: "HDFCBANK", name: "HDFC Bank" },
  { symbol: "INFY", name: "Infosys" },
  { symbol: "SBIN", name: "SBI" },
  { symbol: "TATAMOTORS", name: "Tata Motors" },
  { symbol: "ITC", name: "ITC" },
  { symbol: "MARUTI", name: "Maruti" },
];

interface RealIndicators {
  dma50: number | null;
  dma150: number | null;
  dma200: number | null;
  w52High: number | null;
  w52Low: number | null;
  volDay: number | null;
  volAvg20: number | null;
  volAvg30: number | null;
  chg1wPct: number | null;
  chg1mPct: number | null;
  chg3mPct: number | null;
  chg1yPct: number | null;
  delivPct: number | null;
}

interface StockResult {
  quote: Quote & { sector?: string; pe?: number; marketCapCr?: number };
  real: RealIndicators;
  anchored: boolean;
  candles: Candle[];
  signals: Signal[];
  composite: { score: number; zone: string };
  news: { title: string; sentiment: number; source: string }[];
  narrative: Narrative;
  fetchedInMs: number;
}

function fmtIN(v: number | null, digits = 1): string {
  if (v == null) return "—";
  return v.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function pct(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export default function StockFocus() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<StockResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced auto-fetch: no dropdown needed — type a name, get the scorecard.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setError(null);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stock/${encodeURIComponent(q)}`, { signal: controller.signal });
        const j = (await res.json()) as StockResult & { error?: string };
        if (!res.ok) throw new Error(j.error ?? "request failed");
        setData(j);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(e instanceof Error ? e.message : "Could not load stock data");
          setData(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query]);

  const pick = (symbol: string) => setQuery(symbol);

  const perfRows = useMemo(() => {
    if (!data) return [];
    const r = data.real;
    return [
      { label: "1 week", value: r.chg1wPct },
      { label: "1 month", value: r.chg1mPct },
      { label: "3 months", value: r.chg3mPct },
      { label: "1 year", value: r.chg1yPct },
    ];
  }, [data]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Stock focus
        </h3>
        <span className="text-[10px] text-slate-500">educational scorecard · not advice</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_PICKS.map((p) => (
          <button
            key={p.symbol}
            onClick={() => pick(p.symbol)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
              query.toUpperCase() === p.symbol
                ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                : "border-slate-700 text-slate-300 hover:border-slate-500"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="…or search any NSE stock (e.g. ICICI Bank, Adani…)"
        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-600"
      />

      {loading && <div className="mt-4 animate-pulse text-sm text-slate-400">Analyzing…</div>}
      {error && (
        <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {data && !loading && (
        <div className="mt-4 space-y-3">
          {/* header: price + composite */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div>
              <div className="text-lg font-bold">{data.quote.name}</div>
              <div className="text-sm">
                ₹{fmtIN(data.quote.price, 2)}{" "}
                <span className={data.quote.changePct >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {data.quote.changePct >= 0 ? "▲" : "▼"} {Math.abs(data.quote.changePct).toFixed(2)}%
                </span>
                {data.quote.sector && (
                  <span className="ml-2 text-[11px] text-slate-500">{data.quote.sector}</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{data.composite.score}</div>
              <div className="text-xs text-slate-400">{data.composite.zone}</div>
            </div>
          </div>

          {/* Zerodha/Groww-style chart over the anchored series */}
          {data.candles.length > 2 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <PriceChart
                data={data.candles}
                dma50={data.real.dma50}
                dma200={data.real.dma200}
                w52High={data.real.w52High}
                w52Low={data.real.w52Low}
                height={280}
              />
            </div>
          )}

          {/* REAL published indicators (MoneyControl) */}
          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            <div className="rounded-lg border border-slate-800 p-2">
              <div className="text-slate-500">50-DMA</div>
              <div className="font-mono">{fmtIN(data.real.dma50, 1)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 p-2">
              <div className="text-slate-500">200-DMA</div>
              <div className="font-mono">{fmtIN(data.real.dma200, 1)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 p-2">
              <div className="text-slate-500">52-wk range</div>
              <div className="font-mono">{fmtIN(data.real.w52Low, 0)}–{fmtIN(data.real.w52High, 0)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 p-2">
              <div className="text-slate-500">Vol vs avg</div>
              <div className="font-mono">
                {data.real.volDay != null && data.real.volAvg20
                  ? `${(data.real.volDay / data.real.volAvg20).toFixed(2)}×`
                  : "—"}
              </div>
            </div>
          </div>

          {/* performance strip (real horizon changes) */}
          <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
            {perfRows.map((row) => (
              <div key={row.label} className="rounded-lg border border-slate-800 p-2">
                <div className="text-slate-500">{row.label}</div>
                <div className={`font-mono font-semibold ${(row.value ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {pct(row.value)}
                </div>
              </div>
            ))}
          </div>

          {/* signal mini-cards */}
          <div className="grid grid-cols-2 gap-2">
            {data.signals
              .filter((s) => s.available)
              .map((s) => (
                <div key={s.group} className="rounded-lg border border-slate-800 p-2 text-xs" title={s.why}>
                  <div className="flex justify-between">
                    <span className="text-slate-300">{s.label}</span>
                    <span className="font-mono">{s.score >= 0 ? "+" : ""}{s.score.toFixed(1)}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">{s.why}</div>
                </div>
              ))}
          </div>

          <p className="text-xs leading-relaxed text-slate-300">{data.narrative.body}</p>

          {data.news.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Latest headlines
              </div>
              {data.news.slice(0, 3).map((n, i) => (
                <div key={i} className="mt-1 flex items-start gap-2 text-xs text-slate-300">
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      n.sentiment > 0.15 ? "bg-emerald-400" : n.sentiment < -0.15 ? "bg-red-400" : "bg-slate-500"
                    }`}
                  />
                  <span>{n.title}</span>
                </div>
              ))}
            </div>
          )}

          <div className="text-[10px] leading-relaxed text-slate-600">
            Levels, DMAs, 52-week range, volumes and horizon changes are the live published values
            (MoneyControl). Indicator scores are computed on a series anchored to those exact
            values and are labeled approximations · fetched in {data.fetchedInMs} ms.
          </div>
        </div>
      )}

      {!query && !loading && (
        <p className="mt-4 text-xs text-slate-500">
          Pick or type a stock to see its real indicator levels — DMAs, 52-week range, volumes,
          performance horizons — with an educational score and plain-English explanation.
        </p>
      )}
    </div>
  );
}
