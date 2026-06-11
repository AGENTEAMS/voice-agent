// Shared types mirroring the Supabase schema (supabase/migrations/0001_init.sql).
// Only the fields the dashboard renders are modelled.

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "no_show"
  | "arrived"
  | "needs_human";

export type CallDirection = "outbound" | "inbound";

export type CallOutcome =
  | "confirmed"
  | "cancelled"
  | "no_answer"
  | "voicemail"
  | "failed"
  | "answered_inbound"
  | "needs_human";

export interface TranscriptTurn {
  role: "agent" | "customer";
  text: string;
  ts_ms: number;
  intent?: string | null;
  confidence?: number | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
}

/** A reservation joined with its customer, as the dashboard consumes it. */
export interface Reservation {
  id: string;
  reserved_for: string; // ISO timestamptz
  party_size: number;
  status: ReservationStatus;
  source: string | null;
  customer: Customer | null;
}

export interface CallAttempt {
  id: string;
  reservation_id: string | null;
  customer_id: string | null;
  direction: CallDirection;
  outcome: CallOutcome | null;
  intent: string | null;
  confidence: number | null;
  transcript: TranscriptTurn[];
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  cost_usd: number | null;
  provider: string | null;
  /** Joined customer name when available (cold inbound calls have none). */
  customer_name: string | null;
}

export interface Kpis {
  callsToday: number;
  confirmed: number;
  cancelled: number;
  pending: number;
  needsHuman: number;
  confirmationRate: number; // 0..1 over decided outbound calls
  noAnswerRate: number; // 0..1 over outbound calls
  avgDurationSeconds: number;
  totalSpendUsd: number;
  inProgress: number;
}

export interface Snapshot {
  version: number;
  restaurantName: string;
  reservations: Reservation[];
  calls: CallAttempt[];
  kpis: Kpis;
  /** ISO time the snapshot was built (server clock). */
  builtAt: string;
}
