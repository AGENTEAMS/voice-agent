import { ReservationCard } from "./reservation-card";
import { cn } from "@/lib/cn";
import type { Reservation, ReservationStatus } from "@/lib/types";

const COLUMNS: { status: ReservationStatus; label: string; dot: string }[] = [
  { status: "needs_human", label: "דרוש נציג", dot: "bg-fuchsia-400" },
  { status: "pending", label: "ממתינות", dot: "bg-amber-400" },
  { status: "confirmed", label: "אושרו", dot: "bg-emerald-400" },
  { status: "cancelled", label: "בוטלו", dot: "bg-rose-400" },
];

export function ReservationsBoard({
  reservations,
  onSimulate,
  busy,
  simulatingId,
}: {
  reservations: Reservation[];
  onSimulate: (r: Reservation) => void;
  busy: boolean;
  simulatingId: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = reservations.filter((r) => r.status === col.status);
        return (
          <div key={col.status} className="flex flex-col">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className={cn("h-2 w-2 rounded-full", col.dot)} />
              <h3 className="text-xs font-semibold text-zinc-300">{col.label}</h3>
              <span className="rounded-full bg-white/[0.05] px-1.5 text-[11px] tabular-nums text-zinc-400">
                <bdi>{items.length}</bdi>
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {items.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/[0.06] px-3 py-6 text-center text-[11px] text-zinc-600">
                  אין הזמנות
                </p>
              )}
              {items.map((r) => (
                <ReservationCard
                  key={r.id}
                  reservation={r}
                  onSimulate={onSimulate}
                  busy={busy}
                  simulatingThis={simulatingId === r.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
