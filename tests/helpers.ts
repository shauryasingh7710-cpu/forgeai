/** Deterministic synthetic candle-series helpers for tests. */

export function risingCloses(n: number, start = 100, driftPct = 0.3): number[] {
  return Array.from({ length: n }, (_, i) => start * Math.pow(1 + driftPct / 100, i));
}

export function fallingCloses(n: number, start = 100, driftPct = 0.3): number[] {
  return Array.from({ length: n }, (_, i) => start * Math.pow(1 - driftPct / 100, i));
}

/** Continue a series geometrically from its last value (for trend turns). */
export function continueFrom(values: number[], n: number, driftPct: number): number[] {
  const last = values[values.length - 1];
  return Array.from({ length: n }, (_, i) => last * Math.pow(1 + driftPct / 100, i + 1));
}

export function flatCloses(n: number, level = 100): number[] {
  return Array.from({ length: n }, () => level);
}

export function closesWithVolumes(
  closes: number[],
  baseVolume = 1_000_000,
): { close: number; volume: number }[] {
  return closes.map((close, i) => ({
    close,
    volume: baseVolume * (1 + 0.01 * ((i * 7) % 5)),
  }));
}
