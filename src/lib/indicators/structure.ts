/**
 * Structure: where price sits in its 52-week range, and proximity to the
 * 20-day high (resistance) / low (support).
 *
 * Accepts optional REAL 52-week anchors (NSE's published yearHigh/yearLow).
 * When provided, they override the series min/max — the reconstruction is
 * clamped to the real band anyway, but this makes the exact published band
 * authoritative even if the series never touches the extremes.
 */
export interface StructureInput {
  closes: number[];
  w52High?: number | null;
  w52Low?: number | null;
}

export interface StructureResult {
  pctFrom52wLow: number;
  pctFrom52wHigh: number;
  rangePosition: number; // 0..1 through the 52w range
  near20dHigh: boolean; // within 2% of the 20-day high
  near20dLow: boolean; // within 2% of the 20-day low
}

export function structure(input: StructureInput | number[]): StructureResult | null {
  const closes = Array.isArray(input) ? input : input.closes;
  if (closes.length < 60) return null;

  const seriesYear = closes.slice(-250);
  const last = seriesYear[seriesYear.length - 1];

  // Real anchors win when provided and sane (low < high, both > 0).
  const anchorHigh = !Array.isArray(input) && input.w52High ? input.w52High : null;
  const anchorLow = !Array.isArray(input) && input.w52Low ? input.w52Low : null;
  const useAnchors = anchorHigh != null && anchorLow != null && anchorLow > 0 && anchorHigh > anchorLow;

  const high = useAnchors ? Math.max(anchorHigh, last) : Math.max(...seriesYear);
  const low = useAnchors ? Math.min(anchorLow, last) : Math.min(...seriesYear);

  const window20 = closes.slice(-20);
  const hi20 = Math.max(...window20);
  const lo20 = Math.min(...window20);

  return {
    pctFrom52wLow: low > 0 ? ((last - low) / low) * 100 : 0,
    pctFrom52wHigh: high > 0 ? ((last - high) / high) * 100 : 0,
    rangePosition: high !== low ? (last - low) / (high - low) : 0.5,
    near20dHigh: last >= hi20 * 0.98,
    near20dLow: last <= lo20 * 1.02,
  };
}
