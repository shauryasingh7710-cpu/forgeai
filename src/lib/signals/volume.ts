/**
 * Volume signal: real volume participation from the published numbers.
 *
 * Inputs (all REAL, from the snapshot — never reconstructed):
 *   • day volume vs its 20-day average  → conviction vs pressure
 *   • 20-day avg vs 30-day avg volume   → participation rising or fading
 *   • today's real price direction      → which side the volume supports
 */
import {
  clamp,
  fmt,
  makeSignal,
  reading,
  type SignalContext,
  type SignalOutput,
} from "./aggregate";

export function volumeSignal(ctx: SignalContext): SignalOutput {
  const base = { group: "volume" as const, label: "Volume", weight: 10 };
  const stock = ctx.stock;

  if (!stock || stock.volDay == null || stock.volDay <= 0 || !stock.volAvg20 || stock.volAvg20 <= 0) {
    return {
      ...base,
      score: 0,
      why: "Volume data unavailable — signal excluded from scoring.",
      readings: [],
      available: false,
    };
  }

  const ratio = stock.volDay / stock.volAvg20;
  const upDay = (stock.changePct ?? 0) >= 0;

  const readings: ReturnType<typeof reading>[] = [];
  let sum = 0;
  let parts = 0;

  // 1) day volume vs 20-day average, signed by the REAL day direction
  {
    const s = clamp((ratio - 1) * 1.5, -1, 1) * (upDay ? 1 : -1);
    sum += s;
    parts += 1;
    readings.push(
      reading(
        "Volume vs 20-day avg",
        `${fmt(ratio, 2)}×`,
        clamp(s * 2, -2, 2),
        ratio > 1.5
          ? `Volume is ${fmt(ratio, 1)}× the recent average — unusually high activity ${upDay ? "on an up day (buyers committed)" : "on a down day (sellers committed)"}.`
          : ratio < 0.7
            ? "Volume is thin — today's move lacks participation."
            : "Volume is near normal levels.",
        "volume_ratio",
      ),
    );
  }

  // 2) participation trend: 20-day avg vs 30-day avg volume (both real)
  if (stock.volAvg30 && stock.volAvg30 > 0) {
    const trend = stock.volAvg20 / stock.volAvg30;
    const s = clamp((trend - 1) * 4, -0.6, 0.6);
    sum += s;
    parts += 1;
    readings.push(
      reading(
        "Participation trend",
        `${trend >= 1 ? "+" : ""}${Math.round((trend - 1) * 100)}%`,
        clamp(s * 2, -2, 2),
        trend > 1.05
          ? "Average volume is rising week-over-week — engagement is increasing."
          : trend < 0.95
            ? "Average volume is fading week-over-week — interest is cooling."
            : "Average volume is stable.",
        "participation_trend",
      ),
    );
  }

  const score = clamp((sum / Math.max(1, parts)) * 2, -2, 2);
  return {
    ...base,
    score,
    why:
      ratio > 1.5
        ? `Today traded ${fmt(ratio, 1)}× normal volume — ${score >= 0 ? "buyers are committed" : "sellers are committed"}.`
        : ratio < 0.7
          ? "Volume is thin today — the move lacks broad participation."
          : "Volume activity is unremarkable — no strong accumulation or distribution signal.",
    readings,
    available: true,
  };
}
