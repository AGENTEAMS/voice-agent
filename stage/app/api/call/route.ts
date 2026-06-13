import { NextResponse } from "next/server";
import { ENV } from "@/lib/env";
import { resolveTarget } from "@/lib/callPolicy";
import { spokenTimeHe, spokenPartyHe } from "@/lib/spoken";

const TZ = "Asia/Jerusalem";

function tzParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    hhmm: `${get("hour")}:${get("minute")}`,
  };
}

export async function POST(req: Request) {
  const { reservation_id } = await req.json();
  if (!reservation_id) {
    return NextResponse.json({ error: "reservation_id required" }, { status: 400 });
  }

  const sb = {
    apikey: ENV.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const r = await fetch(
    `${ENV.SUPABASE_URL}/rest/v1/reservations?id=eq.${reservation_id}` +
      `&select=reserved_for,party_size,customers(name,phone)`,
    { headers: sb, cache: "no-store" }
  );
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "reservation not found" }, { status: 404 });
  }
  const row = rows[0];

  const target = resolveTarget(row.customers?.phone ?? "", ENV.STAGE_CALL_TARGET);
  if (!target.ok) {
    return NextResponse.json({ error: target.reason }, { status: 403 });
  }

  const res = tzParts(new Date(row.reserved_for));
  const now = tzParts(new Date());
  const dyn = {
    customer_name: row.customers?.name ?? "אורח",
    reservation_time: res.hhmm,
    reservation_time_spoken: spokenTimeHe(res.hour, res.minute),
    party_size: String(row.party_size),
    party_size_spoken: spokenPartyHe(Number(row.party_size)),
    reservation_id,
    today: now.date,
    now_local: `${now.date}T${now.hhmm}:00+03:00`,
  };

  const el = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: { "xi-api-key": ENV.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: ENV.AGENT_ID,
      agent_phone_number_id: ENV.PHONE_NUMBER_ID,
      to_number: target.to,
      conversation_initiation_client_data: { dynamic_variables: dyn },
    }),
  });
  if (!el.ok) {
    return NextResponse.json(
      { error: `elevenlabs ${el.status}`, detail: await el.text() },
      { status: 502 }
    );
  }
  const body = await el.json();
  return NextResponse.json({
    conversation_id: body.conversation_id,
    call_sid: body.callSid,
  });
}
