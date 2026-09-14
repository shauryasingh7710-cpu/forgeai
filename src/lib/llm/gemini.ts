/**
 * Shared Gemini client with a model fallback chain.
 *
 * Free-tier quota is PER-MODEL (each flash generation gets its own
 * 20-requests/minute bucket), so when the primary model's bucket is drained
 * we transparently try the next model in the chain. The last known-good
 * model is remembered so healthy models are tried first on later calls.
 */
import { z } from "zod";

const ChainSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })).optional() }).optional(),
      }),
    )
    .optional(),
});

/** Ordered chain — primary first, fallbacks per free-tier per-model buckets. */
export const MODEL_CHAIN: string[] = (
  process.env.GEMINI_MODEL_CHAIN ?? "gemini-3.6-flash,gemini-3.5-flash"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let lastGoodModel: string | null = null;

/** The model to try first (last one that answered, else the chain head). */
export function currentModel(): string {
  return lastGoodModel ?? MODEL_CHAIN[0]!;
}

/** Why the last generate attempt failed — used for honest UI disclosure. */
export let lastFail:
  | "all_models_quota"
  | "error"
  | "no_key"
  | null = null;

function orderedChain(): string[] {
  const head = lastGoodModel ? [lastGoodModel, ...MODEL_CHAIN.filter((m) => m !== lastGoodModel)] : MODEL_CHAIN;
  return head;
}

/**
 * One generateContent call, walking the model chain. Returns the joined text
 * and the model that produced it, or null (lastFail says why).
 */
export async function geminiGenerate(promptText: string, opts?: { temperature?: number }): Promise<{ text: string; model: string } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    lastFail = "no_key";
    return null;
  }
  lastFail = null;

  const chain = orderedChain();
  let sawQuota = false;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i]!;
    // Small per-model patience: one 503 retry, then move on.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 700));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            cache: "no-store",
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: {
                temperature: opts?.temperature ?? 0.4,
                responseMimeType: "application/json",
                // Structured re-explanation of provided data, not a reasoning
                // task — thinking burns ~1.5k tokens and seconds of latency.
                thinkingConfig: { thinkingBudget: 0 },
              },
            }),
          },
        );
        if (!res.ok) {
          // 429 = this model's per-minute bucket is drained. Rejected calls
          // still count, so never retry a 429 — fall through to the next model.
          if (res.status === 429) {
            sawQuota = true;
            break;
          }
          if (res.status === 503) continue; // transient capacity — retry once
          lastFail = "error";
          return null;
        }
        const json = ChainSchema.safeParse(await res.json());
        const text = (json.success ? json.data.candidates?.[0]?.content?.parts ?? [] : [])
          .map((p) => p.text ?? "")
          .join("");
        if (!text) continue;
        lastGoodModel = model;
        return { text, model };
      } catch {
        continue; // timeout/network — retry once, then next model
      } finally {
        clearTimeout(timer);
      }
    }
  }
  lastFail = sawQuota ? "all_models_quota" : "error";
  return null;
}
