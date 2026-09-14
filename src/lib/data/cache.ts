/**
 * Tiny in-memory TTL cache with stale-on-error fallback.
 *
 * External market data must never break the UI: if a fetch fails and a stale
 * value exists, we serve the stale value and mark it. Entries are also kept
 * briefly beyond their TTL as "stale" backup.
 */

interface Entry<T> {
  value: T;
  fetchedAt: number;
  expiresAt: number;
  staleUntil: number;
}

const store = new Map<string, Entry<unknown>>();

export interface CachedResult<T> {
  value: T;
  fetchedAt: number;
  stale: boolean;
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<CachedResult<T>> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return { value: hit.value, fetchedAt: hit.fetchedAt, stale: false };
  }

  try {
    const value = await loader();
    store.set(key, {
      value,
      fetchedAt: now,
      expiresAt: now + ttlMs,
      staleUntil: now + ttlMs * 6, // keep stale copies for 6x TTL
    });
    return { value, fetchedAt: now, stale: false };
  } catch (err) {
    if (hit && hit.staleUntil > now) {
      return { value: hit.value, fetchedAt: hit.fetchedAt, stale: true };
    }
    throw err;
  }
}

export function cacheStats(): { size: number; keys: string[] } {
  return { size: store.size, keys: [...store.keys()] };
}

/** Test helper. */
export function clearCache(): void {
  store.clear();
}
