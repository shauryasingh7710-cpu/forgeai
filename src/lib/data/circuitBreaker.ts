/**
 * Minimal circuit breaker for external providers.
 *
 * When a provider starts failing repeatedly (e.g. Yahoo 429s), we stop paying
 * the latency of every request and fail fast to the fallback provider for a
 * cool-down window. Breaker state is per-process and resets naturally.
 */

interface BreakerState {
  failures: number;
  lastFailureAt: number;
  openUntil: number;
}

const THRESHOLD = 3; // consecutive failures before opening
const OPEN_MS = 3 * 60 * 1000; // stay open for 3 minutes
const FAILURE_WINDOW_MS = 10 * 60 * 1000; // failures older than this don't count

const breakers = new Map<string, BreakerState>();

function stateFor(provider: string): BreakerState {
  let s = breakers.get(provider);
  if (!s) {
    s = { failures: 0, lastFailureAt: 0, openUntil: 0 };
    breakers.set(provider, s);
  }
  return s;
}

export function canUse(provider: string): boolean {
  const s = stateFor(provider);
  if (s.openUntil > Date.now()) return false;
  // reset counters if the last failure is old
  if (s.lastFailureAt > 0 && Date.now() - s.lastFailureAt > FAILURE_WINDOW_MS) {
    s.failures = 0;
  }
  return true;
}

export function recordSuccess(provider: string): void {
  const s = stateFor(provider);
  s.failures = 0;
  s.openUntil = 0;
}

export function recordFailure(provider: string): void {
  const s = stateFor(provider);
  const now = Date.now();
  if (now - s.lastFailureAt > FAILURE_WINDOW_MS) s.failures = 0;
  s.failures += 1;
  s.lastFailureAt = now;
  if (s.failures >= THRESHOLD) {
    s.openUntil = now + OPEN_MS;
    s.failures = 0;
  }
}

/** Test/ops helper. */
export function resetBreakers(): void {
  breakers.clear();
}

export function breakerStatus(): Record<string, { open: boolean; failures: number }> {
  const out: Record<string, { open: boolean; failures: number }> = {};
  for (const [k, v] of breakers.entries()) {
    out[k] = { open: v.openUntil > Date.now(), failures: v.failures };
  }
  return out;
}
