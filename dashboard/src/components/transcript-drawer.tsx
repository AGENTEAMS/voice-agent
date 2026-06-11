"use client";
import { useEffect } from "react";
import { OutcomeBadge } from "./status-badge";
import { TranscriptView } from "./transcript-view";
import {
  DIRECTION_HE,
  confidenceColor,
  formatClock,
  formatCurrency,
  formatDuration,
  formatPercent,
} from "@/lib/format";
import type { CallAttempt, Reservation } from "@/lib/types";

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-zinc-200">{value}</p>
    </div>
  );
}

export function TranscriptDrawer({
  call,
  reservations,
  onClose,
}: {
  call: CallAttempt | null;
  reservations: Reservation[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!call) return null;

  const reservation = reservations.find((r) => r.id === call.reservation_id);
  const name = call.customer_name ?? reservation?.customer?.name ?? "שיחה נכנסת";

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside className="absolute inset-y-0 start-0 flex w-full max-w-md flex-col border-e border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{name}</h2>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
              <bdi>{formatClock(call.started_at)}</bdi>
              <span>·</span>
              {DIRECTION_HE[call.direction]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 py-3">
          <Meta label="תוצאה" value={<OutcomeBadge outcome={call.outcome} />} />
          <Meta label="כוונה" value={call.intent ?? "—"} />
          <Meta
            label="ביטחון"
            value={
              <span className={confidenceColor(call.confidence)}>
                {call.confidence != null ? <bdi>{formatPercent(call.confidence)}</bdi> : "—"}
              </span>
            }
          />
          <Meta label="משך" value={<bdi>{formatDuration(call.duration_seconds)}</bdi>} />
          <Meta
            label="עלות"
            value={call.cost_usd != null ? <bdi>{formatCurrency(call.cost_usd)}</bdi> : "—"}
          />
          <Meta label="ספק" value={call.provider ?? "—"} />
        </div>

        <div className="flex-1 overflow-y-auto border-t border-white/[0.06] px-4 py-4">
          <TranscriptView turns={call.transcript} />
        </div>
      </aside>
    </div>
  );
}
