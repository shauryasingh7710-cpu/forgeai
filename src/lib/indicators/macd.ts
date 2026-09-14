/**
 * MACD (12/26/9): EMA12 − EMA26, signal = EMA9 of MACD, histogram = MACD − signal.
 */
function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
  crossState: "bullish" | "bearish" | "none"; // recent crossover direction
}

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdResult | null {
  if (closes.length < slow + signalPeriod) return null;

  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const line = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(line.slice(slow - 1), signalPeriod);

  const m = line[line.length - 1];
  const s = signalLine[signalLine.length - 1];
  const histogram = m - s;

  // Detect a crossover within the last 10 sessions (~2 weeks).
  let crossState: MacdResult["crossState"] = "none";
  for (let i = line.length - 10; i < line.length; i++) {
    if (i <= 0) continue;
    const li = line[i];
    const si = signalLine[i - (slow - 1)];
    const lj = line[i - 1];
    const sj = signalLine[i - 1 - (slow - 1)];
    if (lj <= sj && li > si) crossState = "bullish";
    if (lj >= sj && li < si) crossState = "bearish";
  }

  return { macd: m, signal: s, histogram, crossState };
}
