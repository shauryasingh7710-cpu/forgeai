/**
 * News sentiment signal: aggregates the finance lexicon over recent market
 * headlines. Transparent by design — every hit is auditable.
 */
import {
  clamp,
  fmt,
  makeSignal,
  reading,
  type SignalContext,
  type SignalOutput,
} from "./aggregate";

export function newsSignal(
  news: { sentiment: number; topics: string[] }[],
): SignalOutput {
  const base = { group: "news" as const, label: "News sentiment", weight: 12 };

  if (news.length === 0) {
    return {
      ...base,
      score: 0,
      why: "No headlines available — signal excluded from the composite.",
      readings: [],
      available: false,
    };
  }

  const scores = news.map((n) => n.sentiment);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const pos = scores.filter((s) => s > 0.15).length;
  const neg = scores.filter((s) => s < -0.15).length;

  // Net skew: positives minus negatives, gently scaled.
  const skew = (pos - neg) / scores.length;
  const score = clamp((mean * 1.5 + skew * 1.5) * 2, -2, 2);

  // Dominant topics for context.
  const topicCount = new Map<string, number>();
  news.forEach((n) => n.topics.forEach((t) => topicCount.set(t, (topicCount.get(t) ?? 0) + 1)));
  const topTopics = [...topicCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, c]) => `${t} (${c})`)
    .join(", ");

  return {
    ...base,
    score,
    why:
      score > 0.3
        ? `Headlines lean positive — ${pos} bullish-toned vs ${neg} bearish-toned of ${news.length}${topTopics ? `; talk of ${topTopics}` : ""}.`
        : score < -0.3
          ? `Headlines lean negative — ${neg} bearish-toned vs ${pos} bullish-toned of ${news.length}${topTopics ? `; talk of ${topTopics}` : ""}.`
          : `Headlines are mixed (${pos} positive vs ${neg} negative of ${news.length}) — no dominant narrative${topTopics ? `; topics: ${topTopics}` : ""}.`,
    readings: [
      reading(
        "Headline balance",
        `${pos}▲ / ${neg}▼ of ${news.length}`,
        score,
        "Count of clearly positive vs clearly negative headlines in the latest news window.",
        "news_sentiment",
      ),
      reading(
        "Average tone",
        fmt(mean, 2),
        clamp(mean * 4, -2, 2),
        "Mean keyword-sentiment across headlines; -1 is maximally negative, +1 maximally positive.",
        "news_sentiment",
      ),
    ],
    available: true,
  };
}
