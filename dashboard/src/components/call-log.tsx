import { Card, CardHeader } from "./ui/card";
import { OutcomeBadge } from "./status-badge";
import { cn } from "@/lib/cn";
import {
  DIRECTION_HE,
  confidenceColor,
  formatClock,
  formatCurrency,
  formatDuration,
  formatPercent,
} from "@/lib/format";
import type { CallAttempt } from "@/lib/types";

export function CallLog({
  calls,
  onSelect,
  selectedId,
}: {
  calls: CallAttempt[];
  onSelect: (c: CallAttempt) => void;
  selectedId: string | null;
}) {
  return (
    <Card>
      <CardHeader title="יומן שיחות" sub={`${calls.length} שיחות`} />
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full text-right text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-900/90 text-[11px] text-zinc-500 backdrop-blur">
            <tr>
              <th className="px-3 py-2 font-medium">שעה</th>
              <th className="px-3 py-2 font-medium">לקוח</th>
              <th className="px-3 py-2 font-medium">כיוון</th>
              <th className="px-3 py-2 font-medium">תוצאה</th>
              <th className="px-3 py-2 font-medium">ביטחון</th>
              <th className="px-3 py-2 font-medium">משך</th>
              <th className="px-3 py-2 font-medium">עלות</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <tr
                key={c.id}
                onClick={() => onSelect(c)}
                className={cn(
                  "cursor-pointer border-t border-white/[0.04] transition hover:bg-white/[0.03]",
                  selectedId === c.id && "bg-amber-400/[0.06]",
                )}
              >
                <td className="px-3 py-2 tabular-nums text-zinc-400">
                  <bdi>{formatClock(c.started_at)}</bdi>
                </td>
                <td className="px-3 py-2 font-medium text-zinc-200">
                  {c.customer_name ?? <span className="text-zinc-500">נכנסת</span>}
                </td>
                <td className="px-3 py-2 text-zinc-400">{DIRECTION_HE[c.direction]}</td>
                <td className="px-3 py-2">
                  <OutcomeBadge outcome={c.outcome} />
                </td>
                <td className={cn("px-3 py-2 tabular-nums", confidenceColor(c.confidence))}>
                  {c.confidence != null ? <bdi>{formatPercent(c.confidence)}</bdi> : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-400">
                  <bdi>{formatDuration(c.duration_seconds)}</bdi>
                </td>
                <td className="px-3 py-2 tabular-nums text-zinc-400">
                  {c.cost_usd != null ? <bdi>{formatCurrency(c.cost_usd)}</bdi> : "—"}
                </td>
              </tr>
            ))}
            {calls.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-600">
                  אין שיחות עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
