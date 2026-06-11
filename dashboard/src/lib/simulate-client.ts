// Client-side Demo Driver: orchestrates a simulated outbound confirmation call by
// hitting the server Route Handlers. Each step writes to Supabase, so the live view +
// transcript stream update via SSE exactly as a real agent call would.

import { buildConfirmScript, confirmCallSummary } from "./demo-script";
import type { Reservation } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`${url} → ${res.status} ${detail.error ?? ""}`);
  }
  return res.json();
}

export async function runSimulation(reservation: Reservation): Promise<void> {
  const { call_id } = await post("/api/calls/start", {
    reservation_id: reservation.id,
    customer_id: reservation.customer?.id ?? null,
  });

  const turns = buildConfirmScript(reservation);
  let prevTs = 0;
  for (const turn of turns) {
    await sleep(Math.max(300, turn.ts_ms - prevTs));
    prevTs = turn.ts_ms;
    await post("/api/calls/turn", { call_id, turn });
  }

  await sleep(1200);
  const summary = confirmCallSummary(turns);
  await post("/api/calls/finish", {
    call_id,
    reservation_id: reservation.id,
    outcome: summary.outcome,
    decision: summary.decision,
    intent: summary.intent,
    confidence: summary.confidence,
    duration_seconds: summary.durationSeconds,
    cost_usd: summary.costUsd,
  });
}
