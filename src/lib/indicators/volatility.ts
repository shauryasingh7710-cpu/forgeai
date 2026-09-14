/**
 * Realized volatility: annualized standard deviation of daily log returns
 * over the trailing window (default 20 sessions, ~250 trading days/year).
 */
export function realizedVol(closes: number[], window = 20): number | null {
  if (closes.length < window + 1) return null;
  const rets: number[] = [];
  for (let i = closes.length - window; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(250) * 100; // percent per year
}
