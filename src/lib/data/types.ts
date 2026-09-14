/**
 * Shared types for the MarketPulse signal pipeline.
 */

// ---------------------------------------------------------------- candles --
export interface Candle {
  time: number; // epoch seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  currency: string;
  asOf: number; // epoch ms
  spark: number[]; // recent closes for sparklines
}

// ---------------------------------------------------------------- signals --
export type SignalGroup =
  | "trend"
  | "momentum"
  | "volatility"
  | "volume"
  | "structure"
  | "global"
  | "news"
  | "flows";

/** One atomic indicator reading inside a signal group. */
export interface IndicatorReading {
  name: string; // e.g. "RSI (14)"
  value: string; // formatted value, e.g. "62.4"
  score: number; // -2..+2
  note: string; // short plain-English note
  explainKey: string; // key into the education explainers
}

export interface Signal {
  group: SignalGroup;
  label: string; // e.g. "Trend"
  score: number; // -2..+2
  weight: number; // composite weight
  why: string; // one-sentence plain-English reason
  readings: IndicatorReading[];
  available: boolean;
  spark?: number[];
}

export type Zone = "Bearish" | "Cautious" | "Uncertain" | "Optimistic" | "Bullish";

export interface CompositeScore {
  score: number; // -100..+100
  zone: Zone;
  drivers: { group: SignalGroup; label: string; contribution: number }[];
}

// ------------------------------------------------------------------ news ---
export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: number; // epoch ms
  sentiment: number; // -1..+1
  topics: string[];
}

// ------------------------------------------------------------------ flows --
export interface FiiDiiData {
  date: string;
  fiiNetCr: number | null; // ₹ crore
  diiNetCr: number | null;
  available: boolean;
  note: string;
}

// ------------------------------------------------------------------- ai ----
export interface Narrative {
  headline: string;
  body: string;
  watchList: string[];
  citedGroups: SignalGroup[];
  source: "llm" | "template";
  model?: string;
}

/** The exact payload handed to the LLM — also what groundedness checks against. */
export interface SignalPayload {
  asOf: string;
  composite: { score: number; zone: Zone };
  groups: {
    group: SignalGroup;
    label: string;
    score: number;
    weight: number;
    why: string;
    /** How many points this group contributes to the composite (may be negative). */
    contribution?: number;
    /** Top indicator readings for deeper grounded explanations. */
    readings?: { name: string; value: string; note: string }[];
  }[];
  indices: { symbol: string; name: string; price: number; changePct: number }[];
  vix: { value: number; changePct: number } | null;
  newsHeadlines: string[];
}

// ---------------------------------------------------------------- prism ----
export type EvaluatorName =
  | "groundedness"
  | "consistency"
  | "advice_safety"
  | "completeness";

export interface EvaluatorResult {
  name: EvaluatorName;
  passed: boolean;
  score: number; // 0..1
  details: string;
  violations?: string[];
}

export interface PrismSession {
  sessionId: string;
  createdAt: string;
  goal: string;
  input: SignalPayload;
  prompt: string;
  output: Narrative;
  compositeScore: number;
  zone: Zone;
  evaluators: EvaluatorResult[];
  guardrailTriggered: boolean;
  failureClass: string | null;
  model: string;
  latencyMs: number;
}
