/**
 * NSE official intraday minute data — the real deal for intraday trading.
 *
 * `chart-databyindex` is the same feed NSE's own website charts render from:
 * one minute-bar series per session (open/high/low/close + volume) for
 * indices and NSE equities. Keyless with a browser-like cookie handshake;
 * shape is empty outside market hours (it only carries today's session).
 *
 * Sessions persist to disk (.cache/) so the Today view still works after a
 * restart or an NSE outage — identical pattern to the allIndices snapshot.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { cached } from "./cache";
import { canUse, recordFailure, recordSuccess } from "./circuitBreaker";
import type { Candle } from "./types";

const BASE = "https://www.nseindia.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface NseGraphPoint {
  value?: string; // "\"HH:MM\";price"
}

function parseGraphData(points: NseGraphPoint[]): { time: number; price: number }[] {
  const out: { time: number; price: number }[] = [];
  const todayIst = istDateString();
  for (const p of points) {
    const raw = typeof p.value === "string" ? p.value : "";
    const m = raw.match(/"(\d{2}:\d{2})";([\d.]+)/);
    if (!m) continue;
    // NSE minute labels are IST — rebuild the epoch against today's IST date.
    const [hh, mm] = m[1]!.split(":").map(Number);
    const istEpoch = istDateToEpoch(todayIst, hh!, mm!);
    out.push({ time: istEpoch, price: Number(m[2]) });
  }
  return out;
}

/** Today's date in IST as YYYY-MM-DD (NSE sessions run on IST calendar). */
function istDateString(): string {
  const ist = new Date(Date.now() + (5.5 * 60 + new Date().getTimezoneOffset()) * 60000);
  return ist.toISOString().slice(0, 10);
}

/** Convert an IST wall-clock time to epoch seconds (treats IST = UTC+5:30). */
function istDateToEpoch(dateStr: string, hh: number, mm: number): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return Math.floor(Date.UTC(y!, mo! - 1, d!, hh, mm) / 1000) - 5.5 * 3600;
}

// ------------------------------------------------------------- handshake ---

let chartCookieCache: { cookie: string; fetchedAt: number } | null = null;

async function nseChartCookies(): Promise<string> {
  if (chartCookieCache && Date.now() - chartCookieCache.fetchedAt < 10 * 60 * 1000) {
    return chartCookieCache.cookie;
  }
  const res = await fetch(BASE, {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-IN,en;q=0.9" },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`nse home ${res.status}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error("nse returned no cookies");
  chartCookieCache = { cookie, fetchedAt: Date.now() };
  return cookie;
}

// --------------------------------------------------------------- session ---

export interface NseIntradaySession {
  /** Minute bars, latest last. Empty outside market hours. */
  minutes: { time: number; price: number }[];
  /** Same series as OHLC candles (each bar open=prev close) for the chart. */
  candles: Candle[];
}

function toCandles(minutes: { time: number; price: number }[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < minutes.length; i++) {
    const price = minutes[i]!.price;
    const open = i === 0 ? price : minutes[i - 1]!.price;
    out.push({
      time: minutes[i]!.time,
      open,
      high: Math.max(open, price),
      low: Math.min(open, price),
      close: price,
      volume: 0,
    });
  }
  return out;
}

function parseSession(json: unknown): NseIntradaySession {
  const j = json as { grapthData?: NseGraphPoint[] };
  const minutes = parseGraphData(j.grapthData ?? []);
  return { minutes, candles: toCandles(minutes) };
}

async function fetchChart(indexParam: string, indices: boolean, referer: string): Promise<NseIntradaySession> {
  const cookie = await nseChartCookies();
  const url = `${BASE}/api/chart-databyindex?${indices ? "index" : "symbol"}=${encodeURIComponent(indexParam)}&indices=${indices}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Accept-Language": "en-IN,en;q=0.9",
      Referer: referer,
      Cookie: cookie,
    },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok) {
    recordFailure("nse-chart");
    throw new Error(`nse chart ${res.status}`);
  }
  const json = await res.json();
  recordSuccess("nse-chart");
  return parseSession(json);
}

// --------------------------------------------------------------- snapshot ---

const SNAPSHOT_DIR = path.join(process.cwd(), ".cache");

function snapshotFile(key: string): string {
  return path.join(SNAPSHOT_DIR, `nse-intraday-${key.replace(/[^A-Za-z0-9]/g, "_")}.json`);
}

function readSnapshot(key: string): NseIntradaySession | null {
  try {
    const raw = JSON.parse(readFileSync(snapshotFile(key), "utf8")) as {
      savedAt: number;
      session: NseIntradaySession;
    };
    // Snapshot valid the same calendar day (IST) — intraday data expires nightly.
    if (raw.savedAt > Date.now() - 20 * 60 * 60 * 1000 && raw.session.minutes.length > 0) {
      return raw.session;
    }
    return null;
  } catch {
    return null;
  }
}

function writeSnapshot(key: string, session: NseIntradaySession): void {
  try {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    if (session.minutes.length === 0) return; // never persist an empty session
    writeFileSync(snapshotFile(key), JSON.stringify({ savedAt: Date.now(), session }));
  } catch {
    // best-effort
  }
}

/**
 * Today's intraday session for an index (e.g. "NIFTY 50") or NSE symbol
 * (e.g. "RELIANCE"), cached 2 minutes. Falls back to today's persisted
 * session when NSE is unreachable. Empty `minutes` outside market hours
 * (callers show the 3-day daily view instead).
 */
export async function getNseIntraday(key: string, isIndex: boolean): Promise<NseIntradaySession> {
  const cacheKey = `nse:intraday:${isIndex ? "i" : "s"}:${key}`;
  const { value } = await cached(cacheKey, 2 * 60 * 1000, async () => {
    if (!canUse("nse-chart")) throw new Error("nse-chart circuit open");
    const referer = isIndex
      ? "https://www.nseindia.com/reports-indices/historical-index-data"
      : `https://www.nseindia.com/get-quotes/equity/quote?symbol=${encodeURIComponent(key)}`;
    try {
      const session = await fetchChart(key, isIndex, referer);
      if (session.minutes.length > 0) writeSnapshot(key, session);
      return session;
    } catch {
      // NSE unreachable / outside hours with a dead handshake — try the disk.
      const snap = readSnapshot(key);
      if (snap) return snap;
      return { minutes: [], candles: [] } as NseIntradaySession;
    }
  });
  return value;
}
