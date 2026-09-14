/**
 * Global cues signal: the dollar and the rupee — the two FX variables that
 * drive Indian equity flows. USD/INR comes from ECB reference rates and the
 * dollar reading is a true-formula DXY proxy computed from the same table.
 *
 *   • Stronger dollar → EM outflows, rupee pressure → headwind
 *   • Rupee weakening vs USD → import (incl. crude) inflation → headwind
 *
 * Both readings use REAL percent changes (ECB end-of-day rates, cached 1h).
 */
import {
  clamp,
  fmtPct,
  makeSignal,
  reading,
  type SignalContext,
  type SignalOutput,
} from "./aggregate";

interface GlobalQuote {
  name: string;
  changePct: number;
  price?: number;
  spark?: number[];
}

export function globalSignal(quotes: GlobalQuote[]): SignalOutput {
  const base = { group: "global" as const, label: "Global cues", weight: 13 };

  if (quotes.length === 0) {
    return {
      ...base,
      score: 0,
      why: "Global FX data unavailable — signal excluded from the composite.",
      readings: [],
      available: false,
    };
  }

  const usdinr = quotes.find((q) => q.name === "USD/INR");
  const dxy = quotes.find((q) => q.name.startsWith("Dollar Index"));

  const readings: ReturnType<typeof reading>[] = [];
  let sum = 0;
  let parts = 0;

  // Dollar Index proxy: rising dollar = emerging-market pressure.
  if (dxy) {
    const s = clamp(-dxy.changePct / 0.6, -1, 1);
    sum += s;
    parts += 1;
    readings.push(
      reading(
        "Dollar Index (proxy)",
        fmtPct(dxy.changePct),
        clamp(s * 2, -2, 2),
        dxy.changePct > 0
          ? "The dollar strengthened overnight — usually a headwind for Indian equities and the rupee."
          : dxy.changePct < 0
            ? "The dollar softened overnight — usually a tailwind for emerging markets."
            : "The dollar was flat overnight.",
        "dxy",
      ),
    );
  }

  // USD/INR: rupee weakening = imported inflation + FII outflow pressure.
  if (usdinr) {
    // positive changePct here means rupee WEAKENED (more rupees per USD)
    const s = clamp(-usdinr.changePct / 0.5, -1, 1);
    sum += s;
    parts += 1;
    readings.push(
      reading(
        "USD/INR",
        `₹${usdinr.price?.toFixed(2) ?? "—"}`,
        clamp(s * 2, -2, 2),
        usdinr.changePct > 0.1
          ? "The rupee weakened against the dollar — import costs and foreign-outflow risk rise."
          : usdinr.changePct < -0.1
            ? "The rupee strengthened against the dollar — supportive for equities and imports."
            : "The rupee held steady against the dollar.",
        "usdinr",
      ),
    );
  }

  if (parts === 0) {
    return { ...base, score: 0, why: "No usable global data.", readings: [], available: false };
  }

  const score = clamp((sum / parts) * 2, -2, 2);

  return {
    ...base,
    score,
    why:
      score > 0.4
        ? "The dollar eased and/or the rupee held firm — a supportive macro backdrop for Indian equities."
        : score < -0.4
          ? "Dollar strength and/or a softening rupee — macro cues are cautious for the Indian open."
          : "FX cues are broadly neutral — no strong tailwind or headwind into today's trade.",
    readings,
    available: true,
  };
}
