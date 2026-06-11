// Pure builder for the simulated outbound confirmation call.
// The Demo Driver plays these turns one-by-one (writing each to Supabase) so the
// live view streams a believable Hebrew confirmation. Unit-tested in demo-script.test.ts.

import type { Reservation, TranscriptTurn } from "./types";

/** HH:MM for the reservation time, in the restaurant's timezone (Asia/Jerusalem). */
export function formatTimeHM(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jerusalem",
  }).format(new Date(iso));
}

/**
 * Scripted Hebrew confirmation dialog for one reservation.
 * ts_ms are relative offsets from call start; the driver paces playback by them.
 */
export function buildConfirmScript(reservation: Reservation): TranscriptTurn[] {
  const name = reservation.customer?.name ?? "אורח";
  const time = formatTimeHM(reservation.reserved_for);
  const party = reservation.party_size;

  return [
    {
      role: "agent",
      text: `שלום ${name}, מדבר העוזר הקולי של מסעדת לבונטין. מתקשר לאשר את ההזמנה שלך להערב לשעה ${time} ל-${party} סועדים.`,
      ts_ms: 1000,
      intent: "greeting",
      confidence: 0.98,
    },
    {
      role: "customer",
      text: "כן, מצוין, אנחנו מגיעים.",
      ts_ms: 6200,
      intent: "confirm",
      confidence: 0.96,
    },
    {
      role: "agent",
      text: `יופי, אישרתי שולחן ל-${party} בשעה ${time}. נתראה הערב, ערב טוב!`,
      ts_ms: 10400,
      intent: "readback",
      confidence: 0.97,
    },
    {
      role: "customer",
      text: "תודה רבה, להתראות.",
      ts_ms: 14600,
      intent: "closing",
      confidence: 0.95,
    },
  ];
}

/** Outcome metadata written when the simulated call finishes. */
export function confirmCallSummary(turns: TranscriptTurn[]) {
  const lastTs = turns.length ? turns[turns.length - 1].ts_ms : 0;
  return {
    outcome: "confirmed" as const,
    decision: "confirmed" as const,
    intent: "confirm_reservation",
    confidence: 0.96,
    durationSeconds: Math.max(1, Math.round((lastTs + 1500) / 1000)),
    costUsd: 0.0125,
  };
}
