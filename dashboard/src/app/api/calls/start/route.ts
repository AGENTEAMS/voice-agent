import { getAdminClient } from "@/lib/supabase-admin";
import { nudge } from "@/lib/live-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Begin a simulated outbound call: insert an in-progress call_attempts row (no ended_at).
export async function POST(request: Request) {
  let body: { reservation_id?: string; customer_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const reservationId = body.reservation_id;
  if (!reservationId || typeof reservationId !== "string") {
    return Response.json({ error: "reservation_id is required" }, { status: 400 });
  }

  const db = getAdminClient();
  const { data, error } = await db
    .from("call_attempts")
    .insert({
      reservation_id: reservationId,
      customer_id: body.customer_id ?? null,
      direction: "outbound",
      transcript: [],
      provider: "livekit",
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  nudge();
  return Response.json({ call_id: data.id });
}
