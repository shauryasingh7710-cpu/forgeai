/**
 * FII/DII cash-market activity — best-effort fetch from NSE's public endpoint.
 *
 * NSE aggressively blocks non-browser clients; this fetcher uses browser-like
 * headers and degrades gracefully: `available: false` with a note, never an
 * unhandled failure.
 */
import { cached } from "./cache";
import type { FiiDiiData } from "./types";

interface NseFiiDiiItem {
  date?: string;
  category?: string;
  netInvestment?: string;
}

interface NseFiiDiiResponse {
  data?: NseFiiDiiItem[];
}

function parseCr(val: string | undefined): number | null {
  if (!val) return null;
  const n = Number(String(val).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export async function getFiiDii(): Promise<FiiDiiData> {
  const { value } = await cached("fiidii", 15 * 60 * 1000, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(
        "https://www.nseindia.com/api/fiidiiTradeReact",
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            Accept: "application/json",
            "Accept-Language": "en-IN,en;q=0.9",
            Referer: "https://www.nseindia.com/reports/fii-dii",
          },
          signal: controller.signal,
          cache: "no-store",
        },
      );
      if (!res.ok) throw new Error(`nse responded ${res.status}`);
      const json = (await res.json()) as NseFiiDiiResponse;
      const rows = json.data ?? [];

      const fiiRow = rows.find((r) =>
        (r.category ?? "").toLowerCase().includes("fii"),
      );
      const diiRow = rows.find((r) =>
        (r.category ?? "").toLowerCase().includes("dii"),
      );
      if (!fiiRow && !diiRow) throw new Error("nse payload missing categories");

      return {
        date: fiiRow?.date ?? diiRow?.date ?? "",
        fiiNetCr: parseCr(fiiRow?.netInvestment),
        diiNetCr: parseCr(diiRow?.netInvestment),
        available: true,
        note: "Cash-market net investment (₹ crore), latest trading day.",
      } satisfies FiiDiiData;
    } catch {
      // Graceful skip — the app works without it.
      return {
        date: "",
        fiiNetCr: null,
        diiNetCr: null,
        available: false,
        note: "FII/DII flow data unavailable right now (NSE blocks non-browser clients). Signal excluded from scoring today.",
      } satisfies FiiDiiData;
    } finally {
      clearTimeout(timer);
    }
  });
  return value;
}
