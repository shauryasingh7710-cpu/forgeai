"use client";

import { useMemo, useState } from "react";
import type { PulseResult } from "@/lib/pipeline";
import Gauge from "./Gauge";
import SignalCard from "./SignalCard";
import MarketStrip from "./MarketStrip";
import StockFocus from "./StockFocus";
import NewsFeed from "./NewsFeed";
import ExplainPanel from "./ExplainPanel";
import Glossary from "./Glossary";
import Disclaimer from "./Disclaimer";

interface Props {
  pulse: PulseResult;
}

export default function Dashboard({ pulse }: Props) {
  const drivers = useMemo(
    () => pulse.composite.drivers.slice(0, 3),
    [pulse.composite.drivers],
  );
  const [beginnerMode, setBeginnerMode] = useState(true);
  const [showGlossary, setShowGlossary] = useState(false);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-6">
      <Disclaimer />
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Market<span className="text-cyan-400">Pulse</span>
          </h1>
          <p className="text-xs text-slate-400">
            AI decision support for Indian markets · {new Date(pulse.asOf).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBeginnerMode((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              beginnerMode
                ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
            }`}
          >
            {beginnerMode ? "🌱 Beginner mode" : "🔬 Advanced mode"}
          </button>
          <button
            onClick={() => setShowGlossary(true)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500"
          >
            📖 Glossary
          </button>
        </div>
      </header>

      {pulse.warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-200">
          {pulse.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}

      {/* Stock focus — the hero interaction, right at the top */}
      <section className="mt-5">
        <StockFocus />
      </section>

      {/* top row: gauge + strips */}
      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <Gauge
          score={pulse.composite.score}
          zone={pulse.composite.zone}
          drivers={drivers}
          vix={pulse.vix ? { value: pulse.vix.value, changePct: pulse.vix.changePct } : null}
        />
        <div className="lg:col-span-2 space-y-4">
          <MarketStrip title="Indian indices" quotes={pulse.indices} />
          <MarketStrip title="Global FX cues" quotes={pulse.global} />
          {pulse.sectors.length > 0 && (
            <MarketStrip title="Sectors today" quotes={pulse.sectors} compact />
          )}
        </div>
      </section>

      {/* signal cards */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Signal groups — every contribution visible
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {pulse.signals.map((s) => (
            <SignalCard key={s.group} signal={s} beginner={beginnerMode} />
          ))}
        </div>
      </section>

      {/* market pulse + explanation side-by-side */}
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <ExplainPanel narrative={pulse.narrative} session={pulse.session} />
        <NewsFeed news={pulse.news} />
      </section>

      {showGlossary && <Glossary onClose={() => setShowGlossary(false)} />}
    </main>
  );
}
