import { getAdminClient } from "@/lib/supabase-admin";
import { nudge } from "@/lib/live-store";
import type { CallOutcome, ReservationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DECISIONS: ReservationStatus[] = ["confirmed", "cancelled", "needs_human"];

// Finish a simulated call: close the call_attempts row and, for a decision outcome,
// flip the linked reservation's status (the updated_at trigger handles timestamps).
export async function POST(request: Request) {
  let body: {
    call_id?: string;
    reservation_id?: string | null;
    outcome?: CallOutcome;
    intent?: string;
    confidence?: number;
    duration_seconds?: number;
    cost_usd?: number;
    decision?: ReservationStatus;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { call_id: callId, outcome } = body;
  if (!callId || typeof callId !== "string") {
    return Response.json({ error: "call_id is required" }, { status: 400 });
  }
  if (!outcome) {
    return Response.json({ error: "outcome is required" }, { status: 400 });
  }

  const db = getAdminClient();

  const { error: callErr } = await db
    .from("call_attempts")
    .update({
      outcome,
      intent: body.intent ?? null,
      confidence: body.confidence ?? null,
      ended_at: new Date().toISOString(),
      duration_seconds: body.duration_seconds ?? null,
      cost_usd: body.cost_usd ?? null,
    })
    .eq("id", callId);

  if (callErr) {
    return Response.json({ error: callErr.message }, { status: 500 });
  }

  if (body.reservation_id && body.decision && DECISIONS.includes(body.decision)) {
    const { error: resErr } = await db
      .from("reservations")
      .update({ status: body.decision })
      .eq("id", body.reservation_id);
    if (resErr) {
      return Response.json({ error: resErr.message }, { status: 500 });
    }
  }

  nudge();
  return Response.json({ ok: true });
}
