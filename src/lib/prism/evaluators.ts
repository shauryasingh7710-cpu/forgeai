/**
 * PRISM evaluators — automated checks every AI explanation must pass.
 * These are the concrete, auditable implementations behind the deck's
 * "Monitor & Evaluate" slide: groundedness, consistency, advice-safety,
 * completeness.
 */
import type {
  EvaluatorResult,
  Narrative,
  SignalPayload,
  Zone,
} from "@/lib/data/types";

// ------------------------------------------------------------- helpers -----
const ZONE_WORDS: Record<string, Zone> = {
  bullish: "Bullish",
  bearish: "Bearish",
  optimistic: "Optimistic",
  cautious: "Cautious",
  uncertain: "Uncertain",
};

const OPPOSITE: Partial<Record<Zone, Zone>> = {
  Bullish: "Bearish",
  Optimistic: "Cautious",
  Cautious: "Optimistic",
  Bearish: "Bullish",
};

/**
 * All numbers the narrative is allowed to reference (derived from the payload).
 * The −100/0/+100 score-scale bounds are part of the payload contract, so
 * phrases like "score of 100" remain grounded.
 */
export function groundedNumbers(payload: SignalPayload): number[] {
  const nums: number[] = [payload.composite.score, 100, -100, 0];
  payload.indices.forEach((i) => {
    nums.push(i.price, i.changePct, i.price * (1 + i.changePct / 100));
  });
  if (payload.vix) nums.push(payload.vix.value, payload.vix.changePct);
  payload.groups.forEach((g) => {
    nums.push(g.score, g.weight);
    if (g.contribution != null) nums.push(g.contribution);
    // The group "why" strings ARE part of the payload — any number they
    // contain (e.g. a DMA level) is grounded by definition when quoted.
    nums.push(...extractNumbers(g.why));
    // Structured readings are payload too — the template quotes their names,
    // values and notes verbatim (values like "-3.75%" or "1.9×" decompose
    // into numbers that must count as grounded).
    (g.readings ?? []).forEach((r) => {
      nums.push(...extractNumbers(`${r.name} ${r.value} ${r.note}`));
    });
  });
  return nums;
}

function isGrounded(n: number, pool: number[]): boolean {
  return pool.some((p) => {
    const tol = Math.max(0.06, Math.abs(p) * 0.006); // 0.06 abs or 0.6% relative
    return Math.abs(n - p) <= tol;
  });
}

export function extractNumbers(text: string): number[] {
  const cleaned = text.replace(/,/g, "");
  const matches = cleaned.match(/-?\d+(\.\d+)?/g) ?? [];
  return matches.map(Number).filter((n) => Number.isFinite(n));
}

// ---------------------------------------------------------- evaluators -----

/** Every number in the narrative must trace to the signal payload. */
export function groundedness(payload: SignalPayload, narrative: Narrative): EvaluatorResult {
  const pool = groundedNumbers(payload);
  let text = `${narrative.headline} ${narrative.body} ${narrative.watchList.join(" ")}`;
  // Strings that ARE part of the payload (index names like "Nifty 50", group
  // labels, the zone name) are grounded by definition — remove before scanning.
  const groundedStrings = [
    ...payload.indices.map((i) => i.name),
    ...payload.indices.map((i) => i.symbol),
    ...payload.groups.map((g) => g.label),
    ...payload.groups.map((g) => g.why), // quoted payload content
    payload.composite.zone,
  ];
  for (const s of groundedStrings) {
    if (s) text = text.split(s).join(" ");
  }
  const used = extractNumbers(text);

  // Ignore trivial list indices / small integers that are structural (e.g. "3 things").
  const checked = used.filter((n) => Math.abs(n) >= 20 || !Number.isInteger(n));
  const violations = checked.filter((n) => !isGrounded(n, pool)).map((n) => String(n));

  return {
    name: "groundedness",
    passed: violations.length === 0,
    score: checked.length === 0 ? 1 : 1 - violations.length / checked.length,
    details:
      violations.length === 0
        ? `All ${checked.length} substantive numbers trace to the signal payload.`
        : `Numbers not found in payload: ${violations.join(", ")}`,
    violations: violations.length > 0 ? violations : undefined,
  };
}

