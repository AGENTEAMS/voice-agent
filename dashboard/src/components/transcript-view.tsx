import { cn } from "@/lib/cn";
import { confidenceColor, formatPercent } from "@/lib/format";
import type { TranscriptTurn } from "@/lib/types";

function Bubble({ turn }: { turn: TranscriptTurn }) {
  const isAgent = turn.role === "agent";
  return (
    <div className={cn("flex", isAgent ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          isAgent
            ? "rounded-ss-sm bg-amber-400/10 text-amber-50 ring-1 ring-inset ring-amber-400/20"
            : "rounded-se-sm bg-white/[0.05] text-zinc-100 ring-1 ring-inset ring-white/10",
        )}
      >
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          {isAgent ? "סוכן" : "לקוח"}
        </p>
        <p>{turn.text}</p>
        {(turn.intent || turn.confidence != null) && (
          <p className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
            {turn.intent && <span>{turn.intent}</span>}
            {turn.confidence != null && (
              <span className={confidenceColor(turn.confidence)}>
                <bdi>{formatPercent(turn.confidence)}</bdi>
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

export function TranscriptView({ turns, live }: { turns: TranscriptTurn[]; live?: boolean }) {
  if (!turns.length) {
    return (
      <p className="py-8 text-center text-xs text-zinc-600">
        {live ? "ממתין לתחילת השיחה…" : "אין תמלול לשיחה זו"}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {turns.map((t, i) => (
        <Bubble key={i} turn={t} />
      ))}
    </div>
  );
}
