/** Simple moving average over the last `period` values. */
export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Series of SMAs (last `out` points) for sparklines of an indicator. */
export function smaSeries(values: number[], period: number, out = 30): number[] {
  const res: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    res.push(sum / period);
  }
  return res.slice(-out);
}
