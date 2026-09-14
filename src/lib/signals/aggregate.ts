/**
 * Signal-adapter shared types and helpers.
 */
import type { IndicatorReading, Signal, SignalGroup } from "@/lib/data/types";

export interface SignalContext {
  /** Index or stock closes the adapters operate over. */
  niftyCloses: number[];
  /** Display name for the instrument these signals describe (default Nifty). */
  subject?: string;
  vix?: { value: number; changePct: number };
  /** Official NSE advances/declines for the Nifty 50 (real breadth). */
  breadth?: { advances: number; declines: number; unchanged: number };
  globalMoves?: { name: string; changePct: number; kind?: string }[];
  news?: { sentiment: number; topics: string[] }[];
  flows?: { fiiNetCr: number | null; diiNetCr: number | null; available: boolean };
  stock?: {
    name: string;
    closes: number[];
    volumes: number[];
    /** Real published volume figures (MoneyControl) — preferred over series. */
    volDay?: number | null;
    volAvg20?: number | null;
    volAvg30?: number | null;
    changePct?: number;
    /** Real published 52-week band (MoneyControl) for stock structure. */
    w52High?: number | null;
    w52Low?: number | null;
    /** Real published DMAs (MoneyControl) for stock trend. */
    dma50?: number | null;
    dma200?: number | null;
  };
  /** Real published 52-week band (NSE) — overrides the series min/max. */
  w52High?: number | null;
  w52Low?: number | null;
  /** Real published DMAs (MoneyControl) — overrides series SMAs in trend. */
  realDmas?: { dma50: number; dma200: number };
}

export interface SignalOutput {
  group: SignalGroup;
  label: string;
  score: number; // -2..+2
  weight: number;
  why: string;
  readings: IndicatorReading[];
  available: boolean;
  spark?: number[];
}

export function makeSignal(out: SignalOutput): Signal {
  return out;
}

export function reading(
  name: string,
  value: string,
  score: number,
  note: string,
  explainKey: string,
): IndicatorReading {
  return { name, value, score, note, explainKey };
}

/** Clamp helper. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function fmt(v: number, digits = 1): string {
  return v.toFixed(digits);
}

export function fmtPct(v: number, digits = 2): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}
