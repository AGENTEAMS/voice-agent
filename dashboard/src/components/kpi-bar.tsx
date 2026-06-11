import { Card } from "./ui/card";
import { formatCurrency, formatDuration, formatPercent } from "@/lib/format";
import type { Kpis } from "@/lib/types";

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${accent ?? "text-zinc-100"}`}>
        {value}
      </p>
    </Card>
  );
}

export function KpiBar({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      <Stat
        label="אחוז אישור"
        value={<bdi>{formatPercent(kpis.confirmationRate)}</bdi>}
        accent="text-emerald-300"
      />
      <Stat label="שיחות היום" value={<bdi>{kpis.callsToday}</bdi>} />
      <Stat label="ממתינות" value={<bdi>{kpis.pending}</bdi>} accent="text-amber-300" />
      <Stat label="אושרו" value={<bdi>{kpis.confirmed}</bdi>} accent="text-emerald-300" />
      <Stat label="דרוש נציג" value={<bdi>{kpis.needsHuman}</bdi>} accent="text-fuchsia-300" />
      <Stat label="משך ממוצע" value={<bdi>{formatDuration(kpis.avgDurationSeconds)}</bdi>} />
      <Stat
        label="עלות היום"
        value={<bdi>{formatCurrency(kpis.totalSpendUsd)}</bdi>}
        accent="text-sky-300"
      />
    </div>
  );
}
