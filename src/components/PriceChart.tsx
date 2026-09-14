"use client";

import { useMemo, useRef, useState } from "react";
import type { Candle } from "@/lib/data/types";

interface Props {
  data: Candle[];
  dma50?: number | null;
  dma200?: number | null;
  w52High?: number | null;
  w52Low?: number | null;
  height?: number;
}

const UP = "#22c55e";
const DOWN = "#ef4444";

export default function PriceChart({ data, dma50, dma200, w52High, w52Low, height = 260 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; candle: Candle; i: number } | null>(null);
  const W = 800;
  const H = height;
  const padR = 56; // right-side price axis (like Zerodha/Groww)
  const padT = 14;
  const priceH = H - 64; // leave room for the volume pane
  const volTop = priceH + 18;
  const volH = H - volTop - 6;

  const view = useMemo(() => data.slice(-120), [data]);

  const { candles, min, max, vols, volMax } = useMemo(() => {
    const view2 = view;
    const highsLows = view2.flatMap((c) => [c.high, c.low]);
    const overlayLevels = [dma50, dma200, w52High, w52Low].filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
    const relevant = overlayLevels.filter((v) => {
      const inBand = v <= Math.max(...highsLows) * 1.35 && v >= Math.min(...highsLows) * 0.65;
      return inBand;
    });
    const all = [...highsLows, ...relevant];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min) * 0.06;
    return {
      candles: view2,
      min: min - pad,
      max: max + pad,
      vols: view2.map((c) => c.volume),
      volMax: Math.max(...view2.map((c) => c.volume), 1),
    };
  }, [view, dma50, dma200, w52High, w52Low]);

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
    return view.map((c, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(c.close).toFixed(1)}`).join(" ");
  }, [view, min, max]); // eslint-disable-line react-hooks/exhaustive-deps

  const up = view.length > 0 && view[view.length - 1].close >= view[0].close;
  const last = view[view.length - 1];
  const first = view[0];
  const periodPct = ((last.close - first.close) / first.close) * 100;

  const lastY = y(last.close);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((relX - 4) / (W - padR - 8)) * (view.length - 1));
    if (i < 0 || i >= view.length) {
      setHover(null);
      return;
    }
    setHover({ x: x(i), candle: view[i]!, i });
  }

  return (
    <div className="relative" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair select-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`area-${up ? "up" : "dn"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? UP : DOWN} stopOpacity={0.16} />
            <stop offset="100%" stopColor={up ? UP : DOWN} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* horizontal gridlines with price labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yy = padT + t * (priceH - padT);
          const price = max - t * (max - min);
          return (
            <g key={t}>
              <line x1={4} x2={W - padR} y1={yy} y2={yy} stroke="#1e293b" strokeWidth={1} strokeDasharray="3 4" />
              <text x={W - padR + 6} y={yy + 3.5} fill="#64748b" fontSize={10} fontFamily="ui-monospace, monospace">
                {price >= 1000 ? price.toFixed(0) : price.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* gradient area under closes */}
        <path d={areaPath} fill={`url(#area-${up ? "up" : "dn"})`} />

        {/* volume bars (separate pane, like the real platforms) */}
        {vols.map((v, i) => {
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

        {/* candles: wick + body */}
        {candles.map((c, i) => {
          const bw = Math.max(1.5, (W - padR - 12) / view.length - 1);
          const cx = x(i);
          const upC = c.close >= c.open;
          const color = upC ? UP : DOWN;
          const bodyTop = y(Math.max(c.open, c.close));
          const bodyH = Math.max(1, Math.abs(y(c.close) - y(c.open)));
          return (
            <g key={i} opacity={hover && hover.i !== i ? 0.45 : 1}>
              <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth={1} />
              <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={color} opacity={0.9} />
            </g>
          );
        })}

        {/* close line (subtle) */}
        <path d={closeLine} fill="none" stroke={up ? UP : DOWN} strokeWidth={1.4} opacity={0.85} />

        {/* DMA overlays — dashed reference lines like the platforms */}
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

        {/* 52-week band rails */}
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

        {/* last-price marker: pulsing dot + right-edge tag */}
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
            <circle cx={x(view.length - 1)} cy={lastY} r={6} fill={up ? UP : DOWN} opacity={0.25}>
              <animate attributeName="r" values="4;9;4" dur="2.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.35;0.05;0.35" dur="2.2s" repeatCount="indefinite" />
            </circle>
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
              {last.close >= 1000 ? last.close.toFixed(0) : last.close.toFixed(1)}
            </text>
          </g>
        )}

        {/* hover crosshair + tooltip */}
        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={H - 6} stroke="#475569" strokeWidth={0.8} strokeDasharray="3 3" />
            <line x1={4} x2={W - padR} y1={y(hover.candle.close)} y2={y(hover.candle.close)} stroke="#475569" strokeWidth={0.8} strokeDasharray="3 3" />
            <g transform={`translate(${Math.min(hover.x + 10, W - 150)}, 8)`}>
              <rect width={142} height={64} rx={6} fill="#0f172a" stroke="#334155" opacity={0.97} />
              <text x={8} y={16} fill="#94a3b8" fontSize={9.5}>
                {new Date(hover.candle.time * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
              </text>
              <text x={8} y={30} fill="#e2e8f0" fontSize={10} fontFamily="ui-monospace, monospace">
                O {hover.candle.open.toFixed(1)}  H {hover.candle.high.toFixed(1)}
              </text>
              <text x={8} y={43} fill="#e2e8f0" fontSize={10} fontFamily="ui-monospace, monospace">
                L {hover.candle.low.toFixed(1)}  C {hover.candle.close.toFixed(1)}
              </text>
              <text x={8} y={57} fill="#94a3b8" fontSize={9.5}>
                Vol {(hover.candle.volume / 1e6).toFixed(2)}M
              </text>
            </g>
          </g>
        )}
      </svg>

      {/* period change caption */}
      {last && (
        <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
          <span>
            {view.length}-session view ·{" "}
            <span className={periodPct >= 0 ? "text-emerald-400" : "text-red-400"}>
              {periodPct >= 0 ? "+" : ""}
              {periodPct.toFixed(2)}%
            </span>{" "}
            over the window
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: UP }} />
            up day
            <span className="ml-1 inline-block h-2 w-3 rounded-sm" style={{ background: DOWN }} />
            down day
          </span>
          <span className="ml-auto">hover for OHLC + volume</span>
          {dma50 != null && <span className="text-sky-400">– – 50 DMA</span>}
          {dma200 != null && <span className="text-amber-400">– – 200 DMA</span>}
        </div>
      )}
    </div>
  );
}
