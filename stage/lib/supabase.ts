"use client";

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { realtime: { params: { eventsPerSecond: 20 } } }
);

let channelSeq = 0;

export function subscribeStage(handlers: {
  onToolEvent: (toolName: string, payload: unknown, reservationId: string | null) => void;
  onReservationChange: (row: { id: string; status: string }) => void;
}) {
  // Unique name per subscription: channel("stage") would return the SAME
  // instance on remount/second page and throw "cannot add callbacks after
  // subscribe()". Each subscriber owns and removes its own channel.
  const ch = supabase
    .channel(`stage-${++channelSeq}-${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tool_events" },
      (p) => {
        const row = p.new as {
          tool_name: string;
          payload: unknown;
          reservation_id: string | null;
        };
        handlers.onToolEvent(row.tool_name, row.payload, row.reservation_id);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "reservations" },
      (p) => handlers.onReservationChange(p.new as { id: string; status: string })
    )
    .subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}
