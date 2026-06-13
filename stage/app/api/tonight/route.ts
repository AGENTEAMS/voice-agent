import { NextResponse } from "next/server";
import { ENV } from "@/lib/env";

// Everything the tonight page needs in one call: reservations, today's
// scheduled callbacks, and which reservations had a time-change (tool_events).
export async function GET() {
  const sb = {
    apikey: ENV.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(
    new Date()
  );
  const base = `${ENV.SUPABASE_URL}/rest/v1`;
  const day = `gte.${today}T00:00:00%2B03:00`;

  const [resv, callbacks, changes] = await Promise.all([
    fetch(
      `${base}/reservations?restaurant_id=eq.${ENV.RESTAURANT_ID}` +
        `&reserved_for=${day}&reserved_for=lte.${today}T23:59:59%2B03:00` +
        `&select=id,reserved_for,party_size,status,updated_at,customers(name,phone)` +
        `&order=reserved_for.asc`,
      { headers: sb, cache: "no-store" }
    ).then((r) => r.json()),
    fetch(
      `${base}/scheduled_calls?restaurant_id=eq.${ENV.RESTAURANT_ID}` +
        `&created_at=${day}&select=id,kind,status,scheduled_for,reason,` +
        `reservations(id,customers(name))&order=scheduled_for.asc`,
      { headers: sb, cache: "no-store" }
    ).then((r) => r.json()),
    fetch(
      `${base}/tool_events?tool_name=eq.change_reservation&created_at=${day}` +
        `&select=reservation_id,payload,created_at&order=created_at.asc`,
      { headers: sb, cache: "no-store" }
    ).then((r) => r.json()),
  ]);

  return NextResponse.json({
    reservations: Array.isArray(resv) ? resv : [],
    callbacks: Array.isArray(callbacks) ? callbacks : [],
    changedIds: Array.isArray(changes)
      ? [...new Set(changes.map((c: { reservation_id: string | null }) => c.reservation_id).filter(Boolean))]
      : [],
  });
}
