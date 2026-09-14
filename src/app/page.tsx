/**
 * Dashboard page: server component that calls the pipeline directly and
 * renders the full MarketPulse dashboard. Client islands (stock focus, news
 * filter, refresh) hydrate on top.
 */
import { computePulse } from "@/lib/pipeline";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  let pulse = null;
  let error: string | null = null;
  try {
    pulse = await computePulse();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load market pulse";
  }

  if (error || !pulse) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-2xl font-bold">MarketPulse</h1>
        <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          Could not load market data: {error}. The data sources may be temporarily
          unreachable — please refresh in a moment.
        </p>
      </main>
    );
  }

  return <Dashboard pulse={pulse} />;
}
