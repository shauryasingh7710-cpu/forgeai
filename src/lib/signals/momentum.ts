/**
 * Momentum signal — INTRADAY-FIRST.
 *
 * Dominant inputs: today's move, yesterday's move, and today's official
 * breadth (advances/declines). Multi-day context (5-day change, RSI) is a
 * small tie-breaker so a 5-week downtrend cannot pin the reading while the
 * day itself is strong.
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
  const base = { group: "momentum" as const, label: "Intraday momentum", weight: 26 };

  if (closes.length < 25) {
    return {
      ...base,
      score: 0,
      why: "Not enough history for momentum yet.",
      readings: [],
      available: false,
    };
  }

  const n = closes.length;
  const last = closes[n - 1]!;
  const prev = closes[n - 2]!;
  const beforePrev = closes[n - 3]!;
  const chg1 = ((last - prev) / prev) * 100; // today
  const chgY = ((prev - beforePrev) / beforePrev) * 100; // yesterday
  const chg5 = ((last - closes[n - 6]!) / closes[n - 6]!) * 100;
  const r = rsi(closes) ?? 50;

  // Breadth: official NSE advances/declines for the Nifty 50 (today).
  const b = ctx.breadth;
  const adv = b ? b.advances : 0;
  const dec = b ? b.declines : 0;
  const total = adv + dec;
  const breadth = b && total > 0 ? adv / total : null;

  // Sub-scores — today dominates, yesterday confirms, breadth corroborates.
  const sToday = clamp(chg1 / 0.8, -1.6, 1.6); // ±0.8% starts saturating the day
  const sYest = clamp(chgY / 1.2, -0.6, 0.6); // yesterday: half voice
  const sBreadth = breadth == null ? 0 : clamp((breadth - 0.5) * 4, -1, 1);
  const s5 = clamp(chg5 / 2.5, -1, 1) * 0.35; // multi-day context: tie-breaker only

  const score = clamp(sToday * 1.15 + sYest + sBreadth * 1.0 + s5, -2, 2);

  const readingsList: IndicatorReading[] = [
    reading(
      "Today's move",
      fmtPct(chg1),
      clamp(sToday * 1.8, -2, 2),
      chg1 >= 0
        ? `Up ${fmt(chg1)}% today — buyers are leading the session.`
        : `Down ${fmt(Math.abs(chg1))}% today — sellers are leading the session.`,
      "momentum_1d",
    ),
    reading(
      "Yesterday's move",
      fmtPct(chgY),
      clamp(sYest * 1.8, -2, 2),
      chgY >= 0
        ? `Rose ${fmt(chgY)}% yesterday — a second straight ${chg1 >= 0 ? "gain would confirm" : "gain softens today's dip"}.`
        : `Fell ${fmt(Math.abs(chgY))}% yesterday — ${chg1 >= 0 ? "today is a bounce attempt" : "back-to-back pressure"}.`,
      "momentum_prev",
    ),
  ];

  if (breadth != null) {
    readingsList.push(
      reading(
        `Today's breadth (${adv}▲ / ${dec}▼)`,
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

  readingsList.push(
    reading(
      "RSI (14) — context",
      fmt(r),
      clamp((r >= 70 ? 0.5 : r <= 30 ? -0.5 : clamp((r - 50) / 40, -0.5, 0.5) * 0.8) * 2, -2, 2),
      r >= 70
        ? "RSI above 70 — strong but stretched."
        : r <= 30
          ? "RSI below 30 — heavily sold; bounces often start here."
          : `RSI at ${fmt(r)} — ${r > 50 ? "mildly positive" : "mildly negative"} backdrop.`,
      "rsi",
    ),
  );

  return {
    ...base,
    score,
    why:
      breadth != null && Math.abs(breadth - 0.5) > 0.15
        ? `Nifty is ${chg1 >= 0 ? "up" : "down"} ${fmt(Math.abs(chg1))}% today with ${adv}▲/${dec}▼ breadth and ${chgY >= 0 ? "+" : ""}${fmt(chgY)}% yesterday — ${chg1 >= 0 && breadth > 0.5 ? "the day's strength is broad" : chg1 < 0 && breadth < 0.5 ? "the day's weakness is broad" : "the tape is mixed"}.`
        : `${ctx.subject ?? "Index"} is ${chg1 >= 0 ? "up" : "down"} ${fmt(Math.abs(chg1))}% today after ${chgY >= 0 ? "+" : ""}${fmt(chgY)}% yesterday.`,
    readings: readingsList,
    available: true,
    spark: closes.slice(-30),
  };
}
