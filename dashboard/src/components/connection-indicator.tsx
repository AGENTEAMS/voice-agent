import { cn } from "@/lib/cn";

export function ConnectionIndicator({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
      <span className="relative flex h-2.5 w-2.5">
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full",
            connected ? "bg-emerald-400" : "bg-zinc-600",
          )}
        />
      </span>
      {connected ? "חי" : "מתחבר…"}
    </span>
  );
}
