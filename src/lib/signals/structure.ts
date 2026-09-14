/**
 * Structure signal: 52-week range position and proximity to 20-day
 * support/resistance.
 */
import { structure } from "@/lib/indicators/structure";
import {
  clamp,
  fmt,
  makeSignal,
  reading,
  type SignalContext,
  type SignalOutput,
} from "./aggregate";

export function structureSignal(ctx: SignalContext): SignalOutput {
  const closes = ctx.niftyCloses;
  const base = { group: "structure" as const, label: "Structure", weight: 6 };

  const res = closes.length > 60 ? structure({ closes, w52High: ctx.w52High ?? ctx.stock?.w52High ?? null, w52Low: ctx.w52Low ?? ctx.stock?.w52Low ?? null }) : null;
  const subject = ctx.subject ?? "Nifty";
  if (!res) {
    return {
      ...base,
      score: 0,
      why: "Not enough history for range structure; excluded from scoring.",
      readings: [],
      available: false,
    };
  }

  // Range position: 0 (at 52w low) → 1 (at 52w high), centered at 0.5.
  const rangeScore = clamp((res.rangePosition - 0.5) * 2, -1, 1);
  const srScore = res.near20dHigh ? 0.4 : res.near20dLow ? -0.4 : 0;
  const score = clamp(rangeScore + srScore, -2, 2);

  return {
    ...base,
    score,
    why:
      res.rangePosition > 0.8
        ? `${subject} trades near its 52-week high (${fmt(res.pctFrom52wHigh)}% below it) — strong structure, momentum-friendly.`
        : res.rangePosition < 0.2
          ? `${subject} sits near its 52-week low (${fmt(res.pctFrom52wLow)}% above it) — weak structure, but support is close.`
          : `${subject} is ${fmt(res.rangePosition * 100, 0)}% of the way through its 52-week range — mid-range, no structural extreme.`,
    readings: [
      reading(
        "52-week range position",
        `${fmt(res.rangePosition * 100, 0)}%`,
        clamp(rangeScore * 2, -2, 2),
        `${fmt(res.pctFrom52wHigh)}% below the 52-week high, ${fmt(res.pctFrom52wLow)}% above the 52-week low.`,
        "range_52w",
      ),
      reading(
        "20-day level",
        res.near20dHigh ? "At 20-day high" : res.near20dLow ? "At 20-day low" : "Mid-range",
        clamp(srScore * 2, -2, 2),
        res.near20dHigh
          ? "Pressing the top of the recent range — resistance is being tested."
          : res.near20dLow
            ? "Sitting on the bottom of the recent range — support is being tested."
            : "Price is between recent support and resistance.",
        "support_resistance",
      ),
    ],
    available: true,
    spark: closes.slice(-30),
  };
}
