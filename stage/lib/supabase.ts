"use client";

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { realtime: { params: { eventsPerSecond: 20 } } }
);

export function subscribeStage(handlers: {
  onToolEvent: (toolName: string, payload: unknown) => void;
  onReservationChange: (row: { id: string; status: string }) => void;
}) {
  const ch = supabase
    .channel("stage")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tool_events" },
      (p) => {
        const row = p.new as { tool_name: string; payload: unknown };
        handlers.onToolEvent(row.tool_name, row.payload);
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
