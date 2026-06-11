// Seed demo call history via the service-role key (PostgREST) — no psql/DB password needed.
// Re-runnable: deletes provider='seed' rows first, never touches real/live calls.
// Run: node scripts/seed-calls.mjs   (reads dashboard/.env.local)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));

// Minimal .env.local loader (KEY=VALUE, ignores comments/blank lines).
function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnv(join(here, "..", ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const restaurantId = env.NEXT_PUBLIC_RESTAURANT_ID ?? "11111111-1111-1111-1111-111111111111";

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

// Outbound calls keyed by customer name; outcomes match the seed reservation statuses.
const OUTBOUND = [
  {
    name: "דניאל בן דוד",
    outcome: "confirmed", decision: "confirmed", intent: "confirm_reservation", confidence: 0.96,
    startMin: 52, duration: 41, cost: 0.0131,
    transcript: [
      { role: "agent", text: "שלום דניאל, מדבר העוזר הקולי של מסעדת לבונטין. מתקשר לאשר את ההזמנה שלך להערב לשישה סועדים בשעה 20:00.", ts_ms: 900, intent: "greeting", confidence: 0.99 },
      { role: "customer", text: "כן בטח, אנחנו מגיעים.", ts_ms: 5200, intent: "confirm", confidence: 0.97 },
      { role: "agent", text: "מצוין, אישרתי שולחן לשישה בשעה 20:00. נתראה הערב, ערב טוב!", ts_ms: 9100, intent: "readback", confidence: 0.96 },
    ],
  },
  {
    name: "תמר שפירא",
    outcome: "cancelled", decision: "cancelled", intent: "cancel_reservation", confidence: 0.93,
    startMin: 48, duration: 36, cost: 0.0118,
    transcript: [
      { role: "agent", text: "שלום תמר, מדבר העוזר הקולי של מסעדת לבונטין. מתקשר לאשר את ההזמנה שלך להערב בשעה 21:00.", ts_ms: 800, intent: "greeting", confidence: 0.98 },
      { role: "customer", text: "אה, האמת שאני צריכה לבטל, צצה לי תוכנית אחרת.", ts_ms: 4800, intent: "cancel", confidence: 0.94 },
      { role: "agent", text: "אין בעיה, ביטלתי את ההזמנה. הביטול ללא עלות. תודה שעדכנת ויום נעים!", ts_ms: 9300, intent: "readback", confidence: 0.95 },
    ],
  },
  {
    name: "אורי חדד",
    outcome: "needs_human", decision: "needs_human", intent: "unclear", confidence: 0.52,
    startMin: 40, duration: 49, cost: 0.0152,
    transcript: [
      { role: "agent", text: "שלום אורי, מתקשר לאשר את ההזמנה שלך להערב בשעה 21:30.", ts_ms: 850, intent: "greeting", confidence: 0.97 },
      { role: "customer", text: "רגע, אני צריך לבדוק אם נשנה את מספר האנשים ואולי את השעה, זה מסובך... אפשר לדבר עם מישהו?", ts_ms: 5600, intent: "complex_request", confidence: 0.58 },
      { role: "agent", text: "בהחלט, אני מעביר אותך לצוות המסעדה שיסייע לך. רגע אחד בבקשה.", ts_ms: 11200, intent: "handoff", confidence: 0.9 },
    ],
  },
  {
    name: "איתי כהן",
    outcome: "no_answer", intent: null, confidence: null,
    startMin: 35, duration: 27, cost: 0.0041, transcript: [],
  },
  {
    name: "מאיה אזולאי",
    outcome: "voicemail", intent: null, confidence: null,
    startMin: 31, duration: 19, cost: 0.0067,
    transcript: [
      { role: "agent", text: "שלום מאיה, מדבר העוזר הקולי של מסעדת לבונטין בנוגע להזמנה שלך להערב. נשמח שתחזרי אלינו לאישור. תודה!", ts_ms: 1200, intent: "voicemail_left", confidence: 0.9 },
    ],
  },
  {
    name: "רוני גולן",
    outcome: "no_answer", intent: null, confidence: null,
    startMin: 24, duration: 30, cost: 0.0045, transcript: [],
  },
];

const INBOUND = [
  {
    outcome: "answered_inbound", intent: "hours", confidence: 0.94,
    startMin: 18, duration: 28, cost: 0.0089,
    transcript: [
      { role: "customer", text: "שלום, מה שעות הפתיחה שלכם היום?", ts_ms: 1100, intent: "hours", confidence: 0.95 },
      { role: "agent", text: "שלום! היום אנחנו פתוחים מ-12:00 בצהריים עד 23:00 בלילה. אפשר לעזור בעוד משהו?", ts_ms: 4200, intent: "answer", confidence: 0.94 },
      { role: "customer", text: "לא, תודה רבה!", ts_ms: 8000, intent: "closing", confidence: 0.96 },
    ],
  },
  {
    outcome: "answered_inbound", intent: "cancellation", confidence: 0.91,
    startMin: 9, duration: 22, cost: 0.0072,
    transcript: [
      { role: "customer", text: "אם אני מבטל, יש דמי ביטול?", ts_ms: 1000, intent: "cancellation", confidence: 0.92 },
      { role: "agent", text: "אפשר לבטל ללא עלות עד שעתיים לפני מועד ההזמנה. ביטול מאוחר יותר עשוי לחייב דמי ביטול.", ts_ms: 4500, intent: "answer", confidence: 0.93 },
    ],
  },
];

async function main() {
  const { error: delErr } = await db.from("call_attempts").delete().eq("provider", "seed");
  if (delErr) throw delErr;

  const { data: reservations, error: resErr } = await db
    .from("reservations")
    .select("id, customer_id, status, customer:customers(name)")
    .eq("restaurant_id", restaurantId);
  if (resErr) throw resErr;

  const byName = new Map();
  for (const r of reservations) {
    if (r.customer?.name) byName.set(r.customer.name, { reservation_id: r.id, customer_id: r.customer_id });
  }

  // Reconcile reservation statuses so the demo state is deterministic and the call
  // outcomes stay consistent with it (DB may have drifted from supabase/seed.sql).
  const decisionByName = new Map(
    OUTBOUND.filter((c) => c.decision).map((c) => [c.name, c.decision]),
  );
  for (const r of reservations) {
    const desired = decisionByName.get(r.customer?.name ?? "") ?? "pending";
    if (r.status !== desired) {
      const { error } = await db.from("reservations").update({ status: desired }).eq("id", r.id);
      if (error) throw error;
    }
  }

  const rows = [];
  for (const c of OUTBOUND) {
    const ref = byName.get(c.name);
    if (!ref) {
      console.warn(`! no reservation for ${c.name} — skipping`);
      continue;
    }
    rows.push({
      reservation_id: ref.reservation_id, customer_id: ref.customer_id,
      direction: "outbound", outcome: c.outcome, intent: c.intent, confidence: c.confidence,
      transcript: c.transcript, started_at: minutesAgo(c.startMin),
      ended_at: minutesAgo(c.startMin - 1), duration_seconds: c.duration, cost_usd: c.cost, provider: "seed",
    });
  }
  for (const c of INBOUND) {
    rows.push({
      reservation_id: null, customer_id: null,
      direction: "inbound", outcome: c.outcome, intent: c.intent, confidence: c.confidence,
      transcript: c.transcript, started_at: minutesAgo(c.startMin),
      ended_at: minutesAgo(c.startMin - 1), duration_seconds: c.duration, cost_usd: c.cost, provider: "seed",
    });
  }

  const { error: insErr } = await db.from("call_attempts").insert(rows);
  if (insErr) throw insErr;
  console.log(`✓ seeded ${rows.length} demo call_attempts`);
}

main().catch((e) => {
  console.error("✗ seed failed:", e.message);
  process.exit(1);
});
