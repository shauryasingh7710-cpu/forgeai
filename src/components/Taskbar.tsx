"use client";

export type Tab = "overview" | "stocks" | "indices" | "news" | "ai";

const TABS: { id: Tab; label: string; icon: string; hint: string }[] = [
  { id: "overview", label: "Overview", icon: "◎", hint: "Market pulse gauge + signal groups" },
  { id: "stocks", label: "Stocks", icon: "⌕", hint: "Search any NSE stock" },
  { id: "indices", label: "Indices", icon: "≡", hint: "India + world markets" },
  { id: "news", label: "News", icon: "✦", hint: "Sentiment-tagged headlines" },
  { id: "ai", label: "AI Brief", icon: "✧", hint: "Grounded AI explanation" },
];

type ScenarioChip = "live" | "bullish" | "bearish" | "neutral";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  beginnerMode: boolean;
  onToggleBeginner: () => void;
  onOpenGlossary: () => void;
  asOf: string;
  scenario: ScenarioChip;
  onScenario: (s: ScenarioChip) => void;
}

export default function Taskbar({
  active,
  onChange,
  beginnerMode,
  onToggleBeginner,
  onOpenGlossary,
  asOf,
  scenario,
  onScenario,
}: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        {/* brand */}
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight">
            Market<span className="text-cyan-400">Pulse</span>
          </span>
          <span className="hidden text-[10px] text-slate-500 sm:inline">
            {new Date(asOf).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* segmented tabs */}
        <nav className="flex flex-1 items-center justify-center" aria-label="Sections">
          <div className="flex rounded-xl border border-slate-800 bg-slate-900/70 p-1">
            {TABS.map((t) => {
              const isActive = active === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onChange(t.id)}
                  title={t.hint}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition sm:px-4 ${
                    isActive
                      ? "bg-cyan-500/15 text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span aria-hidden className={isActive ? "text-cyan-400" : "text-slate-500"}>
                    {t.icon}
                  </span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* utilities */}
        <div className="flex items-center gap-2">
          {/* scenario switcher — clearly labeled simulation for demos */}
          <div
            className="flex overflow-hidden rounded-lg border border-slate-800"
            title="Simulate a market day to see how the composite reacts (clearly disclosed in the banner)"
          >
            {([
              { id: "live", label: "Live", tint: "" },
              { id: "bullish", label: "🐂", tint: "bullish" },
              { id: "bearish", label: "🐻", tint: "bearish" },
              { id: "neutral", label: "➖", tint: "neutral" },
            ] as const).map((s) => (
              <button
                key={s.id}
                onClick={() => onScenario(s.id)}
                className={`px-2.5 py-1.5 text-[11px] font-medium transition ${
                  scenario === s.id
                    ? s.tint === "bullish"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : s.tint === "bearish"
                        ? "bg-rose-500/20 text-rose-300"
                        : s.tint === "neutral"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-slate-800 text-slate-200"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            onClick={onToggleBeginner}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
              beginnerMode
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : "border-slate-700 text-slate-400 hover:border-slate-500"
            }`}
          >
            {beginnerMode ? "🌱 Beginner" : "🔬 Advanced"}
          </button>
          <button
            onClick={onOpenGlossary}
            className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
          >
            📖 Glossary
          </button>
        </div>
      </div>
    </header>
  );
}
