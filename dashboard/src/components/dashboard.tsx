"use client";
import { useCallback, useMemo, useState } from "react";
import { useLiveData } from "./use-live-data";
import { ConnectionIndicator } from "./connection-indicator";
import { KpiBar } from "./kpi-bar";
import { ReservationsBoard } from "./reservations-board";
import { LiveCallPanel } from "./live-call-panel";
import { CallLog } from "./call-log";
import { TranscriptDrawer } from "./transcript-drawer";
import { Card, CardHeader } from "./ui/card";
import { runSimulation } from "@/lib/simulate-client";
import type { CallAttempt, Reservation, Snapshot } from "@/lib/types";

export function Dashboard({ initial }: { initial: Snapshot }) {
  const { snapshot, connected } = useLiveData();
  const data = snapshot ?? initial;

  const [simulatingId, setSimulatingId] = useState<string | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const activeCall = useMemo<CallAttempt | null>(
    () => data.calls.find((c) => c.ended_at === null) ?? null,
    [data.calls],
  );

  // Resolve the drawer's call from the live snapshot so an open transcript keeps streaming.
  const selectedCall = useMemo<CallAttempt | null>(
    () => (selectedCallId ? data.calls.find((c) => c.id === selectedCallId) ?? null : null),
    [selectedCallId, data.calls],
  );

  const onSimulate = useCallback(
    async (reservation: Reservation) => {
      if (simulatingId) return;
      setSimulatingId(reservation.id);
      try {
        await runSimulation(reservation);
      } catch (err) {
        console.error("simulation failed:", err);
      } finally {
        setSimulatingId(null);
      }
    },
    [simulatingId],
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-lg font-black text-zinc-950">
            M
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-zinc-50">
              Maître <span className="text-zinc-500">·</span>{" "}
              <span className="text-amber-300">{data.restaurantName}</span>
            </h1>
            <p className="text-xs text-zinc-500">לוח בקרה לסוכן הקולי · אישור הזמנות בעברית</p>
          </div>
        </div>
        <ConnectionIndicator connected={connected} />
      </header>

      <KpiBar kpis={data.kpis} />

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <Card>
            <CardHeader
              title="הזמנות היום"
              sub={`${data.reservations.length} הזמנות · ${data.kpis.pending} ממתינות לאישור`}
            />
            <div className="p-4">
              <ReservationsBoard
                reservations={data.reservations}
                onSimulate={onSimulate}
                busy={simulatingId !== null}
                simulatingId={simulatingId}
              />
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-4">
          <LiveCallPanel call={activeCall} reservations={data.reservations} />
          <CallLog calls={data.calls} onSelect={(c) => setSelectedCallId(c.id)} selectedId={selectedCallId} />
        </section>
      </div>

      <TranscriptDrawer
        call={selectedCall}
        reservations={data.reservations}
        onClose={() => setSelectedCallId(null)}
      />
    </div>
  );
}
