// Display helpers + Hebrew labels/colors. Pure (no JSX) so any module can import.

import type { CallOutcome, CallDirection, ReservationStatus } from "./types";

export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jerusalem",
  }).format(new Date(iso));
}

export function formatCurrency(usd: number): string {
  return `$${usd.toFixed(3)}`;
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const RESERVATION_STATUS_HE: Record<ReservationStatus, string> = {
  pending: "ממתין",
  confirmed: "אושר",
  cancelled: "בוטל",
  no_show: "לא הגיע",
  arrived: "הגיע",
  needs_human: "דרוש נציג",
};

export const OUTCOME_HE: Record<CallOutcome, string> = {
  confirmed: "אושר",
  cancelled: "בוטל",
  no_answer: "אין מענה",
  voicemail: "תא קולי",
  failed: "נכשל",
  answered_inbound: "נענתה",
  needs_human: "דרוש נציג",
};

export const DIRECTION_HE: Record<CallDirection, string> = {
  outbound: "יוצאת",
  inbound: "נכנסת",
};

/** Tailwind class fragments for status/outcome chips (dark UI). */
export const STATUS_COLOR: Record<ReservationStatus, string> = {
  pending: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  confirmed: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
  cancelled: "bg-rose-400/15 text-rose-300 ring-rose-400/30",
  no_show: "bg-zinc-400/15 text-zinc-300 ring-zinc-400/30",
  arrived: "bg-sky-400/15 text-sky-300 ring-sky-400/30",
  needs_human: "bg-fuchsia-400/15 text-fuchsia-300 ring-fuchsia-400/30",
};

export const OUTCOME_COLOR: Record<CallOutcome, string> = {
  confirmed: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
  cancelled: "bg-rose-400/15 text-rose-300 ring-rose-400/30",
  no_answer: "bg-zinc-400/15 text-zinc-300 ring-zinc-400/30",
  voicemail: "bg-indigo-400/15 text-indigo-300 ring-indigo-400/30",
  failed: "bg-rose-500/15 text-rose-400 ring-rose-500/30",
  answered_inbound: "bg-sky-400/15 text-sky-300 ring-sky-400/30",
  needs_human: "bg-fuchsia-400/15 text-fuchsia-300 ring-fuchsia-400/30",
};

export function confidenceColor(confidence: number | null): string {
  if (confidence == null) return "text-zinc-400";
  if (confidence >= 0.85) return "text-emerald-300";
  if (confidence >= 0.7) return "text-amber-300";
  return "text-rose-300";
}
