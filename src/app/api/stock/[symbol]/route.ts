import { NextResponse } from "next/server";
import { resolveStock } from "@/lib/data/market";
import { mcCandles } from "@/lib/data/moneycontrol";
import { getStockNews } from "@/lib/data/news";
import { trendSignal } from "@/lib/signals/trend";
import { momentumSignal } from "@/lib/signals/momentum";
import { volatilitySignal } from "@/lib/signals/volatility";
import { volumeSignal } from "@/lib/signals/volume";
import { structureSignal } from "@/lib/signals/structure";
import { newsSignal } from "@/lib/signals/newsSentiment";
import { buildPayload, compositeScore, GROUP_ORDER } from "@/lib/signals";
import { buildPrompt, generateNarrative } from "@/lib/llm/narrative";
import { runEvaluators } from "@/lib/prism/evaluators";
import { recordSession } from "@/lib/prism/session";
import type { NewsItem, Signal, SignalPayload } from "@/lib/data/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol: rawSymbol } = await params;
  const query = decodeURIComponent(rawSymbol).trim();
  if (!/^[A-Za-z0-9&.\- ]{1,40}$/.test(query)) {
    return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
  }

  const started = Date.now();
  try {
    // ONE resolve (cached 24h) + ONE pricefeed call (cached 3 min).
    const { snap } = await resolveStock(query);
    const { quote, real, closes, volumes } = snap;

    // Stock news in parallel with nothing else — it's already the second call.
    let news: NewsItem[] = [];
    try {
      news = await getStockNews(quote.name.split(" ").slice(0, 2).join(" "));
    } catch {
      news = [];
    }

    // ---- per-stock signal suite over the anchored series ----
    const subject = quote.name;
    const signals: Signal[] = [
      trendSignal({
        niftyCloses: closes,
        subject,
        realDmas:
          real.dma50 != null && real.dma200 != null
            ? { dma50: real.dma50, dma200: real.dma200 }
            : undefined,
      }),
      momentumSignal({ niftyCloses: closes, breadth: undefined, subject }),
      volatilitySignal({ niftyCloses: closes, subject }),
      volumeSignal({
        niftyCloses: closes,
        stock: {
          name: quote.name,
          closes,
          volumes,
          volDay: real.volDay,
          volAvg20: real.volAvg20,
          volAvg30: real.volAvg30,
          changePct: quote.changePct,
        },
      }),
      structureSignal({
        niftyCloses: closes,
        subject,
        w52High: real.w52High,
        w52Low: real.w52Low,
      }),
      newsSignal(news.map((n) => ({ sentiment: n.sentiment, topics: n.topics }))),
    ];
    signals.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));

    const composite = compositeScore(signals);
    const payload: SignalPayload = buildPayload({
      asOf: new Date(),
      composite,
      signals,
      indices: [
        { symbol: quote.symbol, name: quote.name, price: quote.price, changePct: quote.changePct },
      ],
      vix: null,
      news,
    });

    const prompt = buildPrompt(payload);
    const { narrative, latencyMs, failureClass } = await generateNarrative(payload);
    const evaluators = runEvaluators(payload, narrative);
    const guardrailTriggered = !(evaluators.find((e) => e.name === "advice_safety")?.passed ?? true);
    const session = recordSession({
      goal: `explain_stock:${quote.symbol}`,
      payload,
      prompt,
      narrative,
      evaluators,
      guardrailTriggered,
      llmFailureClass: failureClass,
      model: narrative.model ?? "template-engine",
      latencyMs,
    });

    return NextResponse.json({
      quote,
      real, // the REAL published indicators (DMAs, 52w, volumes, horizon changes)
      anchored: true,
      candles: mcCandles(snap), // anchored series for the chart
      signals,
      composite,
      news,
      narrative,
      session,
      fetchedInMs: Date.now() - started,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : `failed to analyze ${query}`;
    const friendly = /circuit open|pricefeed|no data|no stock matched|suggest/i.test(msg)
      ? `Could not fetch live data for "${query}" right now (the stock-data source is unavailable or the name didn't match). Try another spelling, or retry in a minute.`
      : msg;
    return NextResponse.json({ error: friendly }, { status: 503 });
  }
}
