// Pure KPI aggregation — no I/O, unit-tested in lib/kpis.test.ts.

import type { CallAttempt, Kpis, Reservation } from "./types";

const DECISION_OUTCOMES = new Set(["confirmed", "cancelled", "needs_human"]);

// The restaurant's timezone — "today" is always evaluated here, not in the host's
// timezone, so KPIs stay correct on a UTC server (e.g. Vercel).
const RESTAURANT_TZ = "Asia/Jerusalem";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: RESTAURANT_TZ });

/** A call is "today" if it started on the current date in the restaurant's timezone. */
function isToday(iso: string, now: Date): boolean {
  return dayFmt.format(new Date(iso)) === dayFmt.format(now);
}

export function computeKpis(
  calls: CallAttempt[],
  reservations: Reservation[],
  now: Date = new Date(),
): Kpis {
  const today = calls.filter((c) => isToday(c.started_at, now));

  const confirmedReservations = reservations.filter((r) => r.status === "confirmed").length;
  const cancelledReservations = reservations.filter((r) => r.status === "cancelled").length;
  const pending = reservations.filter((r) => r.status === "pending").length;
  const needsHuman = reservations.filter((r) => r.status === "needs_human").length;

  const outbound = today.filter((c) => c.direction === "outbound");
  const decided = outbound.filter((c) => c.outcome && DECISION_OUTCOMES.has(c.outcome));
  const confirmedCalls = outbound.filter((c) => c.outcome === "confirmed").length;
  const noAnswer = outbound.filter((c) => c.outcome === "no_answer").length;

  const completed = today.filter((c) => typeof c.duration_seconds === "number");
  const totalDuration = completed.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0);

  const totalSpend = today.reduce((sum, c) => sum + (c.cost_usd ?? 0), 0);
  const inProgress = calls.filter((c) => c.ended_at === null).length;

  return {
    callsToday: today.length,
    confirmed: confirmedReservations,
    cancelled: cancelledReservations,
    pending,
    needsHuman,
    confirmationRate: decided.length === 0 ? 0 : confirmedCalls / decided.length,
    noAnswerRate: outbound.length === 0 ? 0 : noAnswer / outbound.length,
    avgDurationSeconds: completed.length === 0 ? 0 : Math.round(totalDuration / completed.length),
    totalSpendUsd: Number(totalSpend.toFixed(4)),
    inProgress,
  };
}
