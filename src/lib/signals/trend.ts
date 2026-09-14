/**
 * Trend signal: price vs 50-DMA and 200-DMA, plus 50×200 cross state.
 */
import { sma } from "@/lib/indicators/sma";
import {
  clamp,
  fmt,
  fmtPct,
  makeSignal,
  reading,
  type SignalContext,
  type SignalOutput,
} from "./aggregate";

export function trendSignal(ctx: SignalContext): SignalOutput {
  const closes = ctx.niftyCloses;
  const base = {
    group: "trend" as const,
    label: "Trend",
    weight: 18,
  };

  if (closes.length < 210) {
    return {
      ...base,
      score: 0,
      why: "Not enough history to compute trend reliably yet.",
      readings: [],
      available: false,
    };
  }

  const last = closes[closes.length - 1];
  // REAL published DMAs (MoneyControl, scaled to index level via the Nifty
  // ETF ratio) when available; series SMAs otherwise.
  const dma50 = ctx.realDmas?.dma50 ?? sma(closes, 50)!;
  const dma200 = ctx.realDmas?.dma200 ?? sma(closes, 200)!;
  const dma50Prev = sma(closes.slice(0, -3), 50)!;
  const dma200Prev = sma(closes.slice(0, -3), 200)!;

  const dist50 = ((last - dma50) / dma50) * 100;
  const dist200 = ((last - dma200) / dma200) * 100;

  const above50 = last > dma50;
  const above200 = last > dma200;

  // Cross detection: compare dma50 vs dma200 now vs ~3 sessions ago.
  const crossNow = dma50 > dma200;
  const crossPrev = dma50Prev > dma200Prev;
  let crossState: "golden" | "death" | "none" = "none";
  if (!crossPrev && crossNow) crossState = "golden";
  if (crossPrev && !crossNow) crossState = "death";

  // Sub-scores in -1..+1 each, summed and clamped to -2..+2.
  const s50 = clamp(dist50 / 3, -1, 1); // ±3% from 50-DMA saturates
  const s200 = clamp(dist200 / 8, -1, 1); // ±8% from 200-DMA saturates
  const crossBonus = crossState === "golden" ? 0.4 : crossState === "death" ? -0.4 : 0;
  const score = clamp(s50 + s200 + crossBonus, -2, 2);

  const readings = [
    reading(
      "50-DMA position",
      fmtPct(dist50),
      clamp(s50 * 2, -2, 2),
      above50
        ? "Trading above the 50-day average — short-term trend is up."
        : "Trading below the 50-day average — short-term trend is down.",
      "dma",
    ),
    reading(
      "200-DMA position",
      fmtPct(dist200),
      clamp(s200 * 2, -2, 2),
      above200
        ? "Above the 200-day average — the long-term trend is intact."
        : "Below the 200-day average — long-term trend is under pressure.",
      "dma",
    ),
    reading(
      "50×200 cross",
      crossState === "golden" ? "Golden cross" : crossState === "death" ? "Death cross" : `50-DMA ${crossNow ? "above" : "below"} 200-DMA`,
      crossState === "golden" ? 1.5 : crossState === "death" ? -1.5 : crossNow ? 0.5 : -0.5,
      crossState === "golden"
        ? "50-DMA just crossed above the 200-DMA — a classic bullish trend confirmation."
        : crossState === "death"
          ? "50-DMA just crossed below the 200-DMA — a classic bearish warning."
          : crossNow
            ? "No fresh crossover, but the medium trend sits above the long trend."
            : "No fresh crossover; the medium trend sits below the long trend.",
      "golden_cross",
    ),
  ];

  const subject = ctx.subject ?? "Nifty";
  const why = above50 && above200
    ? `${subject} is above both its 50-DMA (${fmt(dma50, 0)}) and 200-DMA (${fmt(dma200, 0)}) — trend structure is bullish.`
    : !above50 && !above200
      ? `${subject} is below both its 50-DMA (${fmt(dma50, 0)}) and 200-DMA (${fmt(dma200, 0)}) — trend structure is bearish.`
      : above50
        ? `${subject} is above its 50-DMA but below the 200-DMA — a repair attempt inside a longer downtrend.`
        : `${subject} is above its 200-DMA but below the 50-DMA — a pullback inside a longer uptrend.`;

  return {
    ...base,
    score,
    why,
    readings,
    available: true,
    spark: closes.slice(-30),
  };
}
