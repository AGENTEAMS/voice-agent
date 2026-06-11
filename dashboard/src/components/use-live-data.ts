"use client";
import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/types";

// Subscribes to the server SSE stream and exposes the latest snapshot + connection state.
// EventSource auto-reconnects, so a dropped connection self-heals.
export function useLiveData() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        setSnapshot(JSON.parse(e.data) as Snapshot);
        setConnected(true);
      } catch {
        // ignore heartbeats / malformed frames
      }
    };
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  return { snapshot, connected };
}
