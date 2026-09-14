/**
 * World indices — one keyless batched call to CNBC's public quote service.
 *
 * Carries the major global benchmarks across the US, Europe and Asia with
 * names, last prices and % changes. No API key, no documented rate limit,
 * cached 5 minutes like every other source.
 *
 * GIFT Nifty: no reliable free keyless feed exists, so we probe a small set
 * of candidate codes at runtime (cached all day). If none resolves, the row
 * is simply omitted — the strip never shows a dead tile.
 */
import { cached } from "./cache";
import { canUse, recordFailure, recordSuccess } from "./circuitBreaker";
import type { Quote } from "./types";

const CNBC_URL =
  "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=";

export interface WorldIndex {
  symbol: string; // our canonical key, e.g. "DJIA"
  name: string; // e.g. "Dow Jones"
  price: number;
  changePct: number;
  region: "americas" | "europe" | "asia";
  flag: string; // emoji for the UI
}

interface CnbcCandidate {
  key: string; // CNBC symbol
  name: string;
  region: WorldIndex["region"];
  flag: string;
}

const CANDIDATES: CnbcCandidate[] = [
  { key: ".DJI", name: "Dow Jones", region: "americas", flag: "🇺🇸" },
  { key: ".SPX", name: "S&P 500", region: "americas", flag: "🇺🇸" },
  { key: ".IXIC", name: "Nasdaq", region: "americas", flag: "🇺🇸" },
  { key: ".FTSE", name: "FTSE 100", region: "europe", flag: "🇬🇧" },
  { key: ".DAX", name: "DAX", region: "europe", flag: "🇩🇪" },
  { key: ".CAC", name: "CAC 40", region: "europe", flag: "🇫🇷" },
  { key: ".STOXX50", name: "Euro Stoxx 50", region: "europe", flag: "🇪🇺" },
  { key: ".N225", name: "Nikkei 225", region: "asia", flag: "🇯🇵" },
  { key: ".HSI", name: "Hang Seng", region: "asia", flag: "🇭🇰" },
  { key: ".KS11", name: "KOSPI", region: "asia", flag: "🇰🇷" },
];

// Best-effort GIFT Nifty codes — probed once per day, shown only if one works.
const GIFT_CANDIDATES = ["GIFTNIFTY", ".GIFTNIFTY", "GIFT_N50", "NIFTY_GIFT"];

interface CnbcQuote {
  symbol: string;
  name: string;
  last: string;
  change: string;
  change_pct: string;
  last_time: string;
}

function parseNum(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(String(s).replace(/,/g, "").replace(/%+$/, ""));
  return Number.isFinite(n) ? n : null;
}

async function cnbcBatch(keys: string[]): Promise<Map<string, CnbcQuote>> {
  const out = new Map<string, CnbcQuote>();
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
  const res = await fetch(`${CNBC_URL}${keys.join("|")}&output=json&requestMethod=itv`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`cnbc quotes ${res.status}`);
  const json = (await res.json()) as {
    FormattedQuoteResult?: { FormattedQuote?: CnbcQuote[] | CnbcQuote };
  };
  const raw = json.FormattedQuoteResult?.FormattedQuote;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const q of list) {
    if (q?.symbol && parseNum(q.last) != null) out.set(q.symbol, q);
  }
  return out;
}

/** All world indices we can resolve right now (one batched call, 5-min cache). */
export async function getWorldIndices(): Promise<WorldIndex[]> {
  const { value } = await cached("world:indices", 5 * 60 * 1000, async () => {
    if (!canUse("cnbc")) throw new Error("cnbc circuit open");
    try {
      const quotes = await cnbcBatch(CANDIDATES.map((c) => c.key));
      const result: WorldIndex[] = [];
      for (const c of CANDIDATES) {
        const q = quotes.get(c.key);
        const price = parseNum(q?.last);
        const changePct = parseNum(q?.change_pct);
        if (price == null || changePct == null) continue;
        result.push({
          symbol: c.key.replace(/^\./, ""),
          name: c.name,
          price,
          changePct,
          region: c.region,
          flag: c.flag,
        });
      }
      if (result.length === 0) throw new Error("cnbc no usable rows");
      recordSuccess("cnbc");
      return result;
    } catch (err) {
      recordFailure("cnbc");
      throw err;
    }
  });
  return value;
}

/** GIFT Nifty best-effort — null when no free feed resolves (cached 1 day). */
export async function getGiftNifty(): Promise<WorldIndex | null> {
  const { value } = await cached("world:gift", 24 * 60 * 60 * 1000, async () => {
    try {
      const quotes = await cnbcBatch(GIFT_CANDIDATES);
      for (const key of GIFT_CANDIDATES) {
        const q = quotes.get(key);
        const price = parseNum(q?.last);
        const changePct = parseNum(q?.change_pct);
        if (price != null && changePct != null) {
          return {
            symbol: "GIFTNIFTY",
            name: "GIFT Nifty",
            price,
            changePct,
            region: "asia" as const,
            flag: "🇮🇳",
          };
        }
      }
      return null; // cached for a day — no pointless retries
    } catch {
      return null;
    }
  });
  return value;
}

/** UI-ready Quote rows for MarketStrip/WorldStrip display. */
export function toQuotes(rows: WorldIndex[]): Quote[] {
  const now = Date.now();
  return rows.map((r) => {
    const change = (r.price * r.changePct) / 100;
    return {
      symbol: r.symbol,
      name: `${r.flag} ${r.name}`,
      price: r.price,
      previousClose: r.price - change,
      change,
      changePct: r.changePct,
      currency: r.region === "europe" ? "EUR" : "USD",
      asOf: now,
      spark: [] as number[],
    };
  });
}
