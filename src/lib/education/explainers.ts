/**
 * Financial-literacy content: beginner explainers keyed to the indicators and
 * a glossary. Static, reviewed copy — never generated at runtime.
 */

export const EXPLAINERS: Record<string, { title: string; what: string; why: string }> = {
  dma: {
    title: "Moving Averages (50/200-DMA)",
    what: "A moving average is simply the average closing price over the last N days — the 50-DMA averages 50 days, the 200-DMA averages 200.",
    why: "It smooths out daily noise so you can see the underlying direction. Price above its averages generally means buyers are in control; below, sellers are.",
  },
  golden_cross: {
    title: "Golden Cross / Death Cross",
    what: "When the 50-day average crosses above the 200-day average it's called a 'golden cross'; below, a 'death cross'.",
    why: "It signals that recent momentum has durably overtaken (or lost to) the longer trend. It's a lagging but widely watched confirmation signal.",
  },
  momentum_5d: {
    title: "5-day momentum",
    what: "How much the index moved over the last week, in percent.",
    why: "Short bursts of buying or selling often persist for days — this shows whether the very recent push is up or down.",
  },
  momentum_20d: {
    title: "20-day momentum",
    what: "How much the index moved over the last month, in percent.",
    why: "A month captures a full market 'swing' — it tells you whether the recent week fits inside a bigger move or fights it.",
  },
  rsi: {
    title: "RSI (Relative Strength Index)",
    what: "RSI scores recent gains vs losses on a 0–100 scale. Above 70 is 'overbought', below 30 'oversold'.",
    why: "Extremes often precede pauses or reversals. RSI isn't a buy/sell signal on its own — it tells you when a move may be stretched.",
  },
  breadth: {
    title: "Market breadth",
    what: "The share of tracked stocks that rose over the last 5 days.",
    why: "When only a few big stocks lift the index, rallies are fragile. Broad participation is healthier — breadth shows the difference.",
  },
  vix: {
    title: "India VIX (fear gauge)",
    what: "VIX measures how much protection against swings costs right now — effectively the market's expected volatility.",
    why: "Spiking VIX = fear rising; falling VIX = fear cooling. It's the fastest known gauge of market emotion.",
  },
  realized_vol: {
    title: "Realized volatility",
    what: "How much the index actually swung day-to-day over the past 20 sessions, annualized.",
    why: "It shows whether the market is calm or turbulent in fact — compare it with VIX, which is about expected fear.",
  },
  volume_ratio: {
    title: "Volume vs average",
    what: "Today's traded volume divided by the 20-day average.",
    why: "Big moves on heavy volume show conviction; the same move on thin volume often fails. Volume is the market's 'turnout'.",
  },
  up_down_volume: {
    title: "Up/down volume",
    what: "Over 10 sessions, how much volume traded on up-days versus down-days.",
    why: "If down-days carry the heavy volume, big players may be exiting quietly (distribution); the reverse suggests accumulation.",
  },
  range_52w: {
    title: "52-week range position",
    what: "Where today's price sits between its 52-week low (0%) and high (100%).",
    why: "Near highs, the market has momentum behind it; near lows, it's beaten down — context that changes how you read any single day.",
  },
  support_resistance: {
    title: "Support & resistance",
    what: "Recent price floors (support) and ceilings (resistance) where buying or selling previously stepped in.",
    why: "Price approaching these levels often slows or reverses — useful markers for where to watch closely.",
  },
  global_indices: {
    title: "Global market cues",
    what: "How US, European and Asian markets closed in their sessions.",
    why: "Global markets are linked — foreign investors shift money across them, so an overnight Wall Street drop often spills into India's open.",
  },
  dxy: {
    title: "Dollar Index (DXY)",
    what: "The US dollar's value against major currencies.",
    why: "A stronger dollar pulls foreign money out of emerging markets like India — it's one of the most reliable macro headwinds.",
  },
  crude: {
    title: "Crude oil",
    what: "The price of Brent crude oil.",
    why: "India imports most of its oil — spiking crude widens the import bill, pressures the rupee and hurts oil-using companies.",
  },
  gold: {
    title: "Gold",
    what: "Gold's market price.",
    why: "Rapid gold rallies often mean investors are nervous and seeking safety — a soft 'fear thermometer' alongside VIX.",
  },
  us10y: {
    title: "US 10-year yield",
    what: "What the US government pays to borrow for 10 years.",
    why: "Rising US yields make 'safe' bonds more attractive vs risky stocks — and squeeze valuations of growth companies worldwide.",
  },
  news_sentiment: {
    title: "News sentiment",
    what: "A keyword scan of recent market headlines, scored from negative to positive.",
    why: "News sets the day's mood. This is deliberately simple and auditable — you can see which words moved the score.",
  },
  fii_dii: {
    title: "FII/DII flows",
    what: "Net daily buying (+) or selling (−) by foreign (FII) and domestic (DII) institutions in the cash market.",
    why: "Institutions move the most money. When FIIs sell heavily and DIIs absorb it, the market's underlying demand picture is visible.",
  },
};

export const GLOSSARY: { term: string; definition: string }[] = [
  { term: "Bullish / Bearish", definition: "Expectations that prices will rise (bullish) or fall (bearish)." },
  { term: "Index (Nifty/Sensex)", definition: "A basket of large companies whose combined value tracks the overall market." },
  { term: "DMA (Daily Moving Average)", definition: "The average closing price over the last N trading days." },
  { term: "RSI", definition: "A 0–100 momentum score; above 70 = stretched up, below 30 = stretched down." },
  { term: "MACD", definition: "The gap between two moving averages — a momentum and trend-change indicator." },
  { term: "Bollinger Bands", definition: "A band drawn 2 standard deviations around a moving average; price near an edge = stretched." },
  { term: "India VIX", definition: "The market's expectation of near-term volatility, derived from option prices." },
  { term: "Breadth", definition: "How many stocks participate in a move — broad participation is more durable." },
  { term: "FII / DII", definition: "Foreign / Domestic Institutional Investors — the big professional money." },
  { term: "Accumulation / Distribution", definition: "Quiet buying by large players (accumulation) or quiet selling (distribution)." },
  { term: "Support / Resistance", definition: "Price levels where buying or selling previously stepped in strongly." },
  { term: "Groundedness", definition: "Whether an AI explanation's claims trace to real supplied data — a PRISM evaluator." },
];
