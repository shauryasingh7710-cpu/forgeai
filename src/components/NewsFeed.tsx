"use client";

import { useMemo, useState } from "react";
import type { NewsItem } from "@/lib/data/types";

type Filter = "all" | "positive" | "negative";

export default function NewsFeed({ news }: { news: NewsItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    if (filter === "positive") return news.filter((n) => n.sentiment > 0.15);
    if (filter === "negative") return news.filter((n) => n.sentiment < -0.15);
    return news;
  }, [news, filter]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Market news · sentiment-tagged
        </h3>
        <div className="flex gap-1">
          {(["all", "positive", "negative"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 text-[10px] font-medium capitalize ${
                filter === f
                  ? "bg-cyan-500/15 text-cyan-300"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
        {shown.length === 0 && (
          <p className="text-xs text-slate-500">No headlines match this filter.</p>
        )}
        {shown.map((n, i) => (
          <a
            key={i}
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 rounded-lg border border-slate-800/70 p-2 transition hover:border-slate-600"
          >
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                n.sentiment > 0.15
                  ? "bg-emerald-400"
                  : n.sentiment < -0.15
                    ? "bg-red-400"
                    : "bg-slate-500"
              }`}
              title={`sentiment ${n.sentiment.toFixed(2)}`}
            />
            <span className="min-w-0">
              <span className="block truncate text-xs text-slate-200">{n.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-slate-500">{n.source}</span>
                {n.topics.slice(0, 2).map((t) => (
                  <span
                    key={t}
                    className="rounded bg-slate-800/80 px-1 py-0.5 text-[9px] uppercase tracking-wide text-slate-400"
                  >
                    {t}
                  </span>
                ))}
              </span>
            </span>
          </a>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-600">
        Sentiment dots come from an auditable keyword lexicon — not a black box.
      </p>
    </div>
  );
}
