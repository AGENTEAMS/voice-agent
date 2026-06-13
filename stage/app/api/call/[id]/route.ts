import { NextResponse } from "next/server";
import { ENV } from "@/lib/env";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}`, {
    headers: { "xi-api-key": ENV.ELEVENLABS_API_KEY },
    cache: "no-store",
  });
  if (!r.ok) {
    return NextResponse.json({ error: `elevenlabs ${r.status}` }, { status: 502 });
  }
  const body = await r.json();
  // Best-effort transfer detection (system tool leaves no DB trace).
  const transferred = JSON.stringify(body.transcript ?? []).includes("transfer_to_number");
  return NextResponse.json({ status: body.status, transferred });
}
