import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { StatusBadge } from "./status-badge";
import { formatClock } from "@/lib/format";
import type { Reservation } from "@/lib/types";

export function ReservationCard({
  reservation,
  onSimulate,
  busy,
  simulatingThis,
}: {
  reservation: Reservation;
  onSimulate: (r: Reservation) => void;
  busy: boolean;
  simulatingThis: boolean;
}) {
  const name = reservation.customer?.name ?? "אורח";
  const notes = reservation.customer?.notes;
  const phone = reservation.customer?.phone;

  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">{name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="text-base font-bold tabular-nums text-amber-300">
              <bdi>{formatClock(reservation.reserved_for)}</bdi>
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              <bdi>{reservation.party_size}</bdi> סועדים
            </span>
          </p>
        </div>
        <StatusBadge status={reservation.status} />
      </div>

      {notes && (
        <p className="mt-2 inline-flex rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-300 ring-1 ring-inset ring-white/5">
          {notes}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        {phone && (
          <span className="text-[11px] text-zinc-600" dir="ltr">
            <bdi>{phone}</bdi>
          </span>
        )}
        {reservation.status === "pending" && (
          <Button
            variant="primary"
            className="ms-auto"
            disabled={busy}
            onClick={() => onSimulate(reservation)}
          >
            {simulatingThis ? (
              <>
                <Spinner /> מתקשר…
              </>
            ) : (
              <>📞 התקשר עכשיו</>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-zinc-900/40 border-t-zinc-900" />
  );
}
