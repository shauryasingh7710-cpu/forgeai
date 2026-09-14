# MarketPulse 🇮🇳

**AI-powered market-sentiment decision support for Indian markets (NSE/BSE) with global context — instrumented with PRISM observability.**

> ⚠️ **Educational tool — not investment advice.** MarketPulse explains publicly available
> market signals for learning. It does not recommend stocks, predict returns, or replace a
> SEBI-registered adviser.

---

## What it does

One dashboard that turns scattered market signals into a clear, explained
**Bearish → Bullish** view:

- **8 signal groups, 20+ indicators** — 50/200-DMA trend & golden/death cross, MACD(12/26/9),
  RSI(14), India VIX, realized volatility, Bollinger position, market breadth, volume profile,
  52-week structure, global cues (S&P 500, Nasdaq, Dow, FTSE, Nikkei, Hang Seng, DXY, crude,
  gold, US 10Y), auditable news sentiment, and best-effort FII/DII flows
- **Transparent composite score (−100…+100)** in five zones — every contribution visible,
  nothing a black box
- **Grounded AI explanations** — the LLM sees *only* the computed signal payload and may never
  invent data; a deterministic template serves as a full fallback when no key is configured
- **Financial-literacy layer** — "What is this?" explainers on every indicator, glossary,
  beginner mode
- **Invisible reliability layer** — every AI run is traced, evaluated (groundedness,
  consistency, advice-safety, completeness), classified on failure, and streamable to PRISM

## PRISM integration (BlockConvey)

Every AI explanation run becomes **one session record** containing: user goal, the exact
signal payload, the prompt, the output, the composite score, all evaluator results, guardrail
events, failure class, model, and latency.

**Automated evaluators (run on 100% of AI outputs):**

| Evaluator | What it checks |
|---|---|
| `groundedness` | Every number in the narrative traces to the signal payload |
| `consistency` | Narrative sentiment language matches the computed zone |
| `advice_safety` | Zero buy/sell/target/stop-loss language (educational posture) |
| `completeness` | Cites ≥2 of the top-3 weighted driver groups + watch list |

**Failure handling:** sessions are classified (`evaluator:consistency`,
`guardrail:advice_language`, `llm_call_failed_template_fallback`,
`low_confidence:groundedness`, …) and buffered locally in a ring buffer (200 runs). The
panel is intentionally not rendered in the UI — instrumentation stays server-side and
invisible — but the evaluator chips on each AI explanation still prove the checks ran.

**Forwarding to PRISM cloud (official trace API):** set `PRISMTRACE_HOST`,
`PRISMTRACE_PROJECT_ID` and `PRISMTRACE_API_KEY` (see `.env.example`; sign up at
[prism.blockconvey.com/signup](https://prism.blockconvey.com/signup), key scope `ingest`).
Every AI run is POSTed to `/api/traces` fire-and-forget with our evaluator verdicts in
filterable `metadata`; PRISM layers its automatic scoring, financial-industry checks,
guardrails, alerts and root-cause clustering on top. Free plan: 25,000 traces/month. Until
keys are set, records buffer locally with identical schema.

See **[docs/prism-demo.md](docs/prism-demo.md)** for the judge-facing walkthrough:
run → trace → evaluator → failure → human-gated fix → validated improvement.

## Data sources (free, keyless — no Yahoo)

- **NSE India (official)** — one cached `allIndices` call: Nifty 50, Bank Nifty, Next 50,
  India VIX, sector indices, **official advances/declines** (real market breadth), 52-week
  bands and published 1w/30d/1y anchors. History for indicators is a deterministic
  reconstruction anchored to those exact published levels — disclosed in the UI.
- **MoneyControl price API** — Stock Focus: last price, previous close, **real 50/150/200-day
  averages**, 52-week high/low, day + 20/30-day average volumes, 1w/1m/3m/1y performance,
  and name→code autosuggest resolution for **any NSE stock**.
- **Frankfurter (ECB reference rates)** — USD/INR and a true-formula DXY proxy (official
  currency weights) with real day-over-day changes.
- **Google News RSS** (India edition) — market-wide and per-stock headlines.
- **NSE** public FII/DII endpoint — best-effort; gracefully skipped when NSE blocks
  non-browser clients (the signal is excluded and weights renormalize — the app never breaks).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Optional — real LLM narratives **and the chat assistant** (otherwise the deterministic
grounded template is used for both):

```bash
cp .env.example .env.local   # add GEMINI_API_KEY (free tier at aistudio.google.com)
```

## Chat assistant

The floating 💬 button (bottom-right) opens **Ask MarketPulse** — a chat that answers
questions about today's computed signals under the same rules as the daily explanation:

- **Grounded**: the model sees only the `SignalPayload`; every reply is checked by the
  groundedness + advice-safety evaluators (badges shown on each reply)
- **Advice-refusing**: "should I buy X?" gets an educational refusal with the real data
- **Zero-key mode**: works instantly on a deterministic template; add `GEMINI_API_KEY`
  and the same questions upgrade to Gemini answers — no code changes
- Every chat turn is traced to PRISM with the same schema as narrative runs

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (typechecked) |
| `npm test` | 64 vitest unit tests (indicators, signals, scorer, PRISM evaluators) |
| `npm run typecheck` | `tsc --noEmit` |

## API

| Route | Purpose |
|---|---|
| `GET /api/pulse` | Full market payload: indices, global FX cues, sectors, all signals, composite, news, flows, AI narrative |
| `GET /api/stock/[symbol]` | Per-stock scorecard for **any NSE stock** (MoneyControl-resolved) + real indicator levels + stock news + grounded narrative |

## Architecture

```
src/lib/data/       nse.ts (primary), moneycontrol.ts, globalCues.ts, news.ts, fiiDii.ts,
                    market.ts (facade), cache.ts (TTL + stale-on-error), circuitBreaker.ts
src/lib/indicators/ sma, rsi (Wilder), macd, bollinger, volatility, volumeProfile, structure
src/lib/signals/    8 adapters (trend, momentum, volatility, volume, structure, global,
                    news, flows) + weighted composite scorer + auditable lexicon
src/lib/llm/        grounded narrative (Gemini, Zod-validated, template fallback)
src/lib/prism/      evaluators.ts (4 checks) + session.ts (records, classification, PRISM forwarding)
src/lib/education/  explainers.ts (beginner copy) + glossary
src/app/            page.tsx (dashboard) + /api/pulse + /api/stock/[symbol]
src/components/     Gauge, SignalCard, MarketStrip, StockFocus, NewsFeed, ExplainPanel,
                    Glossary, Disclaimer, Sparkline
```

**Resilience design:** every provider sits behind a circuit breaker, TTL cache (5 min NSE /
3 min MC quotes / 1 h FX / 10 min news) with stale-on-error fallback, and renormalizing
weights — any single source going down degrades one card, never the app. Stock Focus does at
most 2 network calls per lookup (cached name-resolve + one pricefeed snapshot).

## Disclaimer

Markets involve risk. Indicator behavior does not guarantee future outcomes. The composite
score and AI explanations are educational interpretations of public data. Consult a
SEBI-registered investment adviser before making financial decisions.
