import { NextResponse } from "next/server";
import { ENV } from "@/lib/env";

// Tonight's reservations for the strip (service key stays server-side).
export async function GET() {
  const sb = {
    apikey: ENV.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(
    new Date()
  );
  const url =
    `${ENV.SUPABASE_URL}/rest/v1/reservations` +
    `?restaurant_id=eq.${ENV.RESTAURANT_ID}` +
    `&reserved_for=gte.${today}T00:00:00%2B03:00` +
    `&reserved_for=lte.${today}T23:59:59%2B03:00` +
    `&select=id,reserved_for,party_size,status,updated_at,customers(name,phone)` +
    `&order=reserved_for.asc`;
  const r = await fetch(url, { headers: sb, cache: "no-store" });
  if (!r.ok) {
    return NextResponse.json({ error: `supabase ${r.status}` }, { status: 502 });
  }
  return NextResponse.json(await r.json());
}
