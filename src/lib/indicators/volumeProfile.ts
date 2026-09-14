/**
 * Volume profile: today's volume vs the 20-day average, and the balance of
 * volume on up-days vs down-days over the last 10 sessions.
 */
export interface VolumeProfile {
  ratio: number | null; // today vs 20d average
  upDownBalance: number | null; // -1..+1 (up-volume share minus down-volume share)
}

export function volumeProfile(
  candles: { close: number; volume: number }[],
): VolumeProfile {
  if (candles.length < 21) return { ratio: null, upDownBalance: null };

  const vols = candles.map((c) => c.volume);
  const avg20 = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const today = vols[vols.length - 1];
  const ratio = avg20 > 0 ? today / avg20 : null;

  let upVol = 0;
  let downVol = 0;
  for (let i = candles.length - 10; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) upVol += candles[i].volume;
    else if (diff < 0) downVol += candles[i].volume;
  }
  const total = upVol + downVol;
  const upDownBalance = total > 0 ? (upVol - downVol) / total : null;

  return { ratio, upDownBalance };
}