/** The narrative's sentiment language must match the computed zone. */
export function consistency(payload: SignalPayload, narrative: Narrative): EvaluatorResult {
  let text = `${narrative.headline} ${narrative.body}`;
  // Quoted payload content (signal whys may legitimately say "bearish" about
  // one group while the composite zone is "Cautious") is not the author's
  // assertion — remove it before scanning zone words.
  for (const g of payload.groups) {
    if (g.why) text = text.split(g.why).join(" ");
  }
  text = text.toLowerCase();
  const mentioned = new Set<Zone>();
  for (const [word, zone] of Object.entries(ZONE_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) mentioned.add(zone);
  }

  const expected = payload.composite.zone;
  const violations: string[] = [];
  for (const z of mentioned) {
    if (z !== expected) {
      const isAntonym = OPPOSITE[expected] === z;
      violations.push(
        isAntonym
          ? `says "${z.toLowerCase()}" but computed zone is "${expected}" (direct contradiction)`
          : `mentions "${z.toLowerCase()}" while computed zone is "${expected}"`,
      );
    }
  }

  return {
    name: "consistency",
    passed: violations.length === 0,
    score: violations.length === 0 ? 1 : 0,
    details:
      violations.length === 0
        ? `Sentiment language consistent with computed zone "${expected}".`
        : violations.join("; "),
    violations: violations.length > 0 ? violations : undefined,
  };
}

// ------------------------------------------------------- advice-safety -----
const BANNED_PATTERNS: RegExp[] = [
  /\bbuy\b/i,
  /\bsell\b/i,
  /\bgo (short|long)\b/i,
  /\bshort (the|this|it)\b/i,
  /\bgo long\b/i,
  /\benter(ing)? (the|a|this) (stock|market|position|trade)\b/i,
  /\bexit(ing)?\b/i,
  /\bbook(ing)? profits?\b/i,
  /\btarget (price|of)\b/i,
  /\bstop[- ]?loss\b/i,
  /\bwe recommend\w*\b/i,
  /\brecommend\w* (buying|selling|investing)\b/i,
  /\bshould (buy|sell|invest)\b/i,
  /\binvest in\b/i,
  /\btake (a )?(position|trade)\b/i,
  /\bworth buying\b/i,
  /\bavoid (this|this stock|it)\b/i,
];

const SOFTENERS: [RegExp, string][] = [
  [/\bbuying pressure\b/gi, "upward pressure"],
  [/\bselling pressure\b/gi, "downward pressure"],
  [/\bbuyers\b/gi, "upward-side participants"],
  [/\bsellers\b/gi, "downward-side participants"],
  [/\bsell-off\b/gi, "decline"],
  [/\bselloff\b/gi, "decline"],
];

/** Check (and report) whether the narrative contains advice-like language. */
export function narrativeSafetyCheck(narrative: Narrative): {
  passed: boolean;
  violations: string[];
} {
  const text = `${narrative.headline}\n${narrative.body}\n${narrative.watchList.join("\n")}`;
  const violations: string[] = [];
  for (const re of BANNED_PATTERNS) {
    const m = text.match(re);
    if (m) violations.push(m[0]);
  }
  return { passed: violations.length === 0, violations };
}

/** Rewrite common benign financial phrases that trip naive banned-word checks. */
export function filterAdviceLanguage(text: string): string {
  let out = text;
  for (const [re, replacement] of SOFTENERS) out = out.replace(re, replacement);
  for (const re of BANNED_PATTERNS) {
    out = out.replace(re, (m) => `[filtered: "${m}"]`);
  }
  return out;
}

export function adviceSafety(payload: SignalPayload, narrative: Narrative): EvaluatorResult {
  void payload;
  const { passed, violations } = narrativeSafetyCheck(narrative);
  return {
    name: "advice_safety",
    passed,
    score: passed ? 1 : 0,
    details: passed
      ? "No advice-like language detected (educational posture maintained)."
      : `Advice-language guardrail triggered by: ${violations.join(", ")}`,
    violations: violations.length > 0 ? violations : undefined,
  };
}

/** The narrative must cite at least two of the top-3 weighted driver groups. */
export function completeness(payload: SignalPayload, narrative: Narrative): EvaluatorResult {
  const topGroups = payload.groups
    .slice()
    .sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight))
    .slice(0, 3)
    .map((g) => g.group);

  const cited = new Set(narrative.citedGroups);
  const covered = topGroups.filter((g) => cited.has(g));
  const enough = covered.length >= 2 && narrative.watchList.length >= 1 && narrative.body.length >= 80;

  return {
    name: "completeness",
    passed: enough,
    score: enough ? 1 : covered.length / 3,
    details: enough
      ? `Cites ${covered.length}/3 top driver groups (${covered.join(", ")}) and provides a watch list.`
      : `Cites only ${covered.length}/3 top driver groups (${topGroups.join(", ")} expected).`,
  };
}

/** Run the full evaluator suite. */
export function runEvaluators(payload: SignalPayload, narrative: Narrative): EvaluatorResult[] {
  return [
    groundedness(payload, narrative),
    consistency(payload, narrative),
    adviceSafety(payload, narrative),
    completeness(payload, narrative),
  ];
}
