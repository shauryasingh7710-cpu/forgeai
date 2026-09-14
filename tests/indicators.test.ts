import { describe, expect, it } from "vitest";
import { sma, smaSeries } from "@/lib/indicators/sma";
import { rsi } from "@/lib/indicators/rsi";
import { macd } from "@/lib/indicators/macd";
import { bollinger } from "@/lib/indicators/bollinger";
import { realizedVol } from "@/lib/indicators/volatility";
import { volumeProfile } from "@/lib/indicators/volumeProfile";
import { structure } from "@/lib/indicators/structure";
import { continueFrom, fallingCloses, flatCloses, risingCloses } from "./helpers";

describe("sma", () => {
  it("computes a simple average", () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
  });
  it("returns null when insufficient data", () => {
    expect(sma([1, 2], 5)).toBeNull();
  });
  it("smaSeries produces the right count", () => {
    const series = smaSeries(risingCloses(60), 50, 30);
    expect(series.length).toBe(11);
  });
});

describe("rsi", () => {
  it("is high (>70) in a steady uptrend", () => {
    const r = rsi(risingCloses(60))!;
    expect(r).toBeGreaterThan(70);
  });
  it("is low (<30) in a steady downtrend", () => {
    const r = rsi(fallingCloses(60))!;
    expect(r).toBeLessThan(30);
  });
  it("returns null until period+1 points", () => {
    expect(rsi(risingCloses(10))).toBeNull();
  });
  it("is bounded 0..100", () => {
    const r = rsi(flatCloses(30, 100).map((v, i) => (i % 2 ? v * 1.05 : v * 0.95)))!;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
  });
});

describe("macd", () => {
  it("line is positive in an uptrend", () => {
    const m = macd(risingCloses(60))!;
    expect(m.macd).toBeGreaterThan(0);
    expect(m.macd).toBeGreaterThan(m.signal);
  });
  it("line is negative in a downtrend", () => {
    const base = fallingCloses(60);
    const m = macd([...base, ...continueFrom(base, 6, -0.6)])!;
    expect(m.macd).toBeLessThan(0);
    expect(m.macd).toBeLessThan(m.signal);
  });
  it("detects a fresh bullish cross after a sharp V-turn", () => {
    // 48 sessions sliding, then a recovery that starts ~8 bars ago.
    const series = [...fallingCloses(48, 100, 0.2), ...risingCloses(8, 91, 1.0)];
    const m = macd(series)!;
    expect(m.crossState).toBe("bullish");
  });
  it("returns null when insufficient data", () => {
    expect(macd(risingCloses(20))).toBeNull();
  });
});

describe("bollinger", () => {
  it("places flat prices mid-band", () => {
    const b = bollinger(flatCloses(60, 100))!;
    expect(b.percentB).toBeCloseTo(0.5, 5);
    expect(b.squeeze).toBe(true); // zero width is minimal
  });
  it("places rising price above mid-band", () => {
    const b = bollinger(risingCloses(80))!;
    expect(b.percentB).toBeGreaterThan(0.5);
  });
});

describe("realizedVol", () => {
  it("is near zero for flat series", () => {
    const v = realizedVol(flatCloses(30, 100))!;
    expect(v).toBeLessThan(1);
  });
  it("is positive for volatile series", () => {
    const data = flatCloses(30, 100).map((v, i) => (i % 2 ? v * 1.04 : v * 0.96));
    expect(realizedVol(data)!).toBeGreaterThan(10);
  });
});

describe("volumeProfile", () => {
  it("computes ratio and balance", () => {
    const data = risingCloses(30).map((close, i) => ({ close, volume: 1_000_000 + i * 10_000 }));
    const vp = volumeProfile(data);
    expect(vp.ratio).not.toBeNull();
    expect(vp.upDownBalance).not.toBeNull();
    expect(vp.upDownBalance!).toBeGreaterThan(0); // rising series = up-volume dominant
  });
  it("returns nulls for short data", () => {
    const vp = volumeProfile([{ close: 100, volume: 10 }]);
    expect(vp.ratio).toBeNull();
  });
});

describe("structure", () => {
  it("sits near range top in an uptrend", () => {
    const s = structure(risingCloses(250))!;
    expect(s.rangePosition).toBeGreaterThan(0.9);
    expect(s.near20dHigh).toBe(true);
  });
  it("sits near range bottom in a downtrend", () => {
    const s = structure(fallingCloses(250))!;
    expect(s.rangePosition).toBeLessThan(0.1);
    expect(s.near20dLow).toBe(true);
  });
  it("returns null for short history", () => {
    expect(structure(risingCloses(30))).toBeNull();
  });
});
