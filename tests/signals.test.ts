import { describe, expect, it } from "vitest";
import { trendSignal } from "@/lib/signals/trend";
import { momentumSignal } from "@/lib/signals/momentum";
import { volatilitySignal } from "@/lib/signals/volatility";
import { volumeSignal } from "@/lib/signals/volume";
import { structureSignal } from "@/lib/signals/structure";
import { globalSignal } from "@/lib/signals/global";
import { newsSignal } from "@/lib/signals/newsSentiment";
import { flowsSignal } from "@/lib/signals/flows";
import { compositeScore, zoneFor } from "@/lib/signals";
import { analyzeHeadline } from "@/lib/signals/lexicon";
import { fallingCloses, risingCloses } from "./helpers";

describe("trendSignal", () => {
  it("is positive in an uptrend", () => {
    const s = trendSignal({ niftyCloses: risingCloses(250) });
    expect(s.available).toBe(true);
    expect(s.score).toBeGreaterThan(1);
  });
  it("is negative in a downtrend", () => {
    const s = trendSignal({ niftyCloses: fallingCloses(250) });
    expect(s.score).toBeLessThan(-1);
  });
  it("is unavailable with short history", () => {
    const s = trendSignal({ niftyCloses: risingCloses(50) });
    expect(s.available).toBe(false);
  });
});

describe("momentumSignal", () => {
  it("is positive with broad participation", () => {
    const s = momentumSignal({
      niftyCloses: risingCloses(30),
      breadth: { advances: 40, declines: 8, unchanged: 2 },
    });
    expect(s.score).toBeGreaterThan(0.5);
  });
  it("is negative with broad selling", () => {
    const s = momentumSignal({
      niftyCloses: fallingCloses(30),
      breadth: { advances: 6, declines: 42, unchanged: 2 },
    });
    expect(s.score).toBeLessThan(-0.5);
  });
});

describe("volatilitySignal", () => {
  it("is negative when VIX is high and spiking", () => {
    const s = volatilitySignal({
      niftyCloses: risingCloses(60),
      vix: { value: 26, changePct: 12 },
    });
    expect(s.score).toBeLessThan(-0.5);
  });
  it("is mildly positive when VIX is calm", () => {
    const s = volatilitySignal({
      niftyCloses: risingCloses(60),
      vix: { value: 11, changePct: -2 },
    });
    expect(s.score).toBeGreaterThan(0);
  });
  it("is unavailable without VIX or history", () => {
    const s = volatilitySignal({ niftyCloses: [] });
    expect(s.available).toBe(false);
  });
});

describe("volumeSignal", () => {
  it("scores high-volume up day positively", () => {
    const s = volumeSignal({
      niftyCloses: risingCloses(25),
      stock: { name: "TEST", closes: [], volumes: [], volDay: 3_000_000, volAvg20: 1_000_000, changePct: 1.2 },
    });
    expect(s.available).toBe(true);
    expect(s.score).toBeGreaterThan(0);
  });
  it("scores high-volume down day negatively", () => {
    const s = volumeSignal({
      niftyCloses: fallingCloses(25),
      stock: { name: "TEST", closes: [], volumes: [], volDay: 3_000_000, volAvg20: 1_000_000, changePct: -1.4 },
    });
    expect(s.score).toBeLessThan(0);
  });
  it("is unavailable without a stock", () => {
    const s = volumeSignal({ niftyCloses: [] });
    expect(s.available).toBe(false);
  });
  it("is unavailable without real volume figures", () => {
    const s = volumeSignal({ niftyCloses: risingCloses(25), stock: { name: "TEST", closes: [], volumes: [] } });
    expect(s.available).toBe(false);
  });
});

describe("structureSignal", () => {
  it("is positive near 52w high", () => {
    const s = structureSignal({ niftyCloses: risingCloses(250) });
    expect(s.score).toBeGreaterThan(0.5);
  });
  it("is negative near 52w low", () => {
    const s = structureSignal({ niftyCloses: fallingCloses(250) });
    expect(s.score).toBeLessThan(-0.5);
  });
});

