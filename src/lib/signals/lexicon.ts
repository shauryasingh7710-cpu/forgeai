/**
 * Finance-tuned keyword lexicon for Indian-market news headlines.
 *
 * Deliberately transparent and auditable: a fixed, reviewable word list —
 * exactly the kind of logic PRISM evaluators can reason about. Weights are
 * small; a single headline moves sentiment gently, and the signal aggregates
 * over many headlines.
 */

interface LexiconEntry {
  weight: number; // -1..1 contribution
  topics?: string[];
}

const ENTRIES: Record<string, LexiconEntry> = {
  // ---- bullish / positive -------------------------------------------------
  surge: { weight: 0.8 },
  surges: { weight: 0.8 },
  soar: { weight: 0.9 },
  soars: { weight: 0.9 },
  rally: { weight: 0.7, topics: ["market"] },
  rallies: { weight: 0.7 },
  jump: { weight: 0.5 },
  jumps: { weight: 0.5 },
  gain: { weight: 0.4 },
  gains: { weight: 0.4 },
  rise: { weight: 0.4 },
  rises: { weight: 0.4 },
  rose: { weight: 0.4 },
  climb: { weight: 0.4 },
  climbs: { weight: 0.4 },
  record: { weight: 0.5 },
  "all-time high": { weight: 0.9, topics: ["market"] },
  "record high": { weight: 0.8, topics: ["market"] },
  outperform: { weight: 0.5 },
  upgrade: { weight: 0.6, topics: ["earnings"] },
  upgrades: { weight: 0.6, topics: ["earnings"] },
  "beats estimates": { weight: 0.7, topics: ["earnings"] },
  "beat estimates": { weight: 0.7, topics: ["earnings"] },
  profit: { weight: 0.4, topics: ["earnings"] },
  "profit rises": { weight: 0.6, topics: ["earnings"] },
  "strong results": { weight: 0.6, topics: ["earnings"] },
  bull: { weight: 0.5, topics: ["market"] },
  bullish: { weight: 0.6 },
  optimistic: { weight: 0.5 },
  inflows: { weight: 0.5, topics: ["fii"] },
  "buy rating": { weight: 0.5 },
  expansion: { weight: 0.3 },
  growth: { weight: 0.3 },
  boom: { weight: 0.7 },
  "rate cut": { weight: 0.7, topics: ["rbi"] },
  "rate cuts": { weight: 0.7, topics: ["rbi"] },
  "cuts rates": { weight: 0.7, topics: ["rbi"] },
  stimulus: { weight: 0.5, topics: ["policy"] },
  "boost": { weight: 0.4 },
  "boosts": { weight: 0.4 },
  upbeat: { weight: 0.5 },
  rebound: { weight: 0.5 },
  recovery: { weight: 0.4 },
  "green signal": { weight: 0.4, topics: ["policy"] },
  approval: { weight: 0.3, topics: ["policy"] },

  // ---- bearish / negative -------------------------------------------------
  crash: { weight: -0.9, topics: ["market"] },
  crashes: { weight: -0.9, topics: ["market"] },
  plunge: { weight: -0.8 },
  plunges: { weight: -0.8 },
  slump: { weight: -0.7 },
  slumps: { weight: -0.7 },
  tumble: { weight: -0.7 },
  tumbles: { weight: -0.7 },
  sink: { weight: -0.6 },
  sinks: { weight: -0.6 },
  fall: { weight: -0.4 },
  falls: { weight: -0.4 },
  fell: { weight: -0.4 },
  drop: { weight: -0.4 },
  drops: { weight: -0.4 },
  decline: { weight: -0.4 },
  slide: { weight: -0.5 },
  slides: { weight: -0.5 },
  selloff: { weight: -0.8, topics: ["market"] },
  "sell-off": { weight: -0.8, topics: ["market"] },
  bear: { weight: -0.5, topics: ["market"] },
  bearish: { weight: -0.6 },
  fear: { weight: -0.5 },
  fears: { weight: -0.5 },
  panic: { weight: -0.7 },
  downgrade: { weight: -0.6, topics: ["earnings"] },
  downgrades: { weight: -0.6, topics: ["earnings"] },
  "misses estimates": { weight: -0.7, topics: ["earnings"] },
  "missed estimates": { weight: -0.7, topics: ["earnings"] },
  "weak results": { weight: -0.6, topics: ["earnings"] },
  loss: { weight: -0.4, topics: ["earnings"] },
  losses: { weight: -0.4 },
  outflows: { weight: -0.5, topics: ["fii"] },
  "rate hike": { weight: -0.6, topics: ["rbi"] },
  "rate hikes": { weight: -0.6, topics: ["rbi"] },
  "hikes rates": { weight: -0.6, topics: ["rbi"] },
  inflation: { weight: -0.4, topics: ["inflation"] },
  "sticky inflation": { weight: -0.6, topics: ["inflation"] },
  "cpi rises": { weight: -0.4, topics: ["inflation"] },
  recession: { weight: -0.8 },
  default: { weight: -0.7 },
  fraud: { weight: -0.7 },
  scam: { weight: -0.7 },
  probe: { weight: -0.4, topics: ["policy"] },
  raid: { weight: -0.5 },
  ban: { weight: -0.5, topics: ["policy"] },
  lawsuit: { weight: -0.4 },
  "warns": { weight: -0.4 },
  warning: { weight: -0.4 },
  risk: { weight: -0.2 },
  tensions: { weight: -0.4, topics: ["global"] },
  war: { weight: -0.8, topics: ["global"] },
  strike: { weight: -0.3 },
  layoffs: { weight: -0.4 },
  "oil spikes": { weight: -0.5, topics: ["crude"] },
  "crude rises": { weight: -0.4, topics: ["crude"] },
  "crude surges": { weight: -0.6, topics: ["crude"] },

  // ---- neutral-but-topical ------------------------------------------------
  "rbi": { weight: 0, topics: ["rbi"] },
  "sebi": { weight: 0, topics: ["policy"] },
  "nifty": { weight: 0, topics: ["market"] },
  "sensex": { weight: 0, topics: ["market"] },
  "fii": { weight: 0, topics: ["fii"] },
  "dii": { weight: 0, topics: ["fii"] },
  "results": { weight: 0, topics: ["earnings"] },
  "quarterly": { weight: 0, topics: ["earnings"] },
  "ipo": { weight: 0.1 },
  "fed": { weight: 0, topics: ["global"] },
  "tariff": { weight: -0.2, topics: ["global"] },
  "tariffs": { weight: -0.2, topics: ["global"] },
};

const TOPIC_LABELS: Record<string, string> = {
  rbi: "RBI/policy",
  policy: "policy",
  earnings: "earnings",
  crude: "crude",
  fii: "FII flows",
  global: "global",
  inflation: "inflation",
  market: "market",
};

export interface HeadlineAnalysis {
  sentiment: number; // -1..1, tanh-scaled
  topics: string[];
  hits: string[];
}

/** Analyze one headline: keyword sentiment + topic tags. */
export function analyzeHeadline(title: string): HeadlineAnalysis {
  const lower = title.toLowerCase();
  let sum = 0;
  const topics = new Set<string>();
  const hits: string[] = [];

  for (const [phrase, entry] of Object.entries(ENTRIES)) {
    // word-boundary match for single words; substring for phrases
    const matched =
      phrase.includes(" ") || phrase.includes("-")
        ? lower.includes(phrase)
        : new RegExp(`\\b${phrase}\\b`).test(lower);
    if (matched) {
      sum += entry.weight;
      hits.push(phrase);
      entry.topics?.forEach((t) => topics.add(t));
    }
  }

  return {
    sentiment: Math.tanh(sum / 2),
    topics: [...topics].map((t) => TOPIC_LABELS[t] ?? t),
    hits,
  };
}
