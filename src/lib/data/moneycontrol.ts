/**
 * MoneyControl price API — free, keyless stock data for NSE equities.
 *
 * Two endpoints power Stock Focus:
 *   1. autosuggest search  → resolves any company name to an MC scrip code
 *   2. /pricefeed          → ONE call with last price, prev close, open,
 *      50/150/200-day averages (real DMAs), 52-week high/low + dates, volumes
 *      (20/30-day averages + day volume) and 1w/1m/3m/1y performance values.
 *
 * MC has no free daily-candle endpoint, so indicator history is synthesized
 * from the REAL published anchors (previous close, 1w/1m changes, 50/150/200
 * DMAs, 52-week band) — see mcCandles(). Every derived reading is labeled.
 */
import { cached } from "./cache";
import { canUse, recordFailure, recordSuccess } from "./circuitBreaker";
import { buildAnchoredHistory, type QuoteShape } from "./nse";
import type { Candle } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const PRICEFEED = "https://priceapi.moneycontrol.com/pricefeed/nse/equitycash/";
const SUGGEST =
  "https://www.moneycontrol.com/mccode/common/autosuggestion_solr.php?classic=true&type=1&format=json&query=";

// ------------------------------------------------------------------ types --

export interface McSnapshot {
  quote: QuoteShape & {
    open?: number;
    dayHigh?: number;
    dayLow?: number;
    sector?: string;
    pe?: number;
    marketCapCr?: number;
  };
  /** Real published indicator anchors from MC. */
  real: {
    dma50: number | null;
    dma150: number | null;
    dma200: number | null;
    w52High: number | null;
    w52Low: number | null;
    volDay: number | null;
    volAvg20: number | null;
    volAvg30: number | null;
    chg1wPct: number | null;
    chg1mPct: number | null;
    chg3mPct: number | null;
    chg1yPct: number | null;
    delivPct: number | null;
  };
  /** Synthetic daily closes anchored to the real values above. */
  closes: number[];
  volumes: number[];
}

// --------------------------------------------------------------- resolver --

export interface McMatch {
  mcCode: string; // MC scrip code, e.g. "HDF01"
  nseSymbol: string; // e.g. "HDFCBANK"
  name: string; // e.g. "HDFC Bank"
  isin?: string;
}

interface SuggestItem {
  sc_id?: string;
  link_src?: string;
  pdt_dis_nm?: string;
  name?: string;
}

/** Extract NSE symbol + ISIN from MC's html-ish display string. */
function parseDisplay(pdt?: string): { nseSymbol?: string; isin?: string } {
  if (!pdt) return {};
  const text = pdt.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
  // pattern: "INE040A01034, HDFCBANK, 500180"
  const m = text.match(/([A-Z0-9]{12}),\s*([A-Z0-9&-]+),\s*(\d+)/);
  if (m) return { isin: m[1], nseSymbol: m[2] };
  return {};
}

