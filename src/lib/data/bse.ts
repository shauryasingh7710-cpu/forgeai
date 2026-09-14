/**
 * BSE data — SENSEX via TradingView's public India scanner (keyless, no
 * Yahoo, no documented limits; one batched POST per TTL, cached 5 min).
 *
 * BSE's own api.bseindia.com is bot-blocked for server-side clients (302 to
 * an error page without interactive cookies), so the exchange's flagship
 * index comes from TradingView's scanner instead — a real exchange feed,
 * same source BSE publishes on its own site.
 *
 * Stock-level BSE quotes (equitycash) already exist via MoneyControl's
 * `bse/equitycash` feed — see moneycontrol.ts for NSE; the BSE variant is
 * used by the stock API as an alternate data path.
 */
import { cached } from "./cache";
import { canUse, recordFailure, recordSuccess } from "./circuitBreaker";
import type { Quote } from "./types";

const SCANNER = "https://scanner.tradingview.com/india/scan";

interface ScanRow {
  s: string;
  d: (number | string)[];
}

async function tvScan(tickers: string[], columns: string[]): Promise<Map<string, ScanRow>> {
  if (!canUse("tradingview")) throw new Error("tradingview circuit open");
  const res = await fetch(SCANNER, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
      "Content-Type": "application/json",
      Origin: "https://www.tradingview.com",
    },
    body: JSON.stringify({
      symbols: { tickers, query: { types: [] } },
      columns,
    }),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) {
    recordFailure("tradingview");
    throw new Error(`tradingview scan ${res.status}`);
  }
  const json = (await res.json()) as { data?: ScanRow[] };
  const out = new Map<string, ScanRow>();
  for (const row of json.data ?? []) out.set(row.s, row);
  recordSuccess("tradingview");
  return out;
}

/** BSE Sensex quote (last, %change, points change) — cached 5 minutes. */
export async function getSensexQuote(): Promise<Quote> {
  const { value } = await cached("bse:sensex", 5 * 60 * 1000, async () => {
    const rows = await tvScan(["BSE:SENSEX"], ["close", "change", "change_abs", "description"]);
    const row = rows.get("BSE:SENSEX");
    const close = typeof row?.d[0] === "number" ? row.d[0] : null;
    const pct = typeof row?.d[1] === "number" ? row.d[1] : null;
    const abs = typeof row?.d[2] === "number" ? row.d[2] : null;
    if (close == null || pct == null) throw new Error("sensex row missing");
    const prev = abs != null ? close - abs : close / (1 + pct / 100);
    return {
      symbol: "^BSESN",
      name: "BSE Sensex",
      price: Math.round(close * 100) / 100,
      previousClose: Math.round(prev * 100) / 100,
      change: abs != null ? Math.round(abs * 100) / 100 : Math.round((close - prev) * 100) / 100,
      changePct: Math.round(pct * 100) / 100,
      currency: "INR",
      asOf: Date.now(),
      spark: [] as number[],
    };
  });
  return value;
}
