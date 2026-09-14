import { NextResponse } from "next/server";
import { computePulse } from "@/lib/pipeline";
import type { PulseResult } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

let lastGood: PulseResult | null = null;

export async function GET() {
  try {
    const pulse = await computePulse();
    lastGood = pulse;
    return NextResponse.json(pulse);
  } catch (err) {
    if (lastGood) {
      return NextResponse.json({
        ...lastGood,
        warnings: [...lastGood.warnings, "Live refresh failed; showing last known good pulse."],
      });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to compute pulse" },
      { status: 503 },
    );
  }
}
