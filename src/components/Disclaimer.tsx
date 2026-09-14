"use client";

import { useState } from "react";

export default function Disclaimer() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[11px] text-amber-200/90">
          ⚠️ <span className="font-semibold">Educational tool — not investment advice.</span>{" "}
          MarketPulse explains publicly available market signals for learning. It does not
          recommend stocks, predict returns, or replace a SEBI-registered advisor.
        </span>
        <span className="ml-3 shrink-0 text-[10px] text-amber-400/70">
          {open ? "less ▲" : "more ▼"}
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-1 border-t border-amber-900/40 pt-2 text-[11px] leading-relaxed text-amber-200/70">
          <p>
            The composite score, signal cards and AI explanations are computed from public data
            (Yahoo Finance, Google News, NSE) and are for financial literacy only. Every AI
            explanation is monitored by PRISM evaluators for groundedness, consistency and
            advice-safety.
          </p>
          <p>
            Markets involve risk. Past behavior of indicators does not guarantee future outcomes.
            Consult a SEBI-registered investment adviser before making financial decisions.
          </p>
        </div>
      )}
    </div>
  );
}
