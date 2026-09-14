"use client";

import { useEffect, useRef, useState } from "react";
import type { Zone } from "@/lib/data/types";

const ZONE_COLOR: Record<Zone, string> = {
  Bullish: "text-emerald-400",
  Optimistic: "text-green-400",
  Uncertain: "text-amber-300",
  Cautious: "text-orange-400",
  Bearish: "text-red-400",
};

const ZONE_GLOW: Record<Zone, string> = {
  Bullish: "#34d399",
  Optimistic: "#4ade80",
  Uncertain: "#fbbf24",
  Cautious: "#fb923c",
  Bearish: "#f87171",
};

/** 5-zone arc segments: −100..100 mapped to 180°. */
const SEGMENTS: { from: number; to: number; color: string }[] = [
  { from: -100, to: -35, color: "#ef4444" }, // Bearish
  { from: -35, to: -10, color: "#fb923c" }, // Cautious
  { from: -10, to: 10, color: "#fbbf24" }, // Uncertain
  { from: 10, to: 35, color: "#4ade80" }, // Optimistic
  { from: 35, to: 100, color: "#22c55e" }, // Bullish
];

const CX = 130;
const CY = 120;
const R = 100;

function polar(angleDeg: number, radius: number): [number, number] {
  // −100 → 180° (left), +100 → 0° (right); y flipped for SVG.
  const a = Math.PI * (1 - (angleDeg + 100) / 200);
  return [CX + radius * Math.cos(a), CY - radius * Math.sin(a)];
}

function arcPath(from: number, to: number, rIn: number, rOut: number): string {
  const [x1, y1] = polar(from, rOut);
  const [x2, y2] = polar(to, rOut);
  const [x3, y3] = polar(to, rIn);
  const [x4, y4] = polar(from, rIn);
  const large = ((to - from + 200) / 400) * Math.PI > Math.PI ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rOut} ${rOut} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${rIn} ${rIn} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
}

/** Smooth count-up hook. */
function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return value;
}

interface Props {
  score: number;
  zone: Zone;
  drivers: { group: string; label: string; contribution: number }[];
  vix: { value: number; changePct: number } | null;
}

export default function Gauge({ score, zone, drivers, vix }: Props) {
  const needleAngle = ((score + 100) / 200) * 180; // 0..180 across the arc
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);
  const shownScore = useCountUp(mounted ? score : 0);

  // Map score (−100..100) to needle rotation: −100 → −90°, 0 → 0°, +100 → +90°.
  const needleLen = 78;
  const glow = ZONE_GLOW[zone];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-5">
      {/* soft radial glow behind the gauge */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-56 opacity-25 blur-3xl transition-colors duration-1000"
        style={{ background: `radial-gradient(ellipse at 50% 20%, ${glow} 0%, transparent 70%)` }}
      />

      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">Market pulse</div>
          <div
            className={`mt-1 font-mono text-5xl font-bold tabular-nums transition-colors duration-700 ${ZONE_COLOR[zone]}`}
            style={{ textShadow: `0 0 24px ${glow}55` }}
          >
            {mounted ? shownScore : 0}
          </div>
          <div className={`text-sm font-semibold ${ZONE_COLOR[zone]}`}>{zone}</div>
        </div>
        {vix && (
          <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">India VIX</div>
            <div className="font-mono text-lg font-bold tabular-nums">{vix.value.toFixed(1)}</div>
            <div className={`font-mono text-xs ${vix.changePct >= 0 ? "text-red-400" : "text-emerald-400"}`}>
              {vix.changePct >= 0 ? "▲" : "▼"} {Math.abs(vix.changePct).toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      {/* animated SVG gauge */}
      <div className="relative mx-auto mt-1 w-full max-w-[280px]">
        <svg viewBox="0 0 260 140" className="w-full" aria-hidden>
          <defs>
            <filter id="needle-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* track + zone segments */}
          <path d={arcPath(-100, 100, R - 16, R)} fill="#1e293b" opacity={0.55} />
          {SEGMENTS.map((s) => (
            <path
              key={s.color}
              d={arcPath(s.from, s.to, R - 16, R)}
              fill={s.color}
              opacity={0.85}
              className="transition-opacity duration-300"
            />
          ))}

          {/* tick marks */}
          {[-100, -50, 0, 50, 100].map((t) => {
            const [x1, y1] = polar(t, R - 18);
            const [x2, y2] = polar(t, R - 26);
            return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#475569" strokeWidth={1.5} />;
          })}

          {/* active-zone marker (subtle highlight on the current segment) */}
          {SEGMENTS.filter((s) => score >= s.from && score <= s.to).map((s) => (
            <path
              key={`active-${s.color}`}
              d={arcPath(s.from, s.to, R - 17, R + 1)}
              fill="none"
              stroke={s.color}
              strokeWidth={1.2}
              opacity={0.9}
            />
          ))}

          {/* needle — drawn pointing up, then rotated by the score angle.
              rotate(-90deg) → −100 (left), 0deg → 0 (up), +90deg → +100 (right). */}
          <g
            style={{
              transform: mounted ? `rotate(${needleAngle - 90}deg)` : "rotate(-90deg)",
              transformOrigin: `${CX}px ${CY}px`,
              transition: "transform 1.4s cubic-bezier(0.34, 1.3, 0.5, 1)",
              filter: "url(#needle-glow)",
            }}
          >
            <line x1={CX} y1={CY} x2={CX} y2={CY - needleLen} stroke={glow} strokeWidth={3.5} strokeLinecap="round" />
            <circle cx={CX} cy={CY - needleLen} r={3} fill={glow} />
          </g>
          <circle cx={CX} cy={CY} r={7} fill="#0f172a" stroke={glow} strokeWidth={2} />
          <circle cx={CX} cy={CY} r={2.5} fill={glow} />
        </svg>

        <div className="-mt-1 flex justify-between px-2 text-[10px] font-medium text-slate-500">
          <span>−100 · Fear</span>
          <span>0</span>
          <span>Greed · +100</span>
        </div>
      </div>

      {/* top drivers with animated contribution bars */}
      <div className="relative mt-4 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Top drivers today
        </div>
        {drivers.map((d, i) => {
          const maxAbs = Math.max(...drivers.map((x) => Math.abs(x.contribution)), 1);
          const width = (Math.abs(d.contribution) / maxAbs) * 100;
          const positive = d.contribution >= 0;
          return (
            <div key={d.group} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-300">{d.label}</span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono tabular-nums ${
                    positive ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
                  }`}
                >
                  {positive ? "+" : ""}
                  {d.contribution}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${positive ? "bg-emerald-400" : "bg-red-400"}`}
                  style={{
                    width: mounted ? `${width}%` : "0%",
                    transition: `width 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${0.25 + i * 0.12}s`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
