/**
 * Grounded narrative generator.
 *
 * Design contract (what makes it PRISM-friendly):
 *  1. The LLM sees ONLY the SignalPayload — no model memorized data.
 *  2. Output is Zod-validated; invalid shapes fall back to the template.
 *  3. An advice-safety filter runs on EVERY output (LLM or template).
 *  4. When no LLM key is configured, the deterministic template produces a
 *     fully grounded narrative — the system never goes dark.
 */
import { z } from "zod";
import type { Narrative, SignalPayload } from "@/lib/data/types";
import { filterAdviceLanguage, narrativeSafetyCheck } from "@/lib/prism/evaluators";

const LlmSchema = z.object({
  headline: z.string().min(8).max(140),
  body: z.string().min(80),
  watchList: z.array(z.string().min(4).max(160)).min(1).max(4),
  citedGroups: z.array(z.string()).min(1).max(6),
});

export const MODEL_NAME = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

export function buildPrompt(payload: SignalPayload): string {
  return [
    "You are MarketPulse, an educational market-sentiment explainer for Indian markets (NSE/BSE).",
    "You receive ONE JSON payload of signals computed by a transparent rules engine.",
    "STRICT RULES:",
    "1. GROUNDEDNESS: Use only facts and numbers present in the payload. Never invent, round creatively, or add outside data (no dates, no events, no prices not in the payload).",
    "2. CONSISTENCY: Your sentiment MUST match payload.composite.zone exactly (zone: " + payload.composite.zone + ").",
    "3. SAFETY: Educational content only. Never advise buying, selling, entering, exiting, price targets, or stop-losses. Never name a stock as a recommendation.",
    "4. COMPLETENESS: Name the top contributing signal groups from payload.groups and explain why they matter today.",
    "5. AUDIENCE: beginners. Explain any jargon the first time you use it. Short sentences.",
    "Respond with ONLY valid JSON in this exact shape:",
    '{"headline": string (max 90 chars), "body": string (280-420 words — DEEP and structured: (1) the day\'s overall reading in plain words, (2) the top 3-4 drivers each explained with their exact payload numbers and WHY each matters, (3) one counter-signal — a group that disagrees with the overall zone — if one exists, (4) what a beginner should and should NOT conclude from this), "watchList": string[3] (what a beginner should watch next, phrased as learning questions or observations), "citedGroups": string[] (group keys you cited, e.g. "trend","volatility")}',
    "",
    "PAYLOAD:",
    JSON.stringify(payload),
  ].join("\n");
}

const VALID_GROUPS = new Set([
  "trend", "momentum", "volatility", "volume", "structure", "global", "news", "flows",
]);

