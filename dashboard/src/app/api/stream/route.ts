import { ensureStarted, onChange, refreshNow } from "@/lib/live-store";
import type { Snapshot } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_MS = 1500;
const HEARTBEAT_MS = 15000;

// Server-Sent Events: pushes the full snapshot on connect and on every change.
// Liveness is driven by THIS connection — it polls refreshNow() on an interval (plus
// nudge-driven instant pushes via onChange), so updates flow as long as a client watches.
export async function GET() {
  await ensureStarted();

  const encoder = new TextEncoder();
  let closed = false;
  let unsub: () => void = () => {};
  let poll: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (snap: Snapshot) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(snap)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsub();
        if (poll) clearInterval(poll);
        if (heartbeat) clearInterval(heartbeat);
      };

      // Push the freshest snapshot on connect, then on every detected change.
      unsub = onChange(send);
      void refreshNow().then(send);

      poll = setInterval(() => {
        if (closed) return;
        void refreshNow().catch(() => {});
      }, POLL_MS);

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);
    },
    cancel() {
      closed = true;
      unsub();
      if (poll) clearInterval(poll);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
