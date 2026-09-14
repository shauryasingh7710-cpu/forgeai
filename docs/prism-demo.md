# PRISM Demo Walkthrough — for judges

This is the live demonstration script behind pitch-deck **Slide 4 (PRISM Usage)** and
**Slide 5 (System Workflow)**. Everything below is implemented in the app — nothing is mocked.

---

## The loop we demonstrate

```
Input → AI System → PRISM Monitoring & Evaluation → Failure Detection → Improvement ↺
```

## 1 · Observe — every AI run is a PRISM session

Open the dashboard (`npm run dev` → http://localhost:3000). Each time the page loads (or a
stock is analyzed in **Stock focus**), the AI explanation run is recorded as one session:

- `sessionId` (e.g. `run_m1abc_x7k2p`)
- **goal** — `explain_today_market` or `explain_stock:RELIANCE.NS`
- **input** — the exact signal payload the AI saw (frozen snapshot)
- **prompt** — the grounded-prompt text with strict rules
- **output** — headline, body, watch list, cited groups
- **composite score + zone**, **model**, **latency**

*Where to see it:* `GET /api/pulse` → `session` field (full record: goal, input, prompt,
output, evaluators, latency). The panel is intentionally not rendered in the UI —
instrumentation is server-side; the explanation card still shows the run id and chips.

## 2 · Evaluate — four automated checks on 100% of runs

Each run is scored by four evaluators (implemented in `src/lib/prism/evaluators.ts`):

1. **Groundedness** — every substantive number in the narrative is diffed against the frozen
   payload; any invented number fails with the exact violations listed.
2. **Consistency** — the narrative's sentiment words are matched against the computed zone;
   a "bullish" narrative on a "Cautious" score fails (contradictions flagged).
3. **Advice-safety guardrail** — banned-pattern scan (buy/sell/target/stop-loss/…); any hit is
   a guardrail event, and the text is defensively rewritten before it ever ships.
4. **Completeness** — the narrative must cite ≥2 of the top-3 weighted driver groups and
   include a watch list.

*Where to see it:* the **AI explanation** panel shows a green chip per passing check and a
red ✗ chip per failure with details; `GET /api/pulse` → `session.evaluators` has scores.

## 3 · Detect failures — classification, not just alerts

Every session gets a **failure class** when something is wrong:

| Class | Meaning |
|---|---|
| `evaluator:groundedness` | a number didn't trace to the payload |
| `evaluator:consistency` | narrative contradicts the computed zone |
| `guardrail:advice_language` | advice-like phrasing detected |
| `llm_call_failed_template_fallback` | LLM unavailable → grounded template served (degradation, never darkness) |
| `low_confidence:<evaluator>` | passed with a less-than-perfect score |

The session recorder aggregates these into **failure classes → the improvement backlog**,
exactly PRISM's "failures clustered → root causes classified" pattern (see
`src/lib/prism/session.ts` — stats via `sessionStats()`).

*Demo: inject a failure.* In `src/lib/llm/narrative.ts`, temporarily append a line to the
template body (e.g. "The market has rallied 3.7% this week." — a number not in the payload).
Reload: the groundedness evaluator **fails the run**, the ✗ chip appears on the explanation
card, `evaluator:groundedness` appears in the failure table, and the run is flagged for human
review. Revert the change.

## 4 · Improve — human-gated fix, then validated

1. Failure class becomes a backlog item (`sessionStats()` / PRISM console after setup).
2. Fix ships only through **human review** (PRISM never merges on its own): e.g. a prompt
   rule tightened, a lexicon weight corrected, a guardrail pattern added.
3. The **same situation is re-run** (reload the page — same payload, cached) and the
   evaluator now **passes** — the fix is validated, not assumed.
4. Per-evaluator pass rates tick up — the six-dimension reliability scorecard in the pitch
   deck is this exact artifact, monthly.

## 5 · Connect to PRISM cloud (official trace API)

MarketPulse forwards every AI run to PRISM's **official HTTP trace API**
([docs](https://blockconvey.com/docs)) — fire-and-forget, off the request path:

```
POST {PRISMTRACE_HOST}/api/traces
X-PRISMtrace-Key: pt-sk-...
{
  "project_id": "<uuid>",
  "model": "<model-or-template-engine>",
  "input_messages": [{ "role": "user", "content": <grounded prompt> }],
  "output_message": "<headline + body + watch list>",
  "latency_ms": 1234,
  "session_id": "marketpulse:explain_today_market:2026-09-14",
  "agent_id": "marketpulse-market-agent",
  "agent_name": "MarketPulse",
  "metadata": {
    "composite_score": -17, "zone": "Cautious",
    "evaluators": { "groundedness": {"passed": true, "score": 1}, ... },
    "guardrail_triggered": false, "failure_class": "none",
    "grounded_payload": { ...the frozen signal payload... }
  }
}
```

PRISM then applies its automatic scoring (satisfaction, response quality, intent, hallucination
flags **plus financial-industry checks** — rate promises and regulated-activity flags),
guardrails, alert rules, and root-cause clustering on top of our own evaluators.

**Setup (5 minutes, from PRISM's quickstart and the demo video):**
1. Sign up at **prism.blockconvey.com/signup** (creates org + first project; the video shows
   the signup → AI-personalized onboarding quiz flow).
2. Copy the **Project ID** from Settings → Project.
3. Create an **API key** (scope: `ingest`) — shown once, stored hashed; rotate if lost.
4. Put the three values in `.env.local` (see `.env.example`): `PRISMTRACE_HOST`,
   `PRISMTRACE_PROJECT_ID`, `PRISMTRACE_API_KEY`.
5. Restart the app — every AI run now streams to PRISM's Traces/Sessions views with our
   evaluator metadata filterable (fire-and-forget; local buffer unaffected).
6. Verify with PRISM's own doctor: `GET /api/setup-doctor?project_id=...` should report
   `live_connected: true`.

Free plan covers everything we need: 25,000 traces/month, automatic scoring, alerts,
root-cause, 100 credits for optional AI actions. Until keys are set, the local ring buffer
holds 200 sessions with the identical schema — the demo never depends on the network.

---

**One-sentence summary for the judge:** *a request can return 200 OK and still fail the user —
MarketPulse catches exactly that: every AI explanation is traced, evaluated against four
auditable checks, classified on failure, and only human-approved fixes ship, with the
re-run proving the improvement.*
