import { getAdminClient } from "@/lib/supabase-admin";
import { nudge } from "@/lib/live-store";
import type { TranscriptTurn } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Append one transcript turn to an in-progress call (read-modify-write on the jsonb column).
export async function POST(request: Request) {
  let body: { call_id?: string; turn?: TranscriptTurn };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { call_id: callId, turn } = body;
  if (!callId || typeof callId !== "string") {
    return Response.json({ error: "call_id is required" }, { status: 400 });
  }
  if (!turn || typeof turn.text !== "string" || (turn.role !== "agent" && turn.role !== "customer")) {
    return Response.json({ error: "valid turn { role, text } is required" }, { status: 400 });
  }

  const db = getAdminClient();
  const { data: existing, error: readErr } = await db
    .from("call_attempts")
    .select("transcript")
    .eq("id", callId)
    .single();

  if (readErr) {
    return Response.json({ error: readErr.message }, { status: 404 });
  }

  const transcript: TranscriptTurn[] = Array.isArray(existing.transcript) ? existing.transcript : [];
  transcript.push(turn);

  const { error: writeErr } = await db
    .from("call_attempts")
    .update({ transcript })
    .eq("id", callId);

  if (writeErr) {
    return Response.json({ error: writeErr.message }, { status: 500 });
  }

  nudge();
  return Response.json({ ok: true, turns: transcript.length });
}
