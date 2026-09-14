/**
 * Composite scorer: fuses all signal groups into one −100..+100 score with a
 * labeled zone, using fixed, visible weights. Unavailable signals are dropped
 * and the remaining weights renormalized — the system degrades, it never breaks.
 */
import type { CompositeScore, Signal, SignalGroup, Zone, SignalPayload, NewsItem } from "@/lib/data/types";

export const ZONE_THRESHOLDS: { min: number; zone: Zone }[] = [
  { min: 35, zone: "Bullish" },
  { min: 10, zone: "Optimistic" },
  { min: -10, zone: "Uncertain" },
  { min: -35, zone: "Cautious" },
  { min: -Infinity, zone: "Bearish" },
];

export function zoneFor(score: number): Zone {
  return ZONE_THRESHOLDS.find((t) => score >= t.min)!.zone;
}

export function compositeScore(signals: Signal[]): CompositeScore {
  const usable = signals.filter((s) => s.available);
  const totalWeight = usable.reduce((a, s) => a + s.weight, 0);

  if (totalWeight === 0) {
    return { score: 0, zone: "Uncertain", drivers: [] };
  }

  const weighted = usable.reduce((a, s) => a + s.score * s.weight, 0);
  const score = Math.round((weighted / totalWeight) * 50);

  const drivers = usable
    .map((s) => ({
      group: s.group,
      label: s.label,
      contribution: Math.round(((s.score * s.weight) / totalWeight) * 50),
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return { score, zone: zoneFor(score), drivers };
}

/** Build the exact payload the LLM sees (and groundedness checks against). */
export function buildPayload(args: {
  asOf: Date;
  composite: CompositeScore;
  signals: Signal[];
  indices: { symbol: string; name: string; price: number; changePct: number }[];
  vix: { value: number; changePct: number } | null;
  news: NewsItem[];
}): SignalPayload {
  const totalWeight = args.signals
    .filter((s) => s.available)
    .reduce((a, s) => a + s.weight, 0);
  return {
    asOf: args.asOf.toISOString(),
    composite: { score: args.composite.score, zone: args.composite.zone },
    groups: args.signals
      .filter((s) => s.available)
      .map((s) => ({
        group: s.group,
        label: s.label,
        score: Math.round(s.score * 100) / 100,
        weight: s.weight,
        why: s.why,
        contribution:
          totalWeight > 0
            ? Math.round(((s.score * s.weight) / totalWeight) * 50)
            : 0,
        readings: s.readings.map((r) => ({ name: r.name, value: r.value, note: r.note })),
      })),
    indices: args.indices,
    vix: args.vix,
    newsHeadlines: args.news.slice(0, 10).map((n) => n.title),
  };
}

export const GROUP_ORDER: SignalGroup[] = [
  "trend",
  "momentum",
  "volatility",
  "volume",
  "structure",
  "global",
  "news",
  "flows",
];
