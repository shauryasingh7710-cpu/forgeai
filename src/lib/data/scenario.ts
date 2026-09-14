/**
 * Scenario explorer — HONEST simulation for demos and teaching.
 *
 * Enabled only via ?scenario=bullish|bearish|neutral. The pipeline reshapes
 * TODAY'S inputs (day move, breadth, VIX change, sector moves) into a
 * coherent alternative tape; the dashboard always discloses the simulation
 * in a prominent banner — it never pretends to be live data, and Stock Focus
 * (real per-stock published indicators) is never touched.
 */

export type Scenario = "bullish" | "bearish" | "neutral";

export function parseScenario(value: string | null | undefined): Scenario | null {
  return value === "bullish" || value === "bearish" || value === "neutral" ? value : null;
}

export interface ScenarioPreset {
  /** Simulated Nifty day-move (% vs previous close). */
  dayPct: number;
  /** Simulated Nifty-50 breadth for the day. */
  adv: number;
  dec: number;
  /** Banner label. */
  label: string;
  /** Short chip label. */
  chip: string;
}

export const SCENARIO_PRESETS: Record<Scenario, ScenarioPreset> = {
  bullish: { dayPct: 1.6, adv: 44, dec: 5, label: "BULLISH SCENARIO (relief rally) — simulated day for demonstration", chip: "Bullish" },
  bearish: { dayPct: -1.3, adv: 6, dec: 43, label: "BEARISH SCENARIO (sell-off) — simulated day for demonstration", chip: "Bearish" },
  neutral: { dayPct: 0.05, adv: 24, dec: 25, label: "NEUTRAL SCENARIO (flat tape) — simulated day for demonstration", chip: "Neutral" },
};

export function clampAbs(n: number, abs: number): number {
  return Math.max(-abs, Math.min(abs, n));
}
