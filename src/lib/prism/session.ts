/**
 * PRISM session recorder — the instrumentation layer.
 *
 * Every AI explanation run becomes ONE session record containing: the goal,
 * the exact input payload, the prompt, the output, the computed score, all
 * evaluator results, guardrail events, failure class, model and latency.
 *
 * Live forwarding uses PRISM's official HTTP trace API (per their docs):
 *   POST {PRISMTRACE_HOST}/api/traces
 *   header: X-PRISMtrace-Key: <pt-sk-...>
 *   body:   project_id, model, input_messages, output_message, latency_ms,
 *           session_id, agent_id, agent_name, metadata
 *
 * Our evaluator verdicts ride along in `metadata` (filterable in PRISM's
 * dashboard), and the local ring buffer keeps identical records so the app's
 * "AI Reliability" panel works even before PRISM keys are configured.
 */
import type {
  EvaluatorResult,
  Narrative,
  PrismSession,
  SignalPayload,
} from "@/lib/data/types";
import { runEvaluators } from "./evaluators";

const PRISM_HOST = process.env.PRISMTRACE_HOST ?? "https://prism.blockconvey.com";
const PRISM_PROJECT_ID = process.env.PRISMTRACE_PROJECT_ID;
const PRISM_API_KEY = process.env.PRISMTRACE_API_KEY;

function prismConfigured(): boolean {
  return Boolean(PRISM_PROJECT_ID && PRISM_API_KEY);
}

/** Stable session id so PRISM assembles each market day into one conversation. */
function sessionIdFor(goal: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `marketpulse:${goal}:${day}`;
}

/** Build the official PRISM trace payload for one AI run. */
export function toPrismTrace(session: PrismSession): Record<string, unknown> {
  const output = [
    session.output.headline,
    "",
    session.output.body,
    "",
    "What to watch:",
    ...session.output.watchList.map((w) => `- ${w}`),
  ].join("\n");

  const evaluators: Record<string, unknown> = {};
  for (const e of session.evaluators) {
    evaluators[e.name] = { passed: e.passed, score: Number(e.score.toFixed(3)) };
  }

  return {
    project_id: PRISM_PROJECT_ID,
    model: session.model,
    input_messages: [{ role: "user", content: session.prompt }],
    output_message: output,
    latency_ms: session.latencyMs,
    token_count_input: Math.ceil(session.prompt.length / 4),
    token_count_output: Math.ceil(output.length / 4),
    session_id: sessionIdFor(session.goal),
    agent_id: session.goal.startsWith("explain_stock") ? "marketpulse-stock-agent" : "marketpulse-market-agent",
    agent_name: "MarketPulse",
    metadata: {
      goal: session.goal,
      composite_score: session.compositeScore,
      zone: session.zone,
      grounded_payload: session.input,
      evaluators,
      all_evaluators_passed: session.evaluators.every((e) => e.passed),
      guardrail_triggered: session.guardrailTriggered,
      failure_class: session.failureClass ?? "none",
      narrative_source: session.output.source,
      as_of: session.input.asOf,
    },
  };
}

const MAX_SESSIONS = 200;
const sessions: PrismSession[] = [];

function classifyFailure(
  evaluators: EvaluatorResult[],
  failureClass: string | null,
  guardrailTriggered: boolean,
): string | null {
  if (guardrailTriggered) return "guardrail:advice_language";
  const failed = evaluators.filter((e) => !e.passed);
  if (failed.length > 0) {
    return `evaluator:${failed.map((e) => e.name).join("+")}`;
  }
  if (failureClass) return failureClass; // e.g. llm fallback classes
  const weak = evaluators.find((e) => e.score < 1);
  if (weak) return `low_confidence:${weak.name}`;
  return null;
}

async function forwardToPrism(session: PrismSession): Promise<void> {
  if (!prismConfigured()) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${PRISM_HOST}/api/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PRISMtrace-Key": PRISM_API_KEY!,
      },
      body: JSON.stringify(toPrismTrace(session)),
      signal: controller.signal,
      cache: "no-store",
    });
    // 429 (rate limit) / 402 (credits) are logged-and-dropped by design:
    // observability must never break the user path; the local ring buffer
    // already retains the record.
    if (!res.ok && process.env.NODE_ENV !== "production") {
      console.warn(`prism ingest ${res.status}`);
    }
  } catch {
    // Swallowed by design.
  } finally {
    clearTimeout(timer);
  }
}

export interface RunInput {
  goal: string;
  payload: SignalPayload;
  prompt: string;
  narrative: Narrative;
  evaluators: EvaluatorResult[];
  guardrailTriggered: boolean;
  llmFailureClass: string | null;
  model: string;
  latencyMs: number;
}

export function recordSession(input: RunInput): PrismSession {
  const session: PrismSession = {
    sessionId: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    goal: input.goal,
    input: input.payload,
    prompt: input.prompt,
    output: input.narrative,
    compositeScore: input.payload.composite.score,
    zone: input.payload.composite.zone,
    evaluators: input.evaluators,
    guardrailTriggered: input.guardrailTriggered,
    failureClass: classifyFailure(
      input.evaluators,
      input.llmFailureClass,
      input.guardrailTriggered,
    ),
    model: input.model,
    latencyMs: input.latencyMs,
  };

  sessions.unshift(session);
  if (sessions.length > MAX_SESSIONS) sessions.pop();

  // Fire-and-forget, off the request path (PRISM docs' recommendation).
  void forwardToPrism(session);
  return session;
}

export function getRecentSessions(limit = 20): PrismSession[] {
  return sessions.slice(0, limit);
}

export function isPrismConnected(): boolean {
  return prismConfigured();
}

export interface PrismStats {
  totalRuns: number;
  allEvaluatorsPassed: number;
  passRate: number;
  guardrailTriggers: number;
  failuresByClass: Record<string, number>;
  evaluatorPassRates: Record<string, { passed: number; total: number }>;
  avgLatencyMs: number;
  llmShare: number;
}

export function sessionStats(): PrismStats {
  const total = sessions.length;
  const stats: PrismStats = {
    totalRuns: total,
    allEvaluatorsPassed: 0,
    passRate: 0,
    guardrailTriggers: 0,
    failuresByClass: {},
    evaluatorPassRates: {},
    avgLatencyMs: 0,
    llmShare: 0,
  };
  if (total === 0) return stats;

  let latencySum = 0;
  let llmRuns = 0;
  for (const s of sessions) {
    if (s.evaluators.every((e) => e.passed)) stats.allEvaluatorsPassed += 1;
    if (s.guardrailTriggered) stats.guardrailTriggers += 1;
    if (s.failureClass) {
      stats.failuresByClass[s.failureClass] =
        (stats.failuresByClass[s.failureClass] ?? 0) + 1;
    }
    for (const e of s.evaluators) {
      const cur = stats.evaluatorPassRates[e.name] ?? { passed: 0, total: 0 };
      cur.total += 1;
      if (e.passed) cur.passed += 1;
      stats.evaluatorPassRates[e.name] = cur;
    }
    latencySum += s.latencyMs;
    if (s.model && !s.model.startsWith("template")) llmRuns += 1;
  }

  stats.passRate = stats.allEvaluatorsPassed / total;
  stats.avgLatencyMs = Math.round(latencySum / total);
  stats.llmShare = llmRuns / total;
  return stats;
}

/** Test helper. */
export function resetSessions(): void {
  sessions.length = 0;
}
