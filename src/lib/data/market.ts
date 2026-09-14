/**
 * Unified market-data facade — replaces the old Yahoo client entirely.
 *
 * Indian data: NSE official table (indices, VIX, sectors, breadth, anchors).
 * Stock data:  MoneyControl pricefeed (real DMAs, 52w, volumes) + autosuggest.
 * Global data: ECB/Frankfurter FX (USD/INR, DXY proxy).
 *
 * Everything fails soft: each block degrades independently and reports a
 * plain-English warning the UI can disclose.
 */
import {
  buildAnchoredHistory,
  getNiftyAnchors,
  getNseAllIndices,
  getNseIndexQuotes,
  NSE_INDEX_SYMBOL_MAP,
  type NseIndexRow,
} from "./nse";
import { getGlobalCues } from "./globalCues";
import {
  getMcSnapshot,
  mcWatchlistMap,
  resolveMcCode,
  type McSnapshot,
} from "./moneycontrol";
import type { Candle, Quote } from "./types";

export interface SeriesData {
  quote: Quote;
  candles: Candle[];
  /** true when history is a deterministic anchored reconstruction */
  anchored?: boolean;
}

// ------------------------------------------------------------- indices ----

const INDEX_SYMBOLS = Object.values(NSE_INDEX_SYMBOL_MAP);
export const INDIAN_INDICES = INDEX_SYMBOLS.filter((s) =>
  ["^NSEI", "^NSEBANK", "^NSMIDCP"].includes(s),
);
export const INDIA_VIX = "^INDIAVIX";
export const SECTOR_INDICES = INDEX_SYMBOLS.filter((s) =>
  ["^CNXIT", "^CNXAUTO", "^CNXPHARMA", "^CNXFMCG", "^CNXMETAL", "^CNXENERGY"].includes(s),
);

/** All mapped index quotes in one NSE table call. */
export async function getIndexQuotes(symbols: string[]): Promise<Quote[]> {
  return getNseIndexQuotes(symbols);
}

/**
 * Full Nifty 50 series for signal computation: real table snapshot +
 * deterministic history anchored to the published 30-day change and the
 * real 52-week band.
 */
export async function getNiftySeries(): Promise<{ closes: number[]; anchored: boolean; quote: Quote }> {
  const rows = await getNseAllIndices();
  const row = rows.find((r) => r.index === "NIFTY 50");
  if (!row) throw new Error("NIFTY 50 row missing from NSE table");
  const anchors = await getNiftyAnchors();
  const closes = buildAnchoredHistory({
    price: row.last,
    previousClose: row.previousClose,
    yearHigh: row.yearHigh,
    yearLow: row.yearLow,
    chg30dPct: anchors?.chg30d ?? null,
    chg1wPct: anchors?.chg1w ?? null,
    seed: daySeed("NIFTY50"),
  });
  return {
    closes,
    anchored: true,
    quote: {
      symbol: "^NSEI",
      name: "Nifty 50",
      price: row.last,
      previousClose: row.previousClose,
      change: row.variation,
      changePct: row.percentChange,
      currency: "INR",
      asOf: Date.now(),
      spark: closes.slice(-30),
    },
  };
}

/** India VIX quote (same single table call under the cache). */
export async function getVixQuote(): Promise<Quote | null> {
  const quotes = await getNseIndexQuotes(["^INDIAVIX"]);
  return quotes[0] ?? null;
}

// --------------------------------------------------------------- stocks ----

export { mcWatchlistMap, resolveMcCode };
export type { McSnapshot };

function daySeed(key: string): number {
  const day = Math.floor(Date.now() / 86400000);
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h + day) % 997;
}

/** Stock snapshot for a known watchlist entry (1 pricefeed call, cached). */
export async function getStockSnapshot(symbol: string): Promise<{ snap: McSnapshot; anchored: boolean }> {
  const entry = mcWatchlistMap().get(symbol.toUpperCase());
  if (!entry) throw new Error(`symbol not in curated watchlist: ${symbol}`);
  const snap = await getMcSnapshot(entry.mcCode, entry.symbol, entry.name);
  return { snap, anchored: true };
}

/**
 * Resolve any free-text name/symbol to a snapshot (autosuggest + pricefeed).
 * Throws with a helpful message when nothing sensible is found.
 */
export async function resolveStock(query: string): Promise<{ snap: McSnapshot; anchored: boolean }> {
  const direct = mcWatchlistMap().get(query.trim().toUpperCase());
  const match = direct
    ? { mcCode: direct.mcCode, nseSymbol: direct.symbol, name: direct.name }
    : await resolveMcCode(query);
  if (!match) throw new Error(`no stock matched "${query}"`);
  const snap = await getMcSnapshot(match.mcCode, match.nseSymbol || undefined, match.name);
  return { snap, anchored: true };
}

// --------------------------------------------------------------- global ----

export async function getGlobalQuotes(): Promise<{ quotes: Quote[]; note?: string }> {
  const cues = await getGlobalCues();
  if (!cues) return { quotes: [], note: "FX/global cues source unavailable right now." };
  return { quotes: cues.quotes, note: cues.notes[0] };
}

// -------------------------------------------------------------- exports ----

export type { NseIndexRow };
export { NSE_INDEX_SYMBOL_MAP };
