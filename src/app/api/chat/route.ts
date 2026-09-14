import { NextResponse } from "next/server";
import { z } from "zod";
import { computePulse } from "@/lib/pipeline";
import { answerChat, buildChatPrompt, type ChatTurn } from "@/lib/llm/chat";
import { runEvaluators } from "@/lib/prism/evaluators";
import { recordSession } from "@/lib/prism/session";
import type { Narrative, SignalPayload } from "@/lib/data/types";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  question: z.string().min(2).max(400),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .max(20)
    .optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "question must be 2-400 chars; history max 20 turns" }, { status: 400 });
  }
  const { question, history = [] } = parsed.data;

  const started = Date.now();
  try {
    // Reuses the dashboard's cached data layer (all fetchers TTL-cached),
    // so a chat turn costs ~0 extra network calls in steady state.
    const pulse = await computePulse({ goal: "chat" });

    // A chat-shaped payload: same grounded content, without the narrative fields.
    const chatPayload: SignalPayload = {
      asOf: pulse.asOf,
      composite: pulse.composite,
      groups: pulse.signals.filter((s) => s.available).map((s) => ({
        group: s.group,
        label: s.label,
        score: Math.round(s.score * 100) / 100,
        weight: s.weight,
        why: s.why,
        contribution: pulse.composite.drivers.find((d) => d.group === s.group)?.contribution ?? 0,
        readings: s.readings.map((r) => ({ name: r.name, value: r.value, note: r.note })),
      })),
      indices: pulse.indices.map((i) => ({
        symbol: i.symbol,
        name: i.name,
        price: i.price,
        changePct: i.changePct,
      })),
      vix: pulse.vix ? { value: pulse.vix.value, changePct: pulse.vix.changePct } : null,
      newsHeadlines: pulse.news.slice(0, 10).map((n) => n.title),
    };

    const answer = await answerChat(chatPayload, question, history as ChatTurn[]);

    // Quality gates on the chat reply (groundedness + safety apply to chat too).
    const replyAsNarrative: Narrative = {
      headline: `chat:${answer.intent}`,
      body: answer.text,
      watchList: [],
      citedGroups: chatPayload.groups.slice(0, 2).map((g) => g.group),
      source: answer.source,
      model: answer.model,
    };
    const evaluators = runEvaluators(chatPayload, replyAsNarrative);
    const guardrailTriggered = !(evaluators.find((e) => e.name === "advice_safety")?.passed ?? true);
    const session = recordSession({
      goal: "chat",
      payload: chatPayload,
      prompt: buildChatPrompt(chatPayload, question, history as ChatTurn[]),
      narrative: replyAsNarrative,
      evaluators,
      guardrailTriggered,
      llmFailureClass: answer.failureClass,
      model: answer.model,
      latencyMs: answer.latencyMs,
    });

    return NextResponse.json({
      answer: answer.text,
      intent: answer.intent,
      source: answer.source,
      model: answer.model,
      fetchedInMs: Date.now() - started,
      composite: pulse.composite,
      quality: {
        groundedness: evaluators.find((e) => e.name === "groundedness")?.passed ?? false,
        adviceSafety: evaluators.find((e) => e.name === "advice_safety")?.passed ?? false,
      },
      sessionId: session.sessionId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "chat failed";
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 503 });
  }
}
