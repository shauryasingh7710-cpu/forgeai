/**
 * Pipeline orchestrator: fetches all data, computes every signal, builds the
 * payload, generates the grounded narrative, runs evaluators, records the
 * session. Every step fails soft — the app degrades, never breaks.
 *
 * Data sources (all free, keyless, no Yahoo):
 *   • NSE official table — indices, VIX, sectors, advances/declines breadth,
 *     30d/1w/1y/52-week anchors (ONE call, cached 5 min)
 *   • MoneyControl pricefeed — Stock Focus snapshots (real DMAs, volumes)
 *   • Frankfurter (ECB) — USD/INR + DXY proxy
 *   • Google News RSS + auditable lexicon; best-effort FII/DII
 */
import {
  getIndexQuotes,
  getNiftySeries,
  getVixQuote,
  getGlobalQuotes,
  getStockSnapshot,
  INDIAN_INDICES,
  SECTOR_INDICES,
} from "./data/market";
import { getNiftyAnchors } from "./data/nse";
import { getMarketNews } from "./data/news";
import { getFiiDii } from "./data/fiiDii";
import { buildPayload, compositeScore, GROUP_ORDER } from "./signals";
import { trendSignal } from "./signals/trend";
import { momentumSignal } from "./signals/momentum";
import { volatilitySignal } from "./signals/volatility";
import { volumeSignal } from "./signals/volume";
import { structureSignal } from "./signals/structure";
import { globalSignal } from "./signals/global";
import { newsSignal } from "./signals/newsSentiment";
import { flowsSignal } from "./signals/flows";
import { buildPrompt, generateNarrative } from "./llm/narrative";
import { runEvaluators } from "./prism/evaluators";
import { recordSession } from "./prism/session";
import type {
  FiiDiiData,
  Narrative,
  NewsItem,
  PrismSession,
  Quote,
  Signal,
  SignalPayload,
  Zone,
} from "./data/types";

export interface PulseResult {
  asOf: string;
  indices: Quote[];
  global: Quote[];
  sectors: Quote[];
  vix: { value: number; changePct: number; quote: Quote } | null;
  signals: Signal[];
  composite: {
    score: number;
    zone: Zone;
    drivers: { group: string; label: string; contribution: number }[];
  };
  news: NewsItem[];
  flows: FiiDiiData;
  narrative: Narrative;
  session: PrismSession;
  warnings: string[];
}

