/**
 * MarketPulse chat — the same grounding contract as the daily narrative,
 * applied to free-form questions.
 *
 *  1. The model sees ONLY the SignalPayload (same payload as the dashboard).
 *  2. Output is Zod-validated; any invalid shape falls back to the template.
 *  3. The advice-safety filter runs on EVERY reply (LLM or template).
 *  4. No key configured → deterministic template answers from the payload,
 *     so the chat works out of the box and upgrades automatically once
 *     GEMINI_API_KEY is set.
 */
import { z } from "zod";
import type { Narrative, SignalPayload } from "@/lib/data/types";
import { filterAdviceLanguage, narrativeSafetyCheck } from "@/lib/prism/evaluators";
import { MODEL_NAME } from "./narrative";

export type ChatIntent =
  | "advice_refusal"
  | "score"
  | "volatility"
  | "news"
  | "trend"
  | "global"
  | "overview";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatAnswer {
  text: string;
  intent: ChatIntent;
  source: "llm" | "template";
  model: string;
  latencyMs: number;
  failureClass: string | null;
}

// ------------------------------------------------------------- intents -----
export function classifyIntent(question: string): ChatIntent {
  const q = question.toLowerCase();
  if (
    /\b(should i|shall i|can i)\b.*\b(buy|sell|invest|exit|enter)\b/.test(q) ||
    /\b(buy|sell|invest in|book profit|target price|stop loss)\b/.test(q) ||
    /\b(which stock).*(\b(buy|now)\b)/.test(q)
  ) {
    return "advice_refusal";
  }
  if (/\b(vix|volatil|fear|scared|risk)\b/.test(q)) return "volatility";
  if (/\b(news|headline|why.*(down|up|fall|rise))\b/.test(q)) return "news";
  if (/\b(dma|trend|moving average|death cross|golden cross|52[- ]?week|support)\b/.test(q)) {
    return "trend";
  }
  if (/\b(dollar|rupee|usd|dxy|global|fii|dii|crude|foreign)\b/.test(q)) return "global";
  if (/\b(score|pulse|zone|meaning|mean|bearish|bullish|sentiment|market today|overall)\b/.test(q)) {
    return "score";
  }
  return "overview";
}

// ----------------------------------------------------------- llm path ------
const ChatSchema = z.object({ answer: z.string().min(10).max(1800) });

