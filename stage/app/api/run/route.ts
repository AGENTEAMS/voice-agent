import { NextResponse } from "next/server";
import { ENV } from "@/lib/env";
import { triggerRun } from "@/lib/run";

// Reset-on-START, then fire the n8n batch. The board lights from Supabase Realtime.
export async function POST() {
  const result = await triggerRun({
    supabaseUrl: ENV.SUPABASE_URL,
    serviceKey: ENV.SUPABASE_SERVICE_ROLE_KEY,
    webhookUrl: ENV.N8N_WEBHOOK_URL,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
