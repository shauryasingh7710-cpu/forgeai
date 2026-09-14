import { beforeEach, describe, expect, it } from "vitest";
import {
  adviceSafety,
  completeness,
  consistency,
  extractNumbers,
  filterAdviceLanguage,
  groundedness,
  narrativeSafetyCheck,
  runEvaluators,
} from "@/lib/prism/evaluators";
import { recordSession, resetSessions, sessionStats } from "@/lib/prism/session";
import { templateNarrative } from "@/lib/llm/narrative";
import type { Narrative, SignalPayload } from "@/lib/data/types";

function makePayload(): SignalPayload {
  return {
    asOf: new Date().toISOString(),
    composite: { score: 42, zone: "Optimistic" },
    groups: [
      { group: "trend", label: "Trend", score: 1.4, weight: 18, why: "Above both DMAs." },
      { group: "volatility", label: "Volatility", score: -0.8, weight: 15, why: "VIX elevated." },
      { group: "news", label: "News sentiment", score: 0.6, weight: 12, why: "Headlines lean positive." },
    ],
    indices: [{ symbol: "^NSEI", name: "Nifty 50", price: 24150.4, changePct: 0.62 }],
    vix: { value: 14.2, changePct: -3.1 },
    newsHeadlines: ["Nifty rises as banks rally"],
  };
}

function baseNarrative(): Narrative {
  return {
    headline: "Market pulse: optimistic (+42) — supportive signals",
    body:
      "The composite score is 42 of 100, which places today's market in the \"Optimistic\" zone. " +
      "The Nifty 50 is at 24150.4 (+0.62% today). India VIX sits at 14.2 (-3.1% today), which " +
      "measures how much fear is priced in. Trend (score 1.4): Above both DMAs. " +
      "Volatility (score -0.8): VIX elevated. Remember: this is an educational read of computed " +
      "signals, not investment advice.",
    watchList: [
      "Watch whether India VIX (now 14.2) expands or cools further.",
      "Watch the Trend signal — it is carrying the largest weight today.",
      "Watch market breadth for participation.",
    ],
    citedGroups: ["trend", "volatility", "news"],
    source: "template",
  };
}

describe("groundedness", () => {
  it("passes when all numbers come from the payload", () => {
    const r = groundedness(makePayload(), baseNarrative());
    expect(r.passed).toBe(true);
  });
  it("fails when a number is invented", () => {
    const n = baseNarrative();
    n.body += " The market has rallied 3.7% this week on heavy flows.";
    const r = groundedness(makePayload(), n);
    expect(r.passed).toBe(false);
    expect(r.violations?.length).toBeGreaterThan(0);
  });
  it("extractNumbers parses signed decimals", () => {
    expect(extractNumbers("score +42, vix 14.2, change -3.1%")).toContain(42);
    expect(extractNumbers("vix 14.2")).toContain(14.2);
    expect(extractNumbers("change -3.1%")).toContain(-3.1);
  });
});

describe("consistency", () => {
  it("passes when zone words match", () => {
    const r = consistency(makePayload(), baseNarrative());
    expect(r.passed).toBe(true);
  });
  it("fails on direct contradiction", () => {
    const n = baseNarrative();
    n.headline = "Market looks bearish today";
    const r = consistency(makePayload(), n);
    expect(r.passed).toBe(false);
    expect(r.details).toContain("bearish");
  });
  it("fails on softer mismatch", () => {
    const n = baseNarrative();
    n.body = "Markets remain uncertain after the open. " + n.body;
    const r = consistency(makePayload(), n);
    expect(r.passed).toBe(false);
  });
});

describe("advice-safety", () => {
  it("passes educational language", () => {
    const r = adviceSafety(makePayload(), baseNarrative());
    expect(r.passed).toBe(true);
  });
  it("flags explicit buy advice", () => {
    const n = baseNarrative();
    n.body += " You should buy Reliance now.";
    expect(narrativeSafetyCheck(n).passed).toBe(false);
  });
  it("flags price targets and stop-losses", () => {
    const n = baseNarrative();
    n.body += " The target price is 26000 with a stop-loss at 23800.";
    expect(narrativeSafetyCheck(n).passed).toBe(false);
  });
  it("allows benign market vocabulary like sell-off", () => {
    const n = baseNarrative();
    n.body = "Global markets saw a mild sell-off overnight. " + n.body;
    // sell-off is softened by the filter, and the check runs on filtered text in prod;
    // the raw check may flag it, which is why the pipeline applies filterAdviceLanguage.
    const filtered = filterAdviceLanguage(n.body);
    expect(filtered).toContain("decline");
  });
  it("filter rewrites buyers/sellers phrasing", () => {
    expect(filterAdviceLanguage("Buyers stepped in")).toContain("upward-side participants");
  });
});

describe("completeness", () => {
  it("passes when top groups are cited", () => {
    const r = completeness(makePayload(), baseNarrative());
    expect(r.passed).toBe(true);
  });
  it("fails when key groups are missing", () => {
    const n = baseNarrative();
    n.citedGroups = ["news"];
    const r = completeness(makePayload(), n);
    expect(r.passed).toBe(false);
  });
});

describe("runEvaluators", () => {
  it("returns four results", () => {
    const results = runEvaluators(makePayload(), baseNarrative());
    expect(results.map((r) => r.name)).toEqual([
      "groundedness",
      "consistency",
      "advice_safety",
      "completeness",
    ]);
  });
});

describe("session recorder", () => {
  beforeEach(() => resetSessions());

  it("records a passing session without failure class", () => {
    const payload = makePayload();
    const narrative = baseNarrative();
    const session = recordSession({
      goal: "test",
      payload,
      prompt: "PROMPT",
      narrative,
      evaluators: runEvaluators(payload, narrative),
      guardrailTriggered: false,
      llmFailureClass: null,
      model: "template-engine",
      latencyMs: 12,
    });
    expect(session.failureClass).toBeNull();
    const stats = sessionStats();
    expect(stats.totalRuns).toBe(1);
    expect(stats.passRate).toBe(1);
  });

  it("classifies evaluator failures", () => {
    const payload = makePayload();
    const narrative = baseNarrative();
    narrative.headline = "Market looks bearish today";
    const session = recordSession({
      goal: "test",
      payload,
      prompt: "PROMPT",
      narrative,
      evaluators: runEvaluators(payload, narrative),
      guardrailTriggered: false,
      llmFailureClass: null,
      model: "template-engine",
      latencyMs: 12,
    });
    expect(session.failureClass).toContain("evaluator:consistency");
    expect(sessionStats().failuresByClass["evaluator:consistency"]).toBe(1);
  });

  it("classifies guardrail triggers first", () => {
    const payload = makePayload();
    const narrative = baseNarrative();
    narrative.body += " You should buy everything.";
    const session = recordSession({
      goal: "test",
      payload,
      prompt: "PROMPT",
      narrative,
      evaluators: runEvaluators(payload, narrative),
      guardrailTriggered: true,
      llmFailureClass: null,
      model: "template-engine",
      latencyMs: 12,
    });
    expect(session.failureClass).toBe("guardrail:advice_language");
  });

  it("template narrative passes its own evaluators", () => {
    const payload = makePayload();
    const narrative = templateNarrative(payload);
    const results = runEvaluators(payload, narrative);
    for (const r of results) {
      expect(r.passed, `${r.name}: ${r.details}`).toBe(true);
    }
  });
});
