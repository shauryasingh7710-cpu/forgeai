/**
 * Bollinger Bands (20, 2σ): %B position of price within the bands plus a
 * squeeze flag (band width in the bottom quintile of the past year).
 */
import { sma } from "./sma";

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  percentB: number; // 0 = at lower band, 1 = at upper band (can exceed)
  squeeze: boolean; // unusually narrow bands
}

export function bollinger(closes: number[], period = 20, mult = 2): BollingerResult | null {
  if (closes.length < period + 20) return null;
  const middle = sma(closes, period);
  if (middle == null) return null;

  const slice = closes.slice(-period);
  const variance =
    slice.reduce((a, b) => a + (b - middle) ** 2, 0) / period;
  const sd = Math.sqrt(variance);

  const upper = middle + mult * sd;
  const lower = middle - mult * sd;
  const percentB = upper !== lower ? (closes[closes.length - 1] - lower) / (upper - lower) : 0.5;

  // Band-width percentile over the past year (approx: available history).
  const widths: number[] = [];
  for (let i = period; i <= closes.length; i++) {
    const win = closes.slice(i - period, i);
    const mean = win.reduce((a, b) => a + b, 0) / period;
    const v = win.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    widths.push((2 * mult * Math.sqrt(v)) / mean);
  }
  const sorted = [...widths].sort((a, b) => a - b);
  const current = widths[widths.length - 1];
  const rank = sorted.findIndex((w) => w >= current) / Math.max(1, sorted.length - 1);

  return { upper, middle, lower, percentB, squeeze: rank <= 0.2 };
}