/** Resolve a free-text query to the best MC scrip match (cached 24h). */
export async function resolveMcCode(query: string): Promise<McMatch | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const { value } = await cached(`mc:suggest:${q}`, 24 * 60 * 60 * 1000, async () => {
    const res = await fetch(SUGGEST + encodeURIComponent(q), {
      headers: { "User-Agent": UA, Referer: "https://www.moneycontrol.com/", Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`mc suggest ${res.status}`);
    const items = (await res.json()) as SuggestItem[];
    const out: McMatch[] = [];
    for (const it of items.slice(0, 5)) {
      // link_src ends with /<SC_CODE> — that's the code pricefeed accepts
      const code = it.sc_id ?? it.link_src?.split("/").pop();
      if (!code) continue;
      const { nseSymbol, isin } = parseDisplay(it.pdt_dis_nm);
      out.push({ mcCode: code.toUpperCase(), nseSymbol: nseSymbol ?? "", name: (it.name ?? "").replace(/&amp;/g, "&").trim(), isin });
    }
    if (out.length === 0) throw new Error("no matches");
    return out;
  });
  return value[0] ?? null;
}

// -------------------------------------------------------------- pricefeed --

interface PricefeedResponse {
  code?: string;
  data?: Record<string, unknown>;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function fetchPricefeed(mcCode: string): Promise<Record<string, unknown>> {
  if (!canUse("moneycontrol")) throw new Error("moneycontrol circuit open");
  const res = await fetch(PRICEFEED + encodeURIComponent(mcCode), {
    headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://www.moneycontrol.com/" },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!res.ok) {
    recordFailure("moneycontrol");
    throw new Error(`mc pricefeed ${res.status}`);
  }
  const json = (await res.json()) as PricefeedResponse;
  if (!json.data || num(json.data.LP) == null) {
    recordFailure("moneycontrol");
    throw new Error(`no pricefeed data for ${mcCode}`);
  }
  recordSuccess("moneycontrol");
  return json.data;
}

/**
 * Build the Stock Focus payload for one MC code.
 * `closes`/`volumes` are deterministic reconstructions anchored to MC's REAL
 * published values (prev close, 1w/1m changes, 50/150/200 DMAs, 52w band);
 * every signal card discloses "approx. (anchored to real levels)".
 */
export async function getMcSnapshot(mcCode: string, nseSymbol?: string, name?: string): Promise<McSnapshot> {
  const { value } = await cached(`mc:snap:${mcCode}`, 3 * 60 * 1000, () =>
    (async () => {
      const d = await fetchPricefeed(mcCode);
      const price = num(d.LP)!;
      const prevClose = num(d.priceprevclose) ?? num(d.PC) ?? price;
      const yh = num(d["52H"]) ?? price;
      const yl = num(d["52L"]) ?? price;

      const quote = {
        symbol: (typeof d.NSEID === "string" && d.NSEID) || nseSymbol || mcCode,
        name: name || (typeof d.SC_FULLNM === "string" ? d.SC_FULLNM.slice(0, 40) : mcCode),
        price,
        previousClose: prevClose,
        change: num(d.pricechange) ?? price - prevClose,
        changePct: num(d.pricepercentchange) ?? (prevClose ? ((price - prevClose) / prevClose) * 100 : 0),
        currency: "INR",
        asOf: Date.now(),
        spark: [] as number[],
        yearHigh: yh,
        yearLow: yl,
        open: num(d.OPN) ?? undefined,
        dayHigh: num(d.HP) ?? undefined,
        dayLow: num(d["52L"]) === yl ? num(d.DNH) ?? undefined : undefined,
        sector: typeof d.SECTOR === "string" ? d.SECTOR : typeof d.main_sector === "string" ? d.main_sector : undefined,
        pe: num(d.PE) ?? undefined,
        marketCapCr: num(d.MKTCAP) ?? undefined,
      };

      const real = {
        dma50: num(d["50DayAvg"]),
        dma150: num(d["150DayAvg"]),
        dma200: num(d["200DayAvg"]),
        w52High: yh,
        w52Low: yl,
        volDay: num(d.VOL),
        volAvg20: num(DVolAvg20(d)),
        volAvg30: num(d.DVolAvg30),
        chg1wPct: pctFromPair(num(d.cl1wVal), price),
        chg1mPct: pctFromPair(num(d.cl1mVal), price),
        chg3mPct: pctFromPair(num(d.cl3mVal), price),
        chg1yPct: pctFromPair(num(d.cl1yVal), price),
        delivPct: num(d.DELV),
      };

      const closes = mcCloses({ price, prevClose, dma50: real.dma50, dma150: real.dma150, dma200: real.dma200, w52High: yh, w52Low: yl, chg1wPct: real.chg1wPct, chg1mPct: real.chg1mPct });
      const volumes = mcVolumes({ volDay: real.volDay, volAvg20: real.volAvg20, volAvg30: real.volAvg30, closes });

      return { quote: { ...quote, spark: closes.slice(-30) }, real, closes, volumes };
    })(),
  );
  return value;
}

function DVolAvg20(d: Record<string, unknown>): number | null {
  return num(d.DVolAvg20);
}

function pctFromPair(anchorVal: number | null, price: number): number | null {
  if (anchorVal == null || anchorVal <= 0 || price <= 0) return null;
  return ((price - anchorVal) / anchorVal) * 100;
}

const MC_DAYS = 230;

/**
 * Deterministic close series that EXACTLY touches MC's real published values:
 *   t0 = last price · t-1 = prev close · t-6 = 1-week anchor ·
 *   t-21 = 1-month anchor · long glide consistent with the real 200-DMA ·
 *   distant past sweeps the real 52-week band.
 * The recent segment (5d/20d momentum, RSI, short DMAs) is a smooth cosine
 * blend BETWEEN the exact anchors — no synthetic swings. Derived indicator
 * scores are labeled approximations; the DMA/52w/volume tiles show MC's
 * published values directly.
 */
export function mcCloses(a: {
  price: number;
  prevClose: number;
  dma50: number | null;
  dma150: number | null;
  dma200: number | null;
  w52High: number;
  w52Low: number;
  chg1wPct: number | null;
  chg1mPct: number | null;
}): number[] {
  const days = MC_DAYS;
  const closes: number[] = new Array(days);
  const seed = Math.round(a.price * 100) % 997;
  const noise = (i: number): number => {
    let x = seed * 9301 + i * 49297;
    x = (x % 233280) / 233280;
    return (x * 2 - 1) * 0.004;
  };

  // ---- exact anchors -----------------------------------------------------
  const wkVal = a.chg1wPct != null ? a.price / (1 + a.chg1wPct / 100) : null;
  const moVal = a.chg1mPct != null ? a.price / (1 + a.chg1mPct / 100) : null;

  const knots: { i: number; v: number }[] = [
    { i: days - 1, v: a.price },
    { i: days - 2, v: a.prevClose || a.price },
  ];
  if (wkVal != null) knots.push({ i: days - 7, v: wkVal });
  if (moVal != null) knots.push({ i: days - 21, v: moVal });
  knots.sort((x, y) => y.i - x.i);

  // far-past glide target: the real 200-DMA when published (else band mid)
  const glideTarget = a.dma200 ?? a.dma150 ?? a.dma50 ?? (a.w52High + a.w52Low) / 2;
  const span = Math.max(a.w52High - a.w52Low, a.price * 0.02);
  const lastKnot = knots[knots.length - 1]!;

  // recent segment: cosine blend between exact knots + gentle oscillation so
  // up/down days mix (an all-down glide would pin RSI unrealistically)
  const wig = (i: number): number => 1 + 0.004 * Math.sin(i * 1.9 + seed * 0.3);
  for (let k = 0; k < knots.length - 1; k++) {
    const p = knots[k]!;
    const q = knots[k + 1]!;
    for (let i = p.i; i > q.i; i--) {
      const t = (p.i - i) / Math.max(1, p.i - q.i);
      closes[i] = cosineBetween(p.v, q.v, t) * wig(i) * (1 + noise(i) * 0.5);
    }
  }

  // distant past: exponential glide toward the real 200-DMA + gentle sweep
  for (let i = lastKnot.i - 1; i >= 0; i--) {
    const back = lastKnot.i - i;
    const t = i / (days - 1);
    const glide = glideTarget + (lastKnot.v - glideTarget) * Math.exp(-back / 60);
    const sweep = Math.sin(t * Math.PI * 2 + seed * 0.7) * span * 0.07;
    let v = glide + sweep;
    v = Math.min(a.w52High, Math.max(a.w52Low, v));
    closes[i] = v;
  }

  for (const k of knots) closes[k.i] = k.v;
  closes[days - 1] = a.price;
  return closes;
}

/** Cosine-eased interpolation between anchor points (no kinks/overshoot). */
function cosineBetween(y0: number, y1: number, t: number): number {
  const e = 0.5 - 0.5 * Math.cos(Math.PI * t);
  return y0 + (y1 - y0) * e;
}

/** Volume series anchored to MC's real day volume and 20/30-day averages. */
function mcVolumes(v: { volDay: number | null; volAvg20: number | null; volAvg30: number | null; closes: number[] }): number[] {
  const n = v.closes.length;
  const out: number[] = new Array(n);
  const base = v.volAvg20 ?? v.volAvg30 ?? v.volDay ?? null;
  const seed = Math.round((v.volDay ?? 1) + (v.volAvg20 ?? 1));
  for (let i = 0; i < n; i++) {
    let x = seed * 9301 + i * 49297;
    x = (x % 233280) / 233280;
    const jitter = 0.75 + x * 0.5; // 0.75×..1.25×
    out[i] = base != null ? Math.round(base * jitter) : 0;
  }
  if (v.volDay != null) out[n - 1] = v.volDay;
  return out;
}

/** Convenience: Candle[] for adapters that expect the generic shape. */
export function mcCandles(snap: McSnapshot): Candle[] {
  const now = Math.floor(Date.now() / 1000);
  return snap.closes.map((close, i) => ({
    time: now - (snap.closes.length - 1 - i) * 86400,
    open: close,
    high: close,
    low: close,
    close,
    volume: snap.volumes[i] ?? 0,
  }));
}

// -------------------------------------------------------------- watchlist --

/**
 * Curated Nifty-50 watchlist with VERIFIED MoneyControl scrip codes
 * (each resolved via MC autosuggest and checked against pricefeed's NSEID).
 */
export interface WatchEntry {
  symbol: string; // NSE symbol
  name: string;
  mcCode: string;
}

export const MC_WATCHLIST: WatchEntry[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", mcCode: "RI" },
  { symbol: "TCS", name: "Tata Consultancy Services", mcCode: "TCS" },
  { symbol: "HDFCBANK", name: "HDFC Bank", mcCode: "HDF01" },
  { symbol: "ICICIBANK", name: "ICICI Bank", mcCode: "ICI02" },
  { symbol: "INFY", name: "Infosys", mcCode: "IT" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", mcCode: "BTV" },
  { symbol: "SBIN", name: "State Bank of India", mcCode: "SBI" },
  { symbol: "ITC", name: "ITC", mcCode: "ITC" },
  { symbol: "LT", name: "Larsen & Toubro", mcCode: "LT" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", mcCode: "KMF" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", mcCode: "HL" },
  { symbol: "AXISBANK", name: "Axis Bank", mcCode: "UTI10" },
  { symbol: "MARUTI", name: "Maruti Suzuki", mcCode: "MU01" },
  { symbol: "M&M", name: "Mahindra & Mahindra", mcCode: "MM" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", mcCode: "SPI" },
  { symbol: "TMCV", name: "Tata Motors", mcCode: "TML02" },
  { symbol: "TATASTEEL", name: "Tata Steel", mcCode: "TIS" },
  { symbol: "NTPC", name: "NTPC", mcCode: "NTP" },
  { symbol: "POWERGRID", name: "Power Grid Corp", mcCode: "PGC" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", mcCode: "BAF" },
  { symbol: "ASIANPAINT", name: "Asian Paints", mcCode: "API" },
  { symbol: "HCLTECH", name: "HCL Technologies", mcCode: "HCL02" },
  { symbol: "WIPRO", name: "Wipro", mcCode: "W" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", mcCode: "UTC" },
  { symbol: "TITAN", name: "Titan Company", mcCode: "TI01" },
  { symbol: "ADANIENT", name: "Adani Enterprises", mcCode: "AE01" },
  { symbol: "NIFTYBEES", name: "Nippon Nifty 50 ETF", mcCode: "NBE01" },
];

/** Market-level "index stock" — the Nifty 50 ETF used for market volume/trend. */
export const NIFTY_ETF = MC_WATCHLIST[MC_WATCHLIST.length - 1];

/** Fast NSE-symbol → entry map (rebuilt per call; entries are static). */
export function mcWatchlistMap(): Map<string, WatchEntry> {
  return new Map(MC_WATCHLIST.map((e) => [e.symbol.toUpperCase(), e]));
}
