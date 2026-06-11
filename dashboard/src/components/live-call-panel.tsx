import { Card, CardHeader } from "./ui/card";
import { TranscriptView } from "./transcript-view";
import { DIRECTION_HE } from "@/lib/format";
import type { CallAttempt, Reservation } from "@/lib/types";

export function LiveCallPanel({
  call,
  reservations,
}: {
  call: CallAttempt | null;
  reservations: Reservation[];
}) {
  if (!call) {
    return (
      <Card>
        <CardHeader title="שיחה חיה" sub="לחיצה על «התקשר עכשיו» תפעיל שיחת אישור" />
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
          <span className="text-3xl opacity-40">☎️</span>
          <p className="text-xs text-zinc-500">אין שיחה פעילה כרגע</p>
        </div>
      </Card>
    );
  }

  const reservation = reservations.find((r) => r.id === call.reservation_id);
  const name = call.customer_name ?? reservation?.customer?.name ?? "שיחה נכנסת";
  const phone = reservation?.customer?.phone;

  return (
    <Card className="ring-1 ring-emerald-400/20">
      <CardHeader
        title="שיחה חיה"
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            מחובר · {DIRECTION_HE[call.direction]}
          </span>
        }
      />
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400/15 text-sm font-bold text-amber-300">
          {name.charAt(0)}
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100">{name}</p>
          {phone && (
            <p className="text-[11px] text-zinc-500" dir="ltr">
              <bdi>{phone}</bdi>
            </p>
          )}
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto px-4 py-3">
        <TranscriptView turns={call.transcript} live />
      </div>
    </Card>
  );
}
