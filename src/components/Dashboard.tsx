"use client";

import { useEffect, useMemo, useState } from "react";
import type { PulseResult } from "@/lib/pipeline";
import Gauge from "./Gauge";
import SignalCard from "./SignalCard";
import MarketStrip from "./MarketStrip";
import WorldStrip from "./WorldStrip";
import StockFocus from "./StockFocus";
import PriceChart from "./PriceChart";
import NewsFeed from "./NewsFeed";
import AiBrief from "./AiBrief";
import Glossary from "./Glossary";
import Disclaimer from "./Disclaimer";
import ChatBox from "./ChatBox";
import Taskbar, { type Tab } from "./Taskbar";

interface Props {
  pulse: PulseResult;
}

type ScenarioChip = "live" | "bullish" | "bearish" | "neutral";

export default function Dashboard({ pulse }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [beginnerMode, setBeginnerMode] = useState(true);
  const [showGlossary, setShowGlossary] = useState(false);
  const [scenario, setScenario] = useState<ScenarioChip>("live");
  const [scenarioPulse, setScenarioPulse] = useState<PulseResult | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);

  // Scenario switching: fetch a simulated pulse server-side (the server
  // discloses the simulation in warnings — the client never fakes numbers).
  useEffect(() => {
    if (scenario === "live") {
      setScenarioPulse(null);
      return;
    }
    let alive = true;
    setScenarioLoading(true);
    fetch(`/api/pulse?scenario=${scenario}`)
      .then((r) => r.json())
      .then((j: PulseResult) => {
        if (alive) setScenarioPulse(j);
      })
      .catch(() => {
        if (alive) setScenarioPulse(null);
      })
      .finally(() => {
        if (alive) setScenarioLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [scenario]);

  const view = scenarioPulse ?? pulse;

  const drivers = useMemo(
    () => view.composite.drivers.slice(0, 3),
    [view.composite.drivers],
  );

  const zoneAccent =
    view.composite.score >= 10
      ? "text-emerald-400"
      : view.composite.score >= -10
        ? "text-amber-300"
        : "text-rose-400";

  return (
    <div className="min-h-screen">
      <Taskbar
        active={tab}
        onChange={setTab}
        beginnerMode={beginnerMode}
        onToggleBeginner={() => setBeginnerMode((v) => !v)}
        onOpenGlossary={() => setShowGlossary(true)}
        asOf={view.asOf}
        scenario={scenario}
        onScenario={setScenario}
      />

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-5">
        <Disclaimer />

        {pulse.warnings.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-xs text-amber-200/90">
            {pulse.warnings.map((w, i) => (
              <div key={i}>⚠ {w}</div>
            ))}
          </div>
        )}

        {scenario !== "live" && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-lg border p-3 text-xs font-medium ${
              scenario === "bullish"
                ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-200"
                : scenario === "bearish"
                  ? "border-rose-700/60 bg-rose-950/30 text-rose-200"
                  : "border-amber-700/60 bg-amber-950/30 text-amber-200"
            }`}
          >
            🧪 Scenario mode: showing a <b>{scenario}</b> simulated day so you can see how the
            composite reacts. Real published levels anchor every number; today's move, breadth
            and VIX are synthetic. {scenarioLoading ? "(loading…)" : ""}
            <button
              onClick={() => setScenario("live")}
              className="ml-auto rounded border border-current px-2 py-0.5 text-[11px] hover:bg-white/5"
            >
              back to live
            </button>
          </div>
        )}

        {/* ── OVERVIEW ─────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* hero row: gauge + live strips side by side */}
            <section className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <Gauge
                  score={view.composite.score}
                  zone={view.composite.zone}
                  drivers={drivers}
                  vix={view.vix ? { value: view.vix.value, changePct: view.vix.changePct } : null}
                />
              </div>
              <div className="space-y-4 lg:col-span-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="mb-1 flex items-baseline justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Nifty 50 · trend map
                    </h3>
                    <span className={`font-mono text-[11px] ${zoneAccent}`}>
                      {view.indices[0]?.price.toLocaleString("en-IN")} ({view.indices[0]?.changePct >= 0 ? "+" : ""}
                      {view.indices[0]?.changePct.toFixed(2)}%)
                    </span>
                  </div>
                  <PriceChart
                    data={view.niftyCandles}
                    intraday={view.niftyIntraday?.candles ?? null}
                    prevClose={view.indices[0]?.previousClose ?? null}
                    height={210}
                    defaultStyle="line"
                  />
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
                    {view.niftyIntraday
                      ? "Today's session from NSE's official 1-minute feed — live during market hours (09:15–15:30 IST)."
                      : "3-day view while markets are closed — Today's minute session appears when NSE opens. Daily closes are exact at published levels."}
                  </p>
                </div>
                {view.sectors.length > 0 && (
                  <MarketStrip title="Sectors today" quotes={view.sectors} compact />
                )}
                <button
                  onClick={() => setTab("indices")}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-left text-xs text-slate-400 transition hover:border-cyan-800/60 hover:text-cyan-300"
                >
                  🌍 Dow · S&P · Nasdaq · FTSE · DAX · CAC · Stoxx · Nikkei · Hang Seng · KOSPI
                  <span className="ml-2 text-cyan-500">→ open world markets</span>
                </button>
              </div>
            </section>

            {/* signal cards */}
            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Signal groups — every contribution visible
                </h2>
                <span className={`font-mono text-xs ${zoneAccent}`}>
                  composite {view.composite.score > 0 ? "+" : ""}
                  {view.composite.score} · {view.composite.zone}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {view.signals.map((s) => (
                  <SignalCard key={s.group} signal={s} beginner={beginnerMode} />
                ))}
              </div>
            </section>

            {/* quick links into the other tabs */}
            <section className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  { id: "stocks" as Tab, icon: "⌕", title: "Stock scorecards", desc: "Real DMAs, 52-week band, volumes for any NSE stock" },
                  { id: "ai" as Tab, icon: "✧", title: "AI Briefing", desc: "Why the score is what it is, driver by driver" },
                  { id: "news" as Tab, icon: "✦", title: "Market news", desc: "30 headlines, sentiment-tagged by an auditable lexicon" },
                ]
              ).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setTab(c.id)}
                  className="group rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-left transition hover:border-cyan-800/60 hover:bg-slate-900/70"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <span className="text-cyan-400">{c.icon}</span>
                    {c.title}
                    <span className="ml-auto text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyan-500">
                      →
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{c.desc}</p>
                </button>
              ))}
            </section>
          </div>
        )}

        {/* ── STOCKS ───────────────────────────────────────────────── */}
        {tab === "stocks" && (
          <section>
            <StockFocus />
          </section>
        )}

        {/* ── INDICES ──────────────────────────────────────────────── */}
        {tab === "indices" && (
          <div className="space-y-6">
            <WorldStrip world={view.world} gift={view.giftNifty} fx={view.global} />
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
                India — headline indices
              </h2>
              <MarketStrip title="" quotes={view.sensex ? [view.sensex, ...view.indices] : view.indices} />
            </div>
            {view.sectors.length > 0 && (
              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
                  India — sectors
                </h2>
                <MarketStrip title="" quotes={view.sectors} />
              </div>
            )}
          </div>
        )}

        {/* ── NEWS ─────────────────────────────────────────────────── */}
        {tab === "news" && (
          <section className="mx-auto max-w-3xl">
            <NewsFeed news={view.news} />
          </section>
        )}

        {/* ── AI BRIEF ─────────────────────────────────────────────── */}
        {tab === "ai" && (
          <section className="mx-auto max-w-3xl">
            <AiBrief narrative={view.narrative} session={view.session} />
          </section>
        )}

        {showGlossary && <Glossary onClose={() => setShowGlossary(false)} />}
      </main>

      <ChatBox />
    </div>
  );
}
