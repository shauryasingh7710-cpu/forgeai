"use client";

interface Props {
  data: number[];
  className?: string;
  width?: number;
  height?: number;
  stroke?: string;
}

export default function Sparkline({ data, className, width = 220, height = 36, stroke = "#22d3ee" }: Props) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - 4) + 2;
      const y = height - 4 - ((v - min) / range) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const up = data[data.length - 1] >= data[0];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className ?? "h-9 w-full"}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke={stroke ?? (up ? "#34d399" : "#f87171")}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