export async function computePulse(options?: { goal?: string }): Promise<PulseResult> {
  const warnings: string[] = [];

  // ---- 1. Data fetch: ONE parallel batch (all cached, all fail-soft) ----
  const [niftyRes, vixRes, newsRes, flowsRes, anchorsRes, globalRes, indianRes, sectorRes, etfRes] =
    await Promise.allSettled([
      getNiftySeries(),
      getVixQuote(),
      getMarketNews(),
      getFiiDii(),
      getNiftyAnchors(),
      getGlobalQuotes(),
      getIndexQuotes(INDIAN_INDICES),
      getIndexQuotes(SECTOR_INDICES),
      getStockSnapshot("NIFTYBEES"),
    ]);

  if (niftyRes.status === "rejected") {
    throw new Error(
      `NSE index table unavailable (${String(niftyRes.reason).slice(0, 80)}) — cannot compute market pulse`,
    );
  }
  const { closes: niftyCloses, anchored, quote: niftyQuote } = niftyRes.value;
  if (anchored) {
    warnings.push(
      "NSE's chart API is closed to keyless clients, so indicator history is a deterministic reconstruction anchored to NSE's published levels — today's close, previous close, the 1-week/30-day changes and the 52-week band are exact; indicator values on the path are approximations.",
    );
  }

  const vixQuote = vixRes.status === "fulfilled" ? vixRes.value : null;
  const vix = vixQuote ? { value: vixQuote.price, changePct: vixQuote.changePct, quote: vixQuote } : null;
  if (!vix) warnings.push("India VIX unavailable right now; volatility uses realized volatility only.");

  const anchors = anchorsRes.status === "fulfilled" ? anchorsRes.value : null;
  const breadth = anchors?.breadth ?? undefined;
  const w52High = anchors?.yearHigh ?? null;
  const w52Low = anchors?.yearLow ?? null;

  const indianQuotes = indianRes.status === "fulfilled" ? indianRes.value : [];
  if (indianQuotes.length === 0) warnings.push("Index strip unavailable (NSE table fetch failed).");

  const global = globalRes.status === "fulfilled" ? globalRes.value : { quotes: [] as Quote[], note: undefined as string | undefined };
  if (global.quotes.length === 0) warnings.push("Global FX cues unavailable; global signal excluded.");
  else if (global.note) warnings.push(global.note);

  const sectorQuotes = sectorRes.status === "fulfilled" ? sectorRes.value : [];

  const news = newsRes.status === "fulfilled" ? newsRes.value : [];
  if (news.length === 0) warnings.push("News feed unavailable; news signal excluded.");

  const flows: FiiDiiData =
    flowsRes.status === "fulfilled"
      ? flowsRes.value
      : {
          date: "",
          fiiNetCr: null,
          diiNetCr: null,
          available: false,
          note: "FII/DII fetch failed; signal excluded from scoring today.",
        };

  // Nifty 50 ETF snapshot → real market volume signal + real DMA scaling
  // (the ETF tracks the index; its published DMAs scale to index level by the
  // real price ratio, making the trend card's levels REAL rather than derived).
  const etfSnap = etfRes.status === "fulfilled" ? etfRes.value.snap : null;
  let realDmas: { dma50: number; dma200: number } | undefined;
  if (etfSnap && etfSnap.real.dma50 && etfSnap.real.dma200 && etfSnap.quote.price > 0) {
    const scale = niftyQuote.price / etfSnap.quote.price;
    if (scale > 50 && scale < 150) {
      realDmas = {
        dma50: etfSnap.real.dma50 * scale,
        dma200: etfSnap.real.dma200 * scale,
      };
    }
  }

  // ---- 2. Signals --------------------------------------------------------
  const signals: Signal[] = [
    trendSignal({ niftyCloses, w52High, w52Low, realDmas }),
    momentumSignal({ niftyCloses, breadth }),  // market view: subject stays Nifty
    volatilitySignal({
      niftyCloses,
      vix: vix ? { value: vix.value, changePct: vix.changePct } : undefined,
    }),
    volumeSignal(
      etfSnap
        ? {
            niftyCloses,
            stock: {
              name: "Nifty 50 (ETF)",
              closes: etfSnap.closes,
              volumes: etfSnap.volumes,
              volDay: etfSnap.real.volDay,
              volAvg20: etfSnap.real.volAvg20,
              volAvg30: etfSnap.real.volAvg30,
              changePct: etfSnap.quote.changePct,
            },
          }
        : { niftyCloses },
    ),
    structureSignal({ niftyCloses, w52High, w52Low }),
    globalSignal(global.quotes.map((q) => ({ name: q.name, changePct: q.changePct, price: q.price }))),
    newsSignal(news.map((n) => ({ sentiment: n.sentiment, topics: n.topics }))),
    flowsSignal(flows),
  ];
  signals.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));

  // ---- 3. Composite + payload -------------------------------------------
  const composite = compositeScore(signals);
  const payload: SignalPayload = buildPayload({
    asOf: new Date(),
    composite,
    signals,
    indices: [niftyQuote, ...indianQuotes]
      .filter((q, i, arr) => arr.findIndex((x) => x.symbol === q.symbol) === i)
      .map((q) => ({ symbol: q.symbol, name: q.name, price: q.price, changePct: q.changePct })),
    vix: vix ? { value: vix.value, changePct: vix.changePct } : null,
    news,
  });

  // ---- 4. AI narrative + instrumentation (invisible to the UI) -----------
  const prompt = buildPrompt(payload);
  const { narrative, latencyMs, failureClass } = await generateNarrative(payload);
  const evaluators = runEvaluators(payload, narrative);
  const guardrailTriggered = !(evaluators.find((e) => e.name === "advice_safety")?.passed ?? true);
  const session = recordSession({
    goal: options?.goal ?? "explain_today_market",
    payload,
    prompt,
    narrative,
    evaluators,
    guardrailTriggered,
    llmFailureClass: failureClass,
    model: narrative.model ?? "template-engine",
    latencyMs,
  });

  if (narrative.source !== "llm") {
    warnings.push("AI explanation served from the deterministic template — add GEMINI_API_KEY for LLM narratives.");
  }

  return {
    asOf: new Date().toISOString(),
    indices: indianQuotes,
    global: global.quotes,
    sectors: sectorQuotes,
    vix,
    signals,
    composite,
    news,
    flows,
    narrative,
    session,
    warnings,
  };
}
