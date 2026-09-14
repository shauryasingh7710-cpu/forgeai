/**
 * Volatility signal: India VIX level & day change (the market's fear gauge)
 * plus 20-day realized volatility on the index.
 */
import { realizedVol } from "@/lib/indicators/volatility";
import {
  clamp,
  fmt,
  fmtPct,
  makeSignal,
  reading,
  type SignalContext,
  type SignalOutput,
} from "./aggregate";

export function volatilitySignal(ctx: SignalContext): SignalOutput {
  const closes = ctx.niftyCloses;
  const base = { group: "volatility" as const, label: "Volatility", weight: 14 };

  const readings: ReturnType<typeof reading>[] = [];
  let parts = 0;
  let sum = 0;

  const vix = ctx.vix;
  if (vix && vix.value > 0) {
    // INTRADAY-FIRST: the day change is the live fear signal; the level is
    // context (a high-but-falling VIX means fear is cooling today).
    const levelScore = vix.value < 13 ? 0.4 : vix.value <= 18 ? 0 : vix.value <= 24 ? -0.5 : -1.2;
    const chgScore = clamp(-vix.changePct / 6, -2, 2); // a 12%+ VIX day saturates the sub-score
    sum += levelScore * 0.6 + chgScore * 1.4;
    parts += 2;

    readings.push(
      reading(
        "India VIX level",
        fmt(vix.value),
        clamp(levelScore * 1.25, -2, 2),
        vix.value < 13
          ? "VIX is low — markets are calm and complacent."
          : vix.value <= 18
            ? "VIX is in the normal zone — no panic priced in."
            : vix.value <= 24
              ? "VIX is elevated — investors are paying up for protection."
              : "VIX is very high — genuine fear in the market.",
        "vix",
      ),
      reading(
        "VIX day change",
        fmtPct(vix.changePct),
        clamp(chgScore * 1.25, -2, 2),
        vix.changePct > 5
          ? "VIX spiked today — stress is rising right now."
          : vix.changePct < -5
            ? "VIX dropped today — fear is cooling."
            : "VIX is roughly flat today.",
        "vix",
      ),
    );
  }

  const rv = closes.length > 21 ? realizedVol(closes) : null;
  if (rv != null) {
    // Realized vol vs rough Nifty norms: 10% calm, 15% normal, 20%+ stressed.
    const rvScore =
      rv < 10 ? 0.6 : rv <= 15 ? 0 : rv <= 22 ? -0.6 : -1.4;
    sum += rvScore;
    parts += 1;
    readings.push(
      reading(
        "Realized volatility (20d)",
        `${fmt(rv)}%`,
        clamp(rvScore * 1.4, -2, 2),
        rv <= 15
          ? "Actual swings have been modest compared to history."
          : "Actual swings are running hot versus normal.",
        "realized_vol",
      ),
    );
  }

  if (parts === 0) {
    return {
      ...base,
      score: 0,
      why: "Volatility data unavailable — signal excluded from the composite.",
      readings: [],
      available: false,
    };
  }

  const score = clamp((sum / Math.max(1, parts)) * 2, -2, 2);
  const isStock = Boolean(ctx.subject);
  const vixTxt = vix
    ? `India VIX at ${fmt(vix.value)} (${fmtPct(vix.changePct)} today)`
    : isStock
      ? "Stock-specific realized volatility only"
      : "India VIX unavailable";

  const vixLevelWord = vix ? (vix.value < 13 ? "calm" : "within normal ranges") : isStock ? "in a normal band for this stock" : "stable";

  return {
    ...base,
    score,
    why:
      vix && vix.value > 18
        ? `${vixTxt} — elevated volatility argues for caution.`
        : vix && vix.changePct < -5
          ? `${vixTxt} — fear is cooling quickly.`
          : `${vixTxt} — volatility is ${vixLevelWord}.`,
    readings,
    available: true,
    spark: closes.slice(-30),
  };
}