async function callGemini(payload: SignalPayload): Promise<Narrative | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  // Retries for transient Google capacity errors (429/503) — the free tier
  // model intermittently answers "high demand, try again later".
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt === 1 ? 800 : 2000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          cache: "no-store",
          body: JSON.stringify({
            contents: [{ parts: [{ text: buildPrompt(payload) }] }],
            generationConfig: {
              temperature: 0.4,
              responseMimeType: "application/json",
              // This is a structured re-explanation of provided data, not a
              // reasoning task — thinking burns ~1.5k tokens and seconds of
              // latency for no quality gain here.
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        },
      );
      if (!res.ok) {
        if (res.status === 429 || res.status === 503) continue; // retry once
        return null;
      }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    // Thinking models may split output across parts — join every text part.
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    if (!text) continue;

    const parsed = LlmSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;

    const cited = parsed.data.citedGroups.filter((g) => VALID_GROUPS.has(g)) as Narrative["citedGroups"];
    if (cited.length === 0) return null;

    const narrative: Narrative = {
      headline: parsed.data.headline,
      body: parsed.data.body,
      watchList: parsed.data.watchList.slice(0, 3),
      citedGroups: cited,
      source: "llm",
      model: MODEL_NAME,
    };
    return narrative;
    } catch {
      continue; // transient error (timeout/network) — retry once
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export function templateNarrative(payload: SignalPayload): Narrative {
  const { composite, groups, vix, indices } = payload;
  const ranked = [...groups].sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight));
  const top = ranked.slice(0, 3);
  const nifty = indices.find((i) => i.symbol === "^NSEI") ?? indices[0];
  const directionWord =
    composite.zone === "Bullish" || composite.zone === "Optimistic"
      ? "supportive"
      : composite.zone === "Bearish" || composite.zone === "Cautious"
        ? "pressured"
        : "mixed";

  const headline = `Market pulse: ${composite.zone.toLowerCase()} (${composite.score > 0 ? "+" : ""}${composite.score}) — ${directionWord} signals`;

  // Deep, structured body: overview → per-driver deep dive with contributions
  // and key indicator readings → context (VIX) → how to read this page.
  const driversBlock = ranked
    .map((g) => {
      const contrib =
        g.contribution != null
          ? ` contributing ${g.contribution > 0 ? "+" : ""}${g.contribution} points`
          : "";
      const readings = (g.readings ?? [])
        .slice(0, 3)
        .map((r) => `${r.name} at ${r.value} (${r.note})`)
        .join("; ");
      return `• ${g.label}${contrib} — score ${g.score >= 0 ? "+" : ""}${g.score.toFixed(1)} of ±2: ${g.why}${readings ? ` Key readings: ${readings}.` : ""}`;
    })
    .join("\n");

  const body = [
    `Today's composite reading is ${composite.score} on a scale of −100 (extreme fear) to +100 (extreme greed), placing the market in the "${composite.zone}" zone.`,
    nifty
      ? `The Nifty 50 anchors the picture at ${nifty.price.toFixed(1)}, ${nifty.changePct >= 0 ? "up" : "down"} ${Math.abs(nifty.changePct).toFixed(2)}% today.`
      : "",
    vix
      ? `India VIX at ${vix.value.toFixed(1)} (${vix.changePct >= 0 ? "+" : ""}${vix.changePct.toFixed(1)}% today) shows how much insurance traders are paying for — ${vix.value < 13 ? "quiet markets often lull people into over-confidence" : vix.value <= 18 ? "a normal fear level" : "elevated fear that often precedes sharp reversals"}.`
      : "",
    `WHY THE SCORE IS WHAT IT IS —`,
    driversBlock,
    `HOW TO READ THIS: the score is a weighted average of the ${groups.length} signal groups above — higher-weight groups like Trend and Momentum move the needle more. A negative number simply means more groups are flashing caution than confidence today. Every number in this text comes straight from the cards on this page; the per-card notes show where each figure comes from.`,
    `Remember: this is an educational read of computed signals, not investment advice.`,
  ]
    .filter(Boolean)
    .join("\n");

  const watchList = [
    vix
      ? `If India VIX (now ${vix.value.toFixed(1)}) climbs above 15, expect larger daily swings regardless of direction — expectations should adapt.`
      : "Watch the volatility signal for fear expansion or cooling.",
    top[0]
      ? `The ${top[0].label} signal carries the largest weight today — watch its key readings change day to day.`
      : "Watch the highest-weighted signal card.",
    `Watch whether the next reading lands closer to zero than today's ${composite.score} — that would signal repairing sentiment; a wider gap would signal deterioration.`,
  ];

  return {
    headline,
    body,
    watchList,
    citedGroups: top.map((t) => t.group),
    source: "template",
  };
}

export interface NarrativeResult {
  narrative: Narrative;
  llmAvailable: boolean;
  latencyMs: number;
  failureClass: string | null;
}

/** Generate a narrative: LLM if possible, template otherwise. Safety filter always runs.
 *  A short TTL cache (same score + same hour) keeps dashboard reloads instant and
 *  saves Gemini quota — the market read barely changes within minutes. */
let narrCache: { key: string; at: number; result: NarrativeResult } | null = null;

export async function generateNarrative(payload: SignalPayload): Promise<NarrativeResult> {
  const cacheKey = `${payload.composite.score}|${payload.asOf.slice(0, 13)}`;
  if (narrCache && narrCache.key === cacheKey && Date.now() - narrCache.at < 5 * 60 * 1000) {
    return narrCache.result;
  }
  const started = Date.now();
  const llm = await callGemini(payload);
  const latencyMs = Date.now() - started;

  let narrative: Narrative;
  let failureClass: string | null;
  if (llm) {
    narrative = llm;
    failureClass = null;
  } else {
    narrative = templateNarrative(payload);
    failureClass = process.env.GEMINI_API_KEY
      ? "llm_call_failed_template_fallback"
      : "llm_not_configured_template_fallback";
  }

  // Advice-safety filter runs on every path (defense in depth).
  const check = narrativeSafetyCheck(narrative);
  if (!check.passed) {
    narrative = {
      ...narrative,
      body: filterAdviceLanguage(narrative.body),
      headline: filterAdviceLanguage(narrative.headline),
    };
  }

  const result = { narrative, llmAvailable: narrative.source === "llm", latencyMs, failureClass };
  narrCache = { key: cacheKey, at: Date.now(), result };
  return result;
}
