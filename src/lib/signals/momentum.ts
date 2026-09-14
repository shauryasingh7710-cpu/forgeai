/**
 * Momentum signal: 5-day & 20-day index change, RSI(14), and market breadth
 * across the curated watchlist.
 */
import { rsi } from "@/lib/indicators/rsi";
import type { IndicatorReading } from "@/lib/data/types";
import {
  clamp,
  fmt,
  fmtPct,
  reading,
  type SignalContext,
  type SignalOutput,
} from "./aggregate";

export function momentumSignal(ctx: SignalContext): SignalOutput {
  const closes = ctx.niftyCloses;
  const base = { group: "momentum" as const, label: "Momentum", weight: 16 };

  if (closes.length < 25) {
    return {
      ...base,
      score: 0,
      why: "Not enough history for momentum yet.",
      readings: [],
      available: false,
    };
  }

  const last = closes[closes.length - 1];
  const chg5 = ((last - closes[closes.length - 6]) / closes[closes.length - 6]) * 100;
  const chg20 = ((last - closes[closes.length - 21]) / closes[closes.length - 21]) * 100;
  const r = rsi(closes) ?? 50;

  // Breadth: official NSE advances/declines for the Nifty 50.
  const b = ctx.breadth;
  const adv = b ? b.advances : 0;
  const dec = b ? b.declines : 0;
  const total = adv + dec;
  const breadth = b && total > 0 ? adv / total : null;

  // Sub-scores.
  const s5 = clamp(chg5 / 2.5, -1, 1); // ±2.5% over 5 days saturates
  const s20 = clamp(chg20 / 6, -1, 1); // ±6% over 20 days saturates
  // RSI: neutral-centered — 30..70 mostly maps into a mild band, extremes fade
  const sRsi =
    r >= 70 ? 0.5 : r <= 30 ? -0.5 : clamp((r - 50) / 40, -0.5, 0.5) * 0.8;
  const sBreadth = breadth == null ? 0 : clamp((breadth - 0.5) * 4, -1, 1);

  const score = clamp(s5 + s20 + sRsi + sBreadth * 0.6, -2, 2);

  const readingsList = [
    reading(
      "5-day change",
      fmtPct(chg5),
      clamp(s5 * 2, -2, 2),
      chg5 >= 0
        ? `Up ${fmt(chg5)}% over the last week — buyers are in control near-term.`
        : `Down ${fmt(Math.abs(chg5))}% over the last week — sellers are pressing near-term.`,
      "momentum_5d",
    ),
    reading(
      "20-day change",
      fmtPct(chg20),
      clamp(s20 * 2, -2, 2),
      chg20 >= 0
        ? `Up ${fmt(chg20)}% over the month — the medium-term swing is positive.`
        : `Down ${fmt(Math.abs(chg20))}% over the month — the medium-term swing is negative.`,
      "momentum_20d",
    ),
    reading(
      "RSI (14)",
      fmt(r),
      clamp(sRsi * 2, -2, 2),
      r >= 70
        ? "RSI above 70 — strong but stretched; rallies can get tired here."
        : r <= 30
          ? "RSI below 30 — heavily sold; bounce attempts often start here."
          : `RSI at ${fmt(r)} — ${r > 50 ? "mildly bullish" : "mildly bearish"} momentum, not extreme.`,
      "rsi",
    ),
  ];

  if (breadth != null) {
    readingsList.push(
      reading(
        `Market breadth (${adv}▲ / ${dec}▼)`,
        `${Math.round(breadth * 100)}% advancing`,
        clamp(sBreadth * 2, -2, 2),
        breadth >= 0.6
          ? "Most Nifty stocks are rising today — broad participation."
          : breadth <= 0.4
            ? "Most Nifty stocks are falling today — narrow, defensive tape."
            : "Mixed participation today — no strong breadth signal.",
        "breadth",
      ),
    );
  }

  return {
    ...base,
    score,
    why:
      breadth != null && Math.abs(breadth - 0.5) > 0.15
        ? `${adv} of ${total} Nifty stocks advanced today and the index ${chg5 >= 0 ? "gained" : "lost"} ${fmt(Math.abs(chg5))}% this week — ${breadth > 0.5 ? "participation confirms the move" : "the move lacks breadth"}.`
        : `${ctx.subject ?? "Index"} is ${chg5 >= 0 ? "up" : "down"} ${fmt(Math.abs(chg5))}% over 5 days and ${chg20 >= 0 ? "up" : "down"} ${fmt(Math.abs(chg20))}% over 20 days with RSI at ${fmt(r)}.`,
    readings: readingsList,
    available: true,
    spark: closes.slice(-30),
  };
}
