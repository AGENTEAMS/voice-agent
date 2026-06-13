export type NodeId =
  | "check_availability"
  | "change_reservation"
  | "set_reservation_status"
  | "schedule_callback"
  | "transfer_to_human";

export type CallState = "idle" | "dialing" | "live" | "resolved";
export type StageEvent = { kind: "tool"; tool: string; at: number };
export type FiredPulse = { node: NodeId; writes: boolean; t: number };

// RPC/tool name → display node + whether it writes to the DB (green continuation).
export const NODE_FOR_TOOL: Record<string, { node: NodeId; writes: boolean }> = {
  check_availability: { node: "check_availability", writes: false },
  change_reservation: { node: "change_reservation", writes: true },
  apply_call_result: { node: "set_reservation_status", writes: true },
  schedule_call: { node: "schedule_callback", writes: true },
  transfer_to_human: { node: "transfer_to_human", writes: false },
};

export const MIN_GAP_MS = 250;

export function createEngine(onFire: (p: FiredPulse) => void) {
  let call: CallState = "idle";
  const queue: FiredPulse[] = [];
  let lastFiredAt = -Infinity;

  return {
    state: () => call,
    setCall(s: CallState) {
      call = s;
    },
    push(e: StageEvent) {
      const m = NODE_FOR_TOOL[e.tool];
      if (!m) return;
      queue.push({ node: m.node, writes: m.writes, t: e.at });
    },
    /** Advance to wall-clock `now`; fires due pulses, serialized ≥MIN_GAP_MS apart. */
    tick(now: number) {
      while (queue.length && queue[0].t <= now) {
        const next = queue.shift()!;
        const fireAt = Math.max(next.t, lastFiredAt + MIN_GAP_MS);
        if (fireAt > now) {
          queue.unshift({ ...next, t: fireAt });
          break;
        }
        lastFiredAt = fireAt;
        onFire({ ...next, t: fireAt });
      }
    },
  };
}
