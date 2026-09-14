/**
 * Global cues — free, keyless, reliable (ECB reference rates via Frankfurter).
 *
 * From ONE cached time-series call we derive:
 *   • USD/INR — the rupee's recent move (direct India macro cue)
 *   • a true-formula Dollar Index proxy (EUR 57.6%, JPY 13.6%, GBP 11.9%,
 *     CAD 9.1%, SEK 4.2%, CHF 3.6% — the actual DXY weighting)
 *   • sparklines for the strip from the same data
 *
 * ECB rates are end-of-day reference rates (published ~16:00 CET); changes
 * are vs the previous business day. Yahoo is no longer used anywhere.
 */
import { cached } from "./cache";
import { canUse, recordFailure, recordSuccess } from "./circuitBreaker";
import type { Quote } from "./types";

const SERIES_URL =
  "https://api.frankfurter.app/{from}..?from=USD&to=INR,EUR,GBP,JPY,CAD,CHF,SEK";

// Official DXY currency weights.
const DXY_WEIGHTS: Record<string, number> = {
  EUR: 0.576,
  JPY: 0.136,
  GBP: 0.119,
  CAD: 0.091,
  SEK: 0.042,
  CHF: 0.036,
};

interface FrankfurterResponse {
  base?: string;
  rates?: Record<string, Record<string, number>>;
}

async function fetchSeries(days: number): Promise<{ dates: string[]; rates: Record<string, number[]> }> {
  if (!canUse("frankfurter")) throw new Error("frankfurter circuit open");
  const from = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const url = SERIES_URL.replace("{from}", from);
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!res.ok) {
    recordFailure("frankfurter");
    throw new Error(`frankfurter ${res.status}`);
  }
  const json = (await res.json()) as FrankfurterResponse;
  const dates = Object.keys(json.rates ?? {}).sort();
  if (dates.length < 3) {
    recordFailure("frankfurter");
    throw new Error("frankfurter series too short");
  }
  const currencies = Object.keys(json.rates![dates[0]]!);
  const rates: Record<string, number[]> = {};
  for (const c of currencies) {
    rates[c] = dates.map((d) => json.rates![d]![c]).filter((v) => typeof v === "number");
  }
  recordSuccess("frankfurter");
  return { dates, rates };
}

function dxyFrom(usdPer: Record<string, number>): number {
  let logSum = 0;
  for (const [ccy, weight] of Object.entries(DXY_WEIGHTS)) {
    const v = usdPer[ccy];
    if (!v) return NaN;
    logSum += weight * Math.log(v);
  }
  return 50.14348112 * Math.exp(logSum);
}

export interface GlobalCuesResult {
  quotes: Quote[];
  notes: string[];
  asOf: string;
}

/**
 * USD/INR + DXY-proxy quotes with real percent changes (vs previous business
 * day) and 3-week sparklines. Returns null when the source is unreachable —
 * the global signal then degrades exactly like before.
 */
export async function getGlobalCues(): Promise<GlobalCuesResult | null> {
  try {
    const { value } = await cached("fx:global", 60 * 60 * 1000, fetchSeries.bind(null, 25));
    const { rates } = value;
    const inr = rates.INR;
    const dxy = (() => {
      const out: number[] = [];
      const n = Math.min(...Object.values(rates).map((a) => a.length));
      for (let i = 0; i < n; i++) {
        const point: Record<string, number> = {};
        for (const c of Object.keys(DXY_WEIGHTS)) point[c] = rates[c]![i]!;
        out.push(dxyFrom(point));
      }
      return out;
    })();

    const mk = (symbol: string, name: string, series: number[]): Quote | null => {
      if (series.length < 2) return null;
      const price = series[series.length - 1]!;
      const prev = series[series.length - 2]!;
      const change = price - prev;
      return {
        symbol,
        name,
        price,
        previousClose: prev,
        change,
        changePct: prev !== 0 ? (change / prev) * 100 : 0,
        currency: symbol === "USDINR" ? "INR" : "index",
        asOf: Date.now(),
        spark: series.slice(-16),
      };
    };

    const quotes: Quote[] = [];
    const usdinr = mk("USDINR", "USD/INR", inr ?? []);
    if (usdinr) quotes.push(usdinr);
    const dxyQ = mk("DXY", "Dollar Index (proxy)", dxy);
    if (dxyQ) quotes.push(dxyQ);

    if (quotes.length === 0) return null;
    return {
      quotes,
      notes: [
        "FX cues use ECB end-of-day reference rates (via Frankfurter); the dollar figure is a true-formula DXY proxy.",
      ],
      asOf: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
