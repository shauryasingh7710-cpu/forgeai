"use client";

import { useState } from "react";
import { GLOSSARY } from "@/lib/education/explainers";

export default function Glossary({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const terms = GLOSSARY.filter(
    (g) =>
      g.term.toLowerCase().includes(query.toLowerCase()) ||
      g.definition.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h3 className="font-semibold">📖 Glossary</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        <div className="p-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-600"
          />
          <div className="mt-3 max-h-[52vh] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
            {terms.map((t) => (
              <div key={t.term}>
                <div className="text-sm font-semibold text-cyan-300">{t.term}</div>
                <p className="text-xs leading-relaxed text-slate-300">{t.definition}</p>
              </div>
            ))}
            {terms.length === 0 && (
              <p className="text-xs text-slate-500">No matching terms.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
