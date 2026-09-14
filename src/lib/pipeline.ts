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
import { getGiftNifty, getWorldIndices, toQuotes } from "./data/worldIndices";
import { getSensexQuote } from "./data/bse";
import { getNseIntraday } from "./data/nseIntraday";
import { SCENARIO_PRESETS, clampAbs, parseScenario, type Scenario } from "./data/scenario";
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
  Candle,
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
  /** BSE Sensex — from TradingView's scanner (BSE's own API is bot-blocked). */
  sensex: Quote | null;
  /** Today's official NSE 1-minute session for the Overview chart (null off-hours). */
  niftyIntraday: { minutes: number; candles: Candle[] } | null;
  world: Quote[];
  giftNifty: Quote | null;
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
  niftyCandles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  narrative: Narrative;
  session: PrismSession;
  warnings: string[];
}

export async function computePulse(options?: {
  goal?: string;
  scenario?: string | null;
}): Promise<PulseResult> {
  const warnings: string[] = [];
  const scenario: Scenario | null = parseScenario(options?.scenario);

  // ---- 1. Data fetch: ONE parallel batch (all cached, all fail-soft) ----
  const [niftyRes, vixRes, newsRes, flowsRes, anchorsRes, globalRes, indianRes, sectorRes, etfRes, worldRes, giftRes, sensexRes, intradayRes] =
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
      getWorldIndices(),
      getGiftNifty(),
      getSensexQuote(),
      getNseIntraday("NIFTY 50", true),
    ]);

  const sensex = sensexRes.status === "fulfilled" ? sensexRes.value : null;
  if (!sensex) warnings.push("BSE Sensex unavailable right now (TradingView scanner unreachable).");

  // Official NSE minute session — null off-hours so the UI falls back to the
  // 3-day daily view instead of showing an empty Today chart.
  const intradaySession = intradayRes.status === "fulfilled" ? intradayRes.value : null;
  const niftyIntraday =
    intradaySession && intradaySession.minutes.length >= 2
      ? { minutes: intradaySession.minutes.length, candles: intradaySession.candles }
      : null;

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
  let breadth = anchors?.breadth ?? undefined;
  const w52High = anchors?.yearHigh ?? null;
  const w52Low = anchors?.yearLow ?? null;

  // ---- 1b. Scenario explorer (disclosed simulation) -----------------------
  // Reshapes TODAY'S inputs coherently so demos can show the composite react.
  // Every simulated number derives from the real previous close; the banner
  // below always tells the user this is simulated.
  if (scenario) {
    const p = SCENARIO_PRESETS[scenario];
    const simLast = niftyQuote.previousClose * (1 + p.dayPct / 100);
    const simPct = p.dayPct;

    // Nifty closes: keep the REAL previous close, set today to the simulation.
    niftyCloses[niftyCloses.length - 1] = Math.round(simLast * 100) / 100;
    niftyQuote.price = Math.round(simLast * 100) / 100;
    niftyQuote.changePct = simPct;
    niftyQuote.change = Math.round((simLast - niftyQuote.previousClose) * 100) / 100;

    breadth = { advances: p.adv, declines: p.dec, unchanged: Math.max(0, 50 - p.adv - p.dec) };

    // VIX moves opposite the tape (fear cools on a strong day).
    if (vix) {
      const vixChg = Math.round(clampAbs(-simPct * 6, 25) * 100) / 100;
      vix.value = Math.max(9, Math.round(vix.quote.previousClose * (1 + vixChg / 100) * 100) / 100);
      vix.changePct = vixChg;
    }

    warnings.unshift(`🧪 SIMULATION ACTIVE — ${p.label}. Today's Nifty level, breadth and VIX are synthetic (derived from the real previous close); every other source is live.`);
  }

  const indianQuotes = indianRes.status === "fulfilled" ? indianRes.value : [];
  if (indianQuotes.length === 0) warnings.push("Index strip unavailable (NSE table fetch failed).");

  const global = globalRes.status === "fulfilled" ? globalRes.value : { quotes: [] as Quote[], note: undefined as string | undefined };
  if (global.quotes.length === 0) warnings.push("Global FX cues unavailable; global signal excluded.");
  else if (global.note) warnings.push(global.note);

  const sectorQuotes = sectorRes.status === "fulfilled" ? sectorRes.value : [];

  // Scenario (cont.): keep every displayed quote row consistent with the
  // simulated tape (runs after quote declarations; see block above).
  if (scenario) {
    const p2 = SCENARIO_PRESETS[scenario];
    for (const q of indianQuotes) {
      if (q.symbol === "^NSEI") {
        q.price = niftyQuote.price;
        q.changePct = p2.dayPct;
        q.change = niftyQuote.change;
      }
    }
    for (const q of sectorQuotes) {
      const pct = Math.round(clampAbs(p2.dayPct * 1.3, 3) * 100) / 100;
      q.changePct = pct;
      q.change = Math.round(((q.previousClose * pct) / 100) * 100) / 100;
      q.price = Math.round(q.previousClose * (1 + pct / 100) * 100) / 100;
    }
  }

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
    warnings.push(
      failureClass === "llm_quota_exhausted_template_fallback"
        ? "Gemini's free-tier quota is exhausted right now (20 requests/min) — showing the deterministic template explanation; it will upgrade automatically as the quota window resets."
        : failureClass === "llm_call_failed_template_fallback"
          ? "Gemini couldn't answer just now (network/latency) — showing the deterministic template explanation."
          : "AI explanation served from the deterministic template — add GEMINI_API_KEY for LLM narratives.",
    );
  }

  // Anchored Nifty series → Overview chart. Candles are formed from the
  // reconstructed closes (open = prior close, small wick envelope); anchor
  // levels are exact, path shape is the disclosed approximation.
  const DAY = 86400;
  const niftyCandles = niftyCloses.map((close, i) => {
    const open = i === 0 ? close * (1 - (niftyQuote.changePct / 100)) : niftyCloses[i - 1]!;
    const hi = Math.max(open, close) * 1.0022;
    const lo = Math.min(open, close) * 0.9978;
    return {
      time: Math.floor(Date.now() / 1000) - (niftyCloses.length - 1 - i) * DAY,
      open: Math.round(open * 100) / 100,
      high: Math.round(hi * 100) / 100,
      low: Math.round(lo * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: 0,
    };
  });

  // World indices (Dow, S&P, Nasdaq, FTSE, DAX, CAC, Stoxx, Nikkei, HSI, KOSPI)
  // + best-effort GIFT Nifty — best-effort, UI discloses if unavailable.
  const world = worldRes.status === "fulfilled" ? toQuotes(worldRes.value) : [];
  if (world.length === 0) warnings.push("World indices unavailable right now.");
  const giftQuote = giftRes.status === "fulfilled" ? giftRes.value : null;
  const nowMs = Date.now();
  const giftAsQuote = giftQuote
    ? (() => {
        const change = (giftQuote.price * giftQuote.changePct) / 100;
        return {
          symbol: giftQuote.symbol,
          name: `${giftQuote.flag} ${giftQuote.name}`,
          price: giftQuote.price,
          previousClose: giftQuote.price - change,
          change,
          changePct: giftQuote.changePct,
          currency: "USD",
          asOf: nowMs,
          spark: [] as number[],
        };
      })()
    : null;

  return {
    asOf: new Date().toISOString(),
    indices: indianQuotes,
    sensex,
    niftyIntraday,
    world,
    giftNifty: giftAsQuote,
    global: global.quotes,
    sectors: sectorQuotes,
    niftyCandles,
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
