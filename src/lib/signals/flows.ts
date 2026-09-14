/**
 * FII/DII flows signal: institutional cash-market activity — the "smart
 * money" context. Gracefully excluded when NSE blocks the fetch.
 */
import {
  clamp,
  fmt,
  makeSignal,
  reading,
  type SignalContext,
  type SignalOutput,
} from "./aggregate";

export function flowsSignal(
  flows: { fiiNetCr: number | null; diiNetCr: number | null; available: boolean },
): SignalOutput {
  const base = { group: "flows" as const, label: "FII/DII flows", weight: 8 };

  if (!flows.available || (flows.fiiNetCr == null && flows.diiNetCr == null)) {
    return {
      ...base,
      score: 0,
      why: "Flow data unavailable today — signal excluded from the composite (weights renormalized).",
      readings: [],
      available: false,
    };
  }

  const readings: ReturnType<typeof reading>[] = [];
  let sum = 0;
  let parts = 0;

  if (flows.fiiNetCr != null) {
    // ±₹2000 crore saturates the score.
    const s = clamp(flows.fiiNetCr / 2000, -1, 1);
    sum += s;
    parts += 1;
    readings.push(
      reading(
        "FII net (cash)",
        `${flows.fiiNetCr >= 0 ? "+" : ""}${fmt(flows.fiiNetCr, 0)} ₹cr`,
        clamp(s * 2, -2, 2),
        flows.fiiNetCr > 0
          ? "Foreign institutions bought in the cash market — supportive."
          : "Foreign institutions sold in the cash market — a demand drag.",
        "fii_dii",
      ),
    );
  }

  if (flows.diiNetCr != null) {
    const s = clamp(flows.diiNetCr / 2000, -1, 1);
    sum += s * 0.7; // DIIs often counterbalance FIIs; weight less.
    parts += 1;
    readings.push(
      reading(
        "DII net (cash)",
        `${flows.diiNetCr >= 0 ? "+" : ""}${fmt(flows.diiNetCr, 0)} ₹cr`,
        clamp(s * 2, -2, 2),
        flows.diiNetCr > 0
          ? "Domestic institutions bought — local demand absorbing supply."
          : "Domestic institutions sold — even local demand is cautious.",
        "fii_dii",
      ),
    );
  }

  const score = clamp((sum / Math.max(1, parts)) * 2, -2, 2);

  return {
    ...base,
    score,
    why:
      flows.fiiNetCr != null && flows.fiiNetCr < -1000
        ? `FIIs sold ₹${fmt(Math.abs(flows.fiiNetCr), 0)}cr — sustained foreign selling pressures the index.`
        : flows.fiiNetCr != null && flows.fiiNetCr > 1000
          ? `FIIs bought ₹${fmt(flows.fiiNetCr, 0)}cr — foreign money is supporting the market.`
          : "Institutional flows were modest — no strong smart-money signal today.",
    readings,
    available: true,
  };
}