describe("globalSignal", () => {
  it("is positive when the dollar eases and the rupee firms", () => {
    const s = globalSignal([
      { name: "Dollar Index (proxy)", changePct: -0.4 },
      { name: "USD/INR", changePct: -0.2, price: 95.5 },
    ]);
    expect(s.score).toBeGreaterThan(0.3);
  });
  it("is negative with dollar strength and a weakening rupee", () => {
    const s = globalSignal([
      { name: "Dollar Index (proxy)", changePct: 0.9 },
      { name: "USD/INR", changePct: 0.4, price: 96.1 },
    ]);
    expect(s.score).toBeLessThan(-0.3);
  });
  it("is unavailable without quotes", () => {
    const s = globalSignal([]);
    expect(s.available).toBe(false);
  });
});

describe("newsSignal", () => {
  it("is positive on positive headlines", () => {
    const s = newsSignal([
      { sentiment: 0.8, topics: ["market"] },
      { sentiment: 0.6, topics: ["earnings"] },
      { sentiment: 0.7, topics: [] },
    ]);
    expect(s.score).toBeGreaterThan(0.3);
  });
  it("is negative on negative headlines", () => {
    const s = newsSignal([
      { sentiment: -0.8, topics: ["market"] },
      { sentiment: -0.6, topics: ["crude"] },
    ]);
    expect(s.score).toBeLessThan(-0.3);
  });
  it("is unavailable with no news", () => {
    expect(newsSignal([]).available).toBe(false);
  });
});

describe("flowsSignal", () => {
  it("is negative on heavy FII selling", () => {
    const s = flowsSignal({ fiiNetCr: -3000, diiNetCr: 1500, available: true });
    expect(s.score).toBeLessThan(0);
  });
  it("is unavailable when marked unavailable", () => {
    expect(flowsSignal({ fiiNetCr: null, diiNetCr: null, available: false }).available).toBe(false);
  });
});

describe("compositeScore", () => {
  it("maps strongly bullish signals to the Bullish zone", () => {
    const signals = [
      trendSignal({ niftyCloses: risingCloses(250) }),
      momentumSignal({ niftyCloses: risingCloses(30), breadth: { advances: 45, declines: 3, unchanged: 2 } }),
      volatilitySignal({ niftyCloses: risingCloses(60), vix: { value: 11, changePct: -3 } }),
      structureSignal({ niftyCloses: risingCloses(250) }),
      newsSignal(Array(6).fill({ sentiment: 0.7, topics: [] })),
    ];
    const c = compositeScore(signals);
    expect(c.score).toBeGreaterThan(35);
    expect(c.zone).toBe("Bullish");
    expect(c.drivers.length).toBeGreaterThan(0);
  });

  it("renormalizes when signals are unavailable", () => {
    const signals = [
      trendSignal({ niftyCloses: risingCloses(250) }),
      newsSignal([]), // unavailable
      flowsSignal({ fiiNetCr: null, diiNetCr: null, available: false }),
    ];
    const c = compositeScore(signals);
    expect(c.zone).toBe("Bullish"); // only trend contributes, and it is bullish
  });
});

describe("zoneFor", () => {
  it("classifies thresholds", () => {
    expect(zoneFor(50)).toBe("Bullish");
    expect(zoneFor(20)).toBe("Optimistic");
    expect(zoneFor(0)).toBe("Uncertain");
    expect(zoneFor(-20)).toBe("Cautious");
    expect(zoneFor(-50)).toBe("Bearish");
  });
});

describe("analyzeHeadline (lexicon)", () => {
  it("scores bullish headlines positively", () => {
    const a = analyzeHeadline("Nifty surges as banks rally on strong results");
    expect(a.sentiment).toBeGreaterThan(0);
    expect(a.topics.length).toBeGreaterThan(0);
  });
  it("scores bearish headlines negatively", () => {
    const a = analyzeHeadline("Sensex crashes as crude oil spikes and FIIs sell");
    expect(a.sentiment).toBeLessThan(0);
  });
  it("is near-neutral on neutral headlines", () => {
    const a = analyzeHeadline("RBI announces schedule for government bond auctions");
    expect(Math.abs(a.sentiment)).toBeLessThan(0.5);
  });
});