export function buildChatPrompt(payload: SignalPayload, question: string, history: ChatTurn[]): string {
  const historyText = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content.slice(0, 300)}`)
    .join("\n");
  return [
    "You are MarketPulse Assistant, an educational market-sentiment explainer for Indian markets (NSE).",
    "You answer one user question using ONLY the JSON signal payload below — the exact data shown on the user's dashboard.",
    "STRICT RULES:",
    "1. GROUNDEDNESS: Use only facts and numbers present in the payload. Never invent prices, dates, events, or outside knowledge.",
    "2. CONSISTENCY: Your tone must match payload.composite.zone exactly (zone: " + payload.composite.zone + ").",
    "3. SAFETY: Educational content only. Never advise buying, selling, exiting, price targets, or stop-losses. If asked what to do, explain what the signals show and remind the user this is not advice.",
    "4. STYLE: 4-8 sentences (80-180 words), plain language for beginners, no markdown.",
    "5. DEPTH: Lead with the direct answer, then add WHY — cite the exact payload numbers (scores, DMA levels, RSI, VIX, contributions) and explain what each means for a beginner. If a counter-signal exists in the payload, mention it.",
    "If the payload cannot answer the question, say exactly what data you DO have instead.",
    "Respond with ONLY valid JSON: {\"answer\": string}",
    historyText ? `\nCONVERSATION SO FAR:\n${historyText}` : "",
    `\nQUESTION: ${question}`,
    "\nPAYLOAD:",
    JSON.stringify(payload),
  ]
    .filter(Boolean)
    .join("\n");
}

async function callGeminiChat(
  payload: SignalPayload,
  question: string,
  history: ChatTurn[],
): Promise<{ answer: string } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  // Retry transient Google capacity errors (429/503) — the free tier
  // intermittently answers "high demand, try again later".
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
            contents: [{ parts: [{ text: buildChatPrompt(payload, question, history) }] }],
            generationConfig: {
              temperature: 0.4,
              responseMimeType: "application/json",
              thinkingConfig: { thinkingBudget: 0 }, // structured task, skip hidden reasoning tokens
            },
          }),
        },
      );
      if (!res.ok) {
        if (res.status === 429 || res.status === 503) continue; // retry
        return null;
      }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    if (!text) return null;
      const parsed = ChatSchema.safeParse(JSON.parse(text));
      return parsed.success ? { answer: parsed.data.answer } : null;
    } catch {
      continue; // transient (timeout/network) — retry
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// ------------------------------------------------------- template path -----
function topDriver(payload: SignalPayload): string {
  const ranked = [...payload.groups].sort(
    (a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight),
  );
  return ranked[0]?.label ?? "no signals";
}

function templateAnswer(payload: SignalPayload, intent: ChatIntent): string {
  const { composite, vix } = payload;
  const nifty = payload.indices.find((i) => i.symbol === "^NSEI") ?? payload.indices[0];
  const ranked = [...payload.groups].sort(
    (a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight),
  );
  const find = (key: string) => payload.groups.find((g) => g.group === key);

  switch (intent) {
    case "advice_refusal":
      return [
        "I can't advise buying or selling anything — MarketPulse is an educational explainer, not an advisor.",
        `What I can tell you: today's composite reading is ${composite.score} (${composite.zone}), driven mainly by ${topDriver(payload)}.`,
        nifty
          ? `The Nifty 50 is at ${nifty.price.toFixed(1)} (${nifty.changePct >= 0 ? "+" : ""}${nifty.changePct.toFixed(2)}% today). Read the signal cards with that in mind, and consider a SEBI-registered advisor for personal decisions.`
          : "I can tell you what today's computed signals show — see the breakdown below on this page.",
      ]
        .filter(Boolean)
        .join(" ");

    case "volatility": {
      if (!vix) return "Volatility data (India VIX) is unavailable in today's payload, so I can't quote a level right now — check the Volatility signal card for what is available.";
      const vol = find("volatility");
      const rv = vol?.readings?.find((r) => r.name.toLowerCase().includes("realized"));
      return [
        `India VIX is at ${vix.value.toFixed(1)} (${vix.changePct >= 0 ? "+" : ""}${vix.changePct.toFixed(1)}% today).`,
        vix.value < 13
          ? "That is a low reading — options traders expect calm conditions, though calm markets can also breed over-confidence."
          : vix.value <= 18
            ? "That sits in the normal band — a healthy level of hedging demand."
            : "That is elevated — traders are paying up for protection, which usually means choppier sessions.",
        rv ? `Realized volatility (actual recent swings) is ${rv.value} — ${rv.note.toLowerCase()}` : "",
        `For the composite, volatility contributes ${vol ? (vol.contribution ?? 0 > 0 ? "+" : "") + (vol.contribution ?? 0) + " points" : "its share"} of today's ${composite.score} score.`,
      ]
        .filter(Boolean)
        .join(" ");
    }

    case "news": {
      const news = find("news");
      const heads = payload.newsHeadlines.slice(0, 3);
      return [
        news
          ? `The news signal scores ${news.score.toFixed(1)} of ±2: ${news.why}`
          : "News sentiment data is unavailable right now.",
        heads.length ? `Latest headlines in the payload: "${heads[0]}"${heads[1] ? `; "${heads[1]}"` : ""}.` : "",
        "Remember the sentiment dots come from an auditable keyword lexicon, not a black box.",
      ]
        .filter(Boolean)
        .join(" ");
    }

    case "trend": {
      const trend = find("trend");
      const readings = trend?.readings ?? [];
      const parts = readings.slice(0, 3).map((r) => `${r.name}: ${r.value} (${r.note})`);
      return [
        trend
          ? `The trend signal scores ${trend.score.toFixed(1)} of ±2 — ${trend.why}`
          : "Trend data is unavailable right now.",
        parts.length ? `Key readings — ${parts.join("; ")}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    case "global": {
      const g = find("global");
      return [
        g
          ? `Global cues contribute ${(g.contribution ?? 0) > 0 ? "+" : ""}${g.contribution ?? 0} points: ${g.why}`
          : "Global cue data is unavailable right now.",
        "The FX figures come from ECB end-of-day reference rates; the dollar figure is a true-formula DXY proxy.",
      ]
        .filter(Boolean)
        .join(" ");
    }

    case "score":
    case "overview":
    default: {
      const drivers = ranked
        .slice(0, 3)
        .map((g) => `${g.label} ${(g.contribution ?? 0) > 0 ? "+" : ""}${g.contribution ?? 0}`)
        .join(", ");
      return [
        `Today's composite is ${composite.score} on the −100…+100 scale, which lands in the "${composite.zone}" zone.`,
        nifty
          ? `Nifty 50 anchors it: ${nifty.price.toFixed(1)}, ${nifty.changePct >= 0 ? "up" : "down"} ${Math.abs(nifty.changePct).toFixed(2)}% today.`
          : "",
        `Biggest drivers: ${drivers}.`,
        composite.score < -35
          ? "In plain words: most weighted signals are flashing caution — downtrend plus weak sentiment readings dominate the average."
          : composite.score < 10
            ? "In plain words: caution signals slightly outnumber confidence signals today."
            : "In plain words: confidence signals outweigh caution today.",
        "Every number here comes straight from the signal cards on this page.",
      ]
        .filter(Boolean)
        .join(" ");
    }
  }
}

// ------------------------------------------------------------- public ------
export async function answerChat(
  payload: SignalPayload,
  question: string,
  history: ChatTurn[] = [],
): Promise<ChatAnswer> {
  const started = Date.now();
  const intent = classifyIntent(question);

  const llm = intent === "advice_refusal" ? null : await callGeminiChat(payload, question, history);
  const latencyMs = Date.now() - started;

  let text: string;
  let source: ChatAnswer["source"];
  let failureClass: string | null;

  if (llm) {
    text = llm.answer;
    source = "llm";
    failureClass = null;
  } else {
    text = templateAnswer(payload, intent);
    source = "template";
    failureClass = process.env.GEMINI_API_KEY
      ? "chat_llm_failed_template_fallback"
      : "chat_llm_not_configured_template_fallback";
  }

  // Advice-safety filter on every path (defense in depth), same as narratives.
  const probe: Narrative = {
    headline: "chat",
    body: text,
    watchList: [],
    citedGroups: [],
    source,
  };
  const check = narrativeSafetyCheck(probe);
  if (!check.passed) text = filterAdviceLanguage(text);

  return { text, intent, source, model: source === "llm" ? MODEL_NAME : "template-engine", latencyMs, failureClass };
}

/** The two quality gates that apply to every chat reply. */
export function chatSuggestedQuestions(): string[] {
  return [
    "Why is the market down today?",
    "What does the score mean?",
    "How is India VIX looking?",
    "Which news is driving sentiment?",
    "What are the key trend levels?",
    "How are global cues affecting us?",
  ];
}
