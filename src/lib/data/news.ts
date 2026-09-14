/**
 * Google News RSS fetcher (India edition, English) — free, keyless.
 * Headlines are tagged with keyword sentiment + topics at fetch time so the
 * payload PRISM sees is stable.
 */
import { XMLParser } from "fast-xml-parser";
import { cached } from "./cache";
import { analyzeHeadline } from "@/lib/signals/lexicon";
import type { NewsItem } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function parseRss(xml: string): NewsItem[] {
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item;
  if (!Array.isArray(items)) return [];

  return items.slice(0, 40).map((it: Record<string, unknown>) => {
    const title = String(it.title ?? "").trim();
    const link = String(it.link ?? "");
    const source =
      typeof it.source === "object" && it.source !== null
        ? String((it.source as Record<string, unknown>)["#text"] ?? "")
        : String(it.source ?? "");
    const pub = it.pubDate ? new Date(String(it.pubDate)).getTime() : Date.now();

    const analysis = analyzeHeadline(title);
    return {
      title,
      link,
      source,
      publishedAt: Number.isFinite(pub) ? pub : Date.now(),
      sentiment: analysis.sentiment,
      topics: analysis.topics,
    } satisfies NewsItem;
  });
}

async function fetchFeed(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketPulse/1.0)" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`news feed failed: ${res.status}`);
    return parseRss(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

/** Market-wide headlines (deduped across two queries). */
export async function getMarketNews(): Promise<NewsItem[]> {
  const { value } = await cached("news:market", 10 * 60 * 1000, async () => {
    const [a, b] = await Promise.allSettled([
      fetchFeed("Nifty Sensex stock market"),
      fetchFeed("Indian stock market news"),
    ]);
    const all = [
      ...(a.status === "fulfilled" ? a.value : []),
      ...(b.status === "fulfilled" ? b.value : []),
    ];
    const seen = new Set<string>();
    const deduped = all.filter((n) => {
      const k = n.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (deduped.length === 0) throw new Error("no market news available");
    return deduped.slice(0, 30);
  });
  return value;
}

/** Stock-specific headlines. */
export async function getStockNews(companyName: string): Promise<NewsItem[]> {
  const key = `news:stock:${companyName.toLowerCase()}`;
  const { value } = await cached(key, 10 * 60 * 1000, async () => {
    const items = await fetchFeed(`${companyName} stock NSE`);
    if (items.length === 0) throw new Error(`no news for ${companyName}`);
    return items.slice(0, 15);
  });
  return value;
}
