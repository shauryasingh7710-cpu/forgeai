"use client";

import { useMemo, useRef, useState } from "react";
import type { Candle } from "@/lib/data/types";

interface Props {
  data: Candle[]; // daily candles
  /** Today's official minute session (NSE). Present → Today view is live. */
  intraday?: Candle[] | null;
  /** Optional real previous close for the intraday dashed reference. */
  prevClose?: number | null;
  dma50?: number | null;
  dma200?: number | null;
  w52High?: number | null;
  w52Low?: number | null;
  height?: number;
  defaultStyle?: "line" | "candles";
  /** Live-update mode: subtle pulse on the last price tag (default on). */
  live?: boolean;
}

type Range = "T" | "3" | "5";

const UP = "#22c55e";
const DOWN = "#ef4444";

const istTime = (t: number): string =>
  new Date(t * 1000).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
const istDay = (t: number): string =>
  new Date(t * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function PriceChart({
  data,
  intraday,
  prevClose,
  dma50,
  dma200,
  w52High,
  w52Low,
  height = 260,
  defaultStyle = "candles",
  live = true,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; candle: Candle; i: number; intraday: boolean } | null>(null);
  const [range, setRange] = useState<Range>("T");
  const [style, setStyle] = useState<"line" | "candles">(defaultStyle);

  const W = 800;
  const H = height;
  const padR = 56;
  const padT = 14;
  const priceH = H - 46;
  const showVol = range !== "T";
  const volTop = priceH + 18;
  const volH = H - volTop - 6;

  const intradayLen = intraday?.length ?? 0;
  const todayAvailable = intradayLen >= 2;
  const effective: "intraday" | "daily" =
    range === "T" && todayAvailable ? "intraday" : "daily";

  // ---- the active series -------------------------------------------------
  const view = useMemo(() => {
    if (effective === "intraday") return intraday!;
    const n = range === "3" ? 3 : 5;
    return data.slice(-n);
  }, [effective, intraday, data, range]);

  const { min, max, vols, volMax } = useMemo(() => {
    const highsLows = view.flatMap((c) => [c.high, c.low]);
    const overlayLevels =
      effective === "daily"
        ? [dma50, dma200, w52High, w52Low].filter(
            (v): v is number => typeof v === "number" && Number.isFinite(v),
          )
        : [];
    const relevant = overlayLevels.filter((v) => {
      const inBand = v <= Math.max(...highsLows) * 1.35 && v >= Math.min(...highsLows) * 0.65;
      return inBand;
    });
    const all = [...highsLows, ...relevant, ...(effective === "intraday" && prevClose ? [prevClose] : [])];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min) * 0.08;
    return {
      min: min - pad,
      max: max + pad,
      vols: view.map((c) => c.volume),
      volMax: Math.max(...view.map((c) => c.volume), 1),
    };
  }, [view, effective, dma50, dma200, w52High, w52Low, prevClose]);

  const x = (i: number): number => 4 + (i / Math.max(1, view.length - 1)) * (W - padR - 8);
  const y = (v: number): number => padT + (1 - (v - min) / (max - min)) * (priceH - padT);

  const linePath = (level: number): string => {
    if (typeof level !== "number" || !Number.isFinite(level)) return "";
    const yy = y(level);
    return `M 4 ${yy.toFixed(1)} L ${W - padR} ${yy.toFixed(1)}`;
  };

  const areaPath = useMemo(() => {
    if (view.length < 2) return "";
    const base = padT + (priceH - padT);
    const pts = view.map((c, i) => `${x(i).toFixed(1)},${y(c.close).toFixed(1)}`);
    return `M ${pts.join(" L ")} L ${(W - padR).toFixed(1)} ${base} L 4 ${base} Z`;
  }, [view, min, max]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeLine = useMemo(() => {
    if (view.length < 2) return "";
    return view
      .map((c, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(c.close).toFixed(1)}`)
      .join(" ");
  }, [view, min, max]); // eslint-disable-line react-hooks/exhaustive-deps

  const last = view[view.length - 1];
  const first = view[0];
  const up = !!last && !!first && last.close >= first.close;
  const periodPct = last && first ? ((last.close - first.close) / first.close) * 100 : 0;
  const lastY = last ? y(last.close) : 0;

  // price precision: sub-100 instruments (ETF, FX-ish) need decimals
  const priceDigits = last && last.close < 100 ? 2 : 0;
  const fmt = (v: number): string => v.toLocaleString("en-IN", { maximumFractionDigits: priceDigits });

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((relX - 4) / (W - padR - 8)) * (view.length - 1));
    if (i < 0 || i >= view.length) {
      setHover(null);
      return;
    }
    setHover({ x: x(i), candle: view[i]!, i, intraday: effective === "intraday" });
  }

  const rangeButtons: { key: Range; label: string; enabled: boolean }[] = [
    { key: "T", label: "Today", enabled: true },
    { key: "3", label: "3D", enabled: data.length >= 3 },
    { key: "5", label: "5D", enabled: data.length >= 5 },
  ];

  return (
    <div className="relative" ref={wrapRef}>
      {/* range + style controls */}
      <div className="mb-1.5 flex items-center gap-1.5">
        {rangeButtons.map((r) => (
          <button
            key={r.key}
            onClick={() => r.enabled && setRange(r.key)}
            disabled={!r.enabled}
            className={`rounded-md border px-2.5 py-0.5 text-[10px] font-medium transition ${
              range === r.key
                ? "border-cyan-600/60 bg-cyan-500/10 text-cyan-300"
                : r.enabled
                  ? "border-slate-800 text-slate-500 hover:text-slate-300"
                  : "border-slate-900 text-slate-700"
            }`}
          >
            {r.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {effective === "intraday" && (
            <span
              className={`flex items-center gap-1 text-[10px] ${live && todayAvailable ? "text-emerald-400" : "text-slate-500"}`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${live && todayAvailable ? "animate-pulse bg-emerald-400" : "bg-slate-600"}`}
              />
              {todayAvailable ? "LIVE · 09:15–15:30 IST" : "market closed"}
            </span>
          )}
          <div className="flex overflow-hidden rounded-md border border-slate-800">
            {(["candles", "line"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={`px-2 py-0.5 text-[10px] font-medium transition ${
                  style === s ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {s === "candles" ? "🕯" : "〽"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair select-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`area-${up ? "up" : "dn"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? UP : DOWN} stopOpacity={0.18} />
            <stop offset="100%" stopColor={up ? UP : DOWN} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* horizontal gridlines + right price axis */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yy = padT + t * (priceH - padT);
          const price = max - t * (max - min);
          return (
            <g key={t}>
              <line x1={4} x2={W - padR} y1={yy} y2={yy} stroke="#1e293b" strokeWidth={1} strokeDasharray="3 4" />
              <text x={W - padR + 6} y={yy + 3.5} fill="#64748b" fontSize={10} fontFamily="ui-monospace, monospace">
                {fmt(price)}
              </text>
            </g>
          );
        })}

        {/* gradient area under closes */}
        {view.length >= 2 && <path d={areaPath} fill={`url(#area-${up ? "up" : "dn"})`} />}

        {/* x-axis time labels */}
        {effective === "intraday"
          ? [0, 0.25, 0.5, 0.75, 1].map((t) => {
              const i = Math.round(t * (view.length - 1));
              return (
                <text
                  key={t}
                  x={Math.min(W - padR - 20, Math.max(16, x(i)))}
                  y={H - 4}
                  fill="#475569"
                  fontSize={9}
                  textAnchor="middle"
                  fontFamily="ui-monospace, monospace"
                >
                  {istTime(view[i]!.time)}
                </text>
              );
            })
          : view.map((c, i) => {
              const every = Math.max(1, Math.floor(view.length / 4));
              if (i % every !== 0 && i !== view.length - 1) return null;
              return (
                <text
                  key={i}
                  x={x(i)}
                  y={H - 4}
                  fill="#475569"
                  fontSize={9}
                  textAnchor="middle"
                  fontFamily="ui-monospace, monospace"
                >
                  {istDay(c.time)}
                </text>
              );
            })}

        {/* volume bars (daily views only — NSE minute feed carries no volume) */}
        {showVol &&
          vols.map((v, i) => {
            const h = Math.max(1, (v / volMax) * volH);
            const bw = Math.max(1.5, (W - padR - 12) / view.length - 1);
            const c = view[i]!;
            return (
              <rect
                key={i}
                x={x(i) - bw / 2}
                y={volTop + (volH - h)}
                width={bw}
                height={h}
                fill={c.close >= c.open ? UP : DOWN}
                opacity={0.45}
              />
            );
          })}

        {/* candles (daily: wick+body · intraday: thin minute bars) */}
        <g style={{ display: style === "candles" ? undefined : "none" }}>
          {view.map((c, i) => {
            const bw = effective === "intraday" ? 1.6 : Math.max(1.5, (W - padR - 12) / view.length - 1);
            const cx = x(i);
            const upC = c.close >= c.open;
            const color = upC ? UP : DOWN;
            const bodyTop = y(Math.max(c.open, c.close));
            const bodyH = Math.max(1, Math.abs(y(c.close) - y(c.open)));
            return (
              <g key={i} opacity={hover && hover.i !== i ? 0.45 : 1}>
                {effective === "daily" && (
                  <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={1} />
                )}
                <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={color} opacity={0.9} />
              </g>
            );
          })}
        </g>

        {/* close line */}
        <path
          d={closeLine}
          fill="none"
          stroke={up ? UP : DOWN}
          strokeWidth={style === "line" ? 2 : 1.4}
          opacity={style === "line" ? 1 : 0.85}
        />

        {/* daily overlays: DMAs + 52w rails */}
        {effective === "daily" && (
          <>
            {dma50 != null && (
              <>
                <path d={linePath(dma50)} stroke="#38bdf8" strokeWidth={1.2} strokeDasharray="6 4" opacity={0.75} />
                <text x={6} y={y(dma50) - 4} fill="#38bdf8" fontSize={9.5}>50 DMA</text>
              </>
            )}
            {dma200 != null && (
              <>
                <path d={linePath(dma200)} stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="6 4" opacity={0.75} />
                <text x={6} y={y(dma200) - 4} fill="#f59e0b" fontSize={9.5}>200 DMA</text>
              </>
            )}
            {w52High != null && (
              <>
                <path d={linePath(w52High)} stroke="#64748b" strokeWidth={1} strokeDasharray="2 5" opacity={0.5} />
                <text x={6} y={y(w52High) - 4} fill="#64748b" fontSize={9}>52w High</text>
              </>
            )}
            {w52Low != null && (
              <>
                <path d={linePath(w52Low)} stroke="#64748b" strokeWidth={1} strokeDasharray="2 5" opacity={0.5} />
                <text x={6} y={y(w52Low) - 4} fill="#64748b" fontSize={9}>52w Low</text>
              </>
            )}
          </>
        )}

        {/* intraday: previous-close reference line */}
        {effective === "intraday" && prevClose != null && Number.isFinite(prevClose) && (
          <>
            <path d={linePath(prevClose)} stroke="#64748b" strokeWidth={1} strokeDasharray="2 4" opacity={0.7} />
            <text x={6} y={y(prevClose) - 4} fill="#94a3b8" fontSize={9}>prev close</text>
          </>
        )}

        {/* last-price marker: dot + pulse + right-edge tag */}
        {last && (
          <g>
            <line
              x1={4}
              x2={W - padR}
              y1={lastY}
              y2={lastY}
              stroke={up ? UP : DOWN}
              strokeWidth={0.8}
              strokeDasharray="2 4"
              opacity={0.6}
            />
            <circle cx={x(view.length - 1)} cy={lastY} r={3.2} fill={up ? UP : DOWN} />
            {live && (
              <circle cx={x(view.length - 1)} cy={lastY} r={6} fill={up ? UP : DOWN} opacity={0.25}>
                <animate attributeName="r" values="4;9;4" dur="2.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.35;0.05;0.35" dur="2.2s" repeatCount="indefinite" />
              </circle>
            )}
            <rect x={W - padR + 2} y={lastY - 8} width={50} height={16} rx={3} fill={up ? UP : DOWN} />
            <text
              x={W - padR + 27}
              y={lastY + 3.5}
              fill="#0b1220"
              fontSize={10}
              fontWeight="bold"
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
            >
              {fmt(last.close)}
            </text>
          </g>
        )}

        {/* hover crosshair + tooltip */}
        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={H - 14} stroke="#475569" strokeWidth={0.8} strokeDasharray="3 3" />
            <line
              x1={4}
              x2={W - padR}
              y1={y(hover.candle.close)}
              y2={y(hover.candle.close)}
              stroke="#475569"
              strokeWidth={0.8}
              strokeDasharray="3 3"
            />
            <g transform={`translate(${Math.min(hover.x + 10, W - 150)}, 8)`}>
              <rect width={142} height={50} rx={6} fill="#0f172a" stroke="#334155" opacity={0.97} />
              <text x={8} y={16} fill="#94a3b8" fontSize={9.5}>
                {hover.intraday
                  ? `${istDay(hover.candle.time)} · ${istTime(hover.candle.time)} IST`
                  : istDay(hover.candle.time)}
              </text>
              <text x={8} y={32} fill="#e2e8f0" fontSize={10.5} fontFamily="ui-monospace, monospace">
                ₹{fmt(hover.candle.close)}
              </text>
              <text x={8} y={45} fill="#64748b" fontSize={9}>
                {hover.intraday ? "minute close (NSE official)" : `O ${fmt(hover.candle.open)} · H ${fmt(hover.candle.high)} · L ${fmt(hover.candle.low)}`}
              </text>
            </g>
          </g>
        )}
      </svg>

      {/* caption */}
      {last && (
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
          <span>
            {effective === "intraday" ? "Today · 1-min (NSE official)" : `${view.length}-day view`} ·{" "}
            <span className={periodPct >= 0 ? "text-emerald-400" : "text-red-400"}>
              {periodPct >= 0 ? "+" : ""}
              {periodPct.toFixed(2)}%
            </span>{" "}
            over the window
          </span>
          {showVol && (
            <span className="flex items-center gap-2">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: UP }} />
              up day
              <span className="ml-1 inline-block h-2 w-3 rounded-sm" style={{ background: DOWN }} />
              down day
            </span>
          )}
          <span className="ml-auto">hover for details</span>
          {effective === "daily" && dma50 != null && <span className="text-sky-400">– – 50 DMA</span>}
          {effective === "daily" && dma200 != null && <span className="text-amber-400">– – 200 DMA</span>}
        </div>
      )}
    </div>
  );
}
