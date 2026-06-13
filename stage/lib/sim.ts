export type SimStep =
  | { type: "call"; state: "dialing" | "live" | "resolved" | "idle"; delayMs: number }
  | { type: "tool"; tool: string; delayMs: number; label: string }
  | { type: "reservation"; status: "confirmed"; time: string; delayMs: number };

// Timings mirror a real measured call (dial ~4s, ~39s total) — the negotiation
// story: 21:00 full → 21:30 offered → changed → confirmed.
export const SIM_SCRIPT: SimStep[] = [
  { type: "call", state: "dialing", delayMs: 0 },
  { type: "call", state: "live", delayMs: 4200 },
  { type: "tool", tool: "check_availability", delayMs: 12000, label: "בודקת זמינות ל־21:00…" },
  { type: "tool", tool: "check_availability", delayMs: 17500, label: "בודקת חלופה — 21:30…" },
  { type: "tool", tool: "change_reservation", delayMs: 24000, label: "מעדכנת ל־21:30 · ארבעה סועדים" },
  { type: "tool", tool: "apply_call_result", delayMs: 31000, label: "מאשרת את ההזמנה" },
  { type: "reservation", status: "confirmed", time: "21:30", delayMs: 33000 },
  { type: "call", state: "resolved", delayMs: 34000 },
  { type: "call", state: "idle", delayMs: 38000 },
];
