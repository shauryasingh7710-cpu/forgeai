import { describe, expect, it } from "vitest";
import { answerChat, classifyIntent } from "@/lib/llm/chat";
import type { SignalPayload } from "@/lib/data/types";
import { buildPayload, compositeScore } from "@/lib/signals";
import { fallingCloses, flatCloses, risingCloses } from "./helpers";
import { trendSignal } from "@/lib/signals/trend";
import { momentumSignal } from "@/lib/signals/momentum";
import { volatilitySignal } from "@/lib/signals/volatility";
import { newsSignal } from "@/lib/signals/newsSentiment";

function makePayload(zoneUp: boolean): SignalPayload {
  const base = zoneUp ? risingCloses(60) : fallingCloses(60);
  const signals = [
    trendSignal({ niftyCloses: base, subject: "Nifty" }),
    momentumSignal({ niftyCloses: base, breadth: undefined, subject: "Nifty" }),
    volatilitySignal({ niftyCloses: flatCloses(30, base[base.length - 1]!), subject: "Nifty" }),
    newsSignal([
      { sentiment: zoneUp ? 0.5 : -0.5, topics: ["market"] },
      { sentiment: zoneUp ? 0.3 : -0.2, topics: ["global"] },
    ]),
  ];
  const composite = compositeScore(signals);
  return buildPayload({
    asOf: new Date("2026-09-14T10:00:00Z"),
    composite,
    signals,
    indices: [{ symbol: "^NSEI", name: "Nifty 50", price: 23398.1, changePct: zoneUp ? 0.5 : -0.34 }],
    vix: { value: 12.3, changePct: 4.0 },
    news: [
      {
        title: "Markets slide on crude",
        sentiment: zoneUp ? 0.4 : -0.4,
        source: "Test",
        topics: ["market"],
        link: "https://example.com/news",
        publishedAt: Date.now(),
      },
    ],
  });
}

describe("chat intent classification", () => {
  it("routes advice requests to a refusal", () => {
    expect(classifyIntent("Should I buy Reliance now?")).toBe("advice_refusal");
    expect(classifyIntent("which stock should I invest in")).toBe("advice_refusal");
    expect(classifyIntent("what is the target price of TCS")).toBe("advice_refusal");
  });

  it("routes data questions to their signals", () => {
    expect(classifyIntent("How is India VIX looking?")).toBe("volatility");
    expect(classifyIntent("Why is the market down today?")).toBe("news");
    expect(classifyIntent("What is the 50 DMA doing?")).toBe("trend");
    expect(classifyIntent("Is the dollar hurting us?")).toBe("global");
    expect(classifyIntent("What does the score mean?")).toBe("score");
  });
});

describe("chat answers", () => {
  it("refuses advice while staying educational and grounded", async () => {
    const a = await answerChat(makePayload(false), "Should I sell everything tomorrow?");
    expect(a.intent).toBe("advice_refusal");
    expect(a.text).toMatch(/can't advise|not an advisor|educational/i);
    expect(a.text).not.toMatch(/\b(you should (buy|sell))\b/i);
  });

  it("answers VIX questions with the payload number", async () => {
    const a = await answerChat(makePayload(false), "How is India VIX looking?");
    expect(a.text).toContain("12.3");
    expect(a.source).toBe("template"); // no key configured in tests
  });

  it("answers score questions with composite + drivers", async () => {
    const a = await answerChat(makePayload(false), "What does the score mean?");
    expect(a.text).toMatch(/composite is -?\d+/);
    expect(a.text).toMatch(new RegExp(makePayload(false).composite.zone));
  });

  it("keeps replies advice-safe on every path", async () => {
    for (const q of ["What does the score mean?", "Tell me about the news"]) {
      const a = await answerChat(makePayload(true), q);
      expect(a.text).not.toMatch(/\b(buy|sell|invest in)\b/i);
    }
  });

  it("reports a fallback failure class when no key is set", async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const a = await answerChat(makePayload(false), "How is VIX looking?");
    expect(a.failureClass).toBe("chat_llm_not_configured_template_fallback");
    process.env.GEMINI_API_KEY = prev;
  });
});
