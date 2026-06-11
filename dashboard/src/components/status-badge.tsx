import { Badge } from "./ui/badge";
import {
  OUTCOME_COLOR,
  OUTCOME_HE,
  RESERVATION_STATUS_HE,
  STATUS_COLOR,
} from "@/lib/format";
import type { CallOutcome, ReservationStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: ReservationStatus }) {
  return <Badge className={STATUS_COLOR[status]}>{RESERVATION_STATUS_HE[status]}</Badge>;
}

export function OutcomeBadge({ outcome }: { outcome: CallOutcome | null }) {
  if (!outcome) {
    return <Badge className="bg-zinc-400/10 text-zinc-400 ring-zinc-400/20">בתהליך</Badge>;
  }
  return <Badge className={OUTCOME_COLOR[outcome]}>{OUTCOME_HE[outcome]}</Badge>;
}
