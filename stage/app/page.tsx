"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Stage, { type NodeFlare } from "@/components/Stage";
import ReservationsStrip, { type ReservationRow } from "@/components/ReservationsStrip";
import CallButton from "@/components/CallButton";
import { createEngine, type CallState, type NodeId } from "@/lib/constellation";
import { SIM_SCRIPT } from "@/lib/sim";
import { captionFor } from "@/lib/captions";

export default function Home() {
  const [sim] = useState(
    () => typeof window !== "undefined" && window.location.search.includes("sim=1")
  );
  const [callState, setCallState] = useState<CallState>("idle");
  const [caption, setCaption] = useState("");
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [flares, setFlares] = useState<Partial<Record<NodeId | "supabase", NodeFlare>>>({});
  const [dbPulse, setDbPulse] = useState<{ id: number } | null>(null);
  const [calledId, setCalledId] = useState<string | null>(null);
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const [clock, setClock] = useState("");

  const calledIdRef = useRef<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  const transferredSeen = useRef(false);
  const pulseCounter = useRef(0);
  const dialTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── engine (stable instance; onFire animates via state setters) ──────────
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);
  if (!engineRef.current) {
    engineRef.current = createEngine((p) => {
      const id = ++pulseCounter.current;
      setFlares((f) => ({ ...f, [p.node]: { id, writes: p.writes } }));
      if (p.writes) {
        setTimeout(() => setDbPulse({ id }), 1100);
      }
    });
  }
  const engine = engineRef.current;

  const applyCall = useCallback(
    (s: CallState) => {
      engine.setCall(s);
      setCallState(s);
    },
    [engine]
  );

  // expose call state to scene layers (state-reactive backgrounds)
  useEffect(() => {
    document.body.dataset.callState = callState;
  }, [callState]);

  // rAF tick loop drives queued pulses
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      engine.tick(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  // ── data ──────────────────────────────────────────────────────────────────
  const fetchRows = useCallback(async () => {
    try {
      const r = await fetch("/api/reservations", { cache: "no-store" });
      const data = await r.json();
      if (Array.isArray(data)) setRows(data);
    } catch {
      /* dev server hiccup — strip simply stays as-is */
    }
  }, []);

  useEffect(() => {
    fetchRows();
    const t = setInterval(
      () =>
        setClock(
          new Intl.DateTimeFormat("he-IL", {
            timeZone: "Asia/Jerusalem",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date())
        ),
      1000
    );
    return () => clearInterval(t);
  }, [fetchRows]);

  // ── realtime (live mode only; sim feeds the same pipes itself) ───────────
  // Source-agnostic: events from n8n-batch calls light the stage exactly like
  // CTA calls. When no CTA call owns the orb (no conversation_id), tool events
  // auto-wake it to "live" and it decays back to idle after silence.
  const autoLiveDecay = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (sim) return;
    let unsub: (() => void) | undefined;
    import("@/lib/supabase").then(({ subscribeStage }) => {
      unsub = subscribeStage({
        onToolEvent: (tool, payload, reservationId) => {
          engine.push({ kind: "tool", tool, at: Date.now() });
          const c = captionFor(tool, payload as Record<string, unknown>);
          if (c) setCaption(c);
          if (reservationId) {
            calledIdRef.current = reservationId;
            setCalledId(reservationId);
          }
          if (!convIdRef.current) {
            if (dialTimeout.current) {
              clearTimeout(dialTimeout.current);
              dialTimeout.current = null;
            }
            if (engine.state() === "idle" || engine.state() === "dialing") applyCall("live");
            if (autoLiveDecay.current) clearTimeout(autoLiveDecay.current);
            autoLiveDecay.current = setTimeout(() => {
              if (!convIdRef.current && engine.state() === "live") {
                applyCall("idle");
                setCaption("");
              }
            }, 25000);
          }
        },
        onReservationChange: (row) => {
          fetchRows();
          if (row.status === "pending") return;
          setFlippedId(row.id);
          if (row.id === calledIdRef.current || !convIdRef.current) {
            applyCall("resolved");
          }
        },
      });
    });
    return () => {
      unsub?.();
      if (autoLiveDecay.current) clearTimeout(autoLiveDecay.current);
    };
  }, [sim, engine, fetchRows, applyCall]);

  // ── ElevenLabs status polling while a call is in flight ──────────────────
  useEffect(() => {
    if (sim || (callState !== "dialing" && callState !== "live")) return;
    const t = setInterval(async () => {
      const id = convIdRef.current;
      if (!id) return;
      try {
        const r = await fetch(`/api/call/${id}`, { cache: "no-store" });
        if (!r.ok) return;
        const body = await r.json();
        if (body.transferred && !transferredSeen.current) {
          transferredSeen.current = true;
          engine.push({ kind: "tool", tool: "transfer_to_human", at: Date.now() });
          setCaption(captionFor("transfer_to_human", null));
        }
        if (body.status === "in-progress" && callState !== "live") applyCall("live");
        else if (body.status === "done" || body.status === "processing") applyCall("resolved");
        else if (body.status === "failed") {
          applyCall("idle");
          setCaption("השיחה לא נענתה");
        }
      } catch {
        /* poll again next tick */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [sim, callState, engine, applyCall]);

  // resolved → settle back to idle
  useEffect(() => {
    if (callState !== "resolved") return;
    if (dialTimeout.current) {
      clearTimeout(dialTimeout.current);
      dialTimeout.current = null;
    }
    const t = setTimeout(() => {
      applyCall("idle");
      setCaption("");
      convIdRef.current = null;
      transferredSeen.current = false;
      if (!sim) fetchRows();
    }, 2600);
    return () => clearTimeout(t);
  }, [callState, sim, fetchRows, applyCall]);

  // ── simulation mode (?sim=1): same pipes, scripted events ────────────────
  useEffect(() => {
    if (!sim) return;
    const timers = SIM_SCRIPT.map((step) =>
      setTimeout(() => {
        if (step.type === "call") {
          applyCall(step.state);
          if (step.state === "dialing") setCaption("מחייגת אל האורח…");
          if (step.state === "idle") setCaption("");
        } else if (step.type === "tool") {
          engine.push({ kind: "tool", tool: step.tool, at: Date.now() });
          setCaption(step.label);
        } else {
          setRows((rs) => {
            const target = calledIdRef.current ?? rs.find((r) => r.status === "pending")?.id;
            return rs.map((r) =>
              r.id === target
                ? {
                    ...r,
                    status: step.status,
                    reserved_for: `${r.reserved_for.slice(0, 10)}T${step.time}:00+03:00`,
                  }
                : r
            );
          });
          setFlippedId(calledIdRef.current);
        }
      }, step.delayMs)
    );
    return () => timers.forEach(clearTimeout);
  }, [sim, engine, applyCall]);

  // pick the demo guest: first pending row
  useEffect(() => {
    if (calledIdRef.current) return;
    const first = rows.find((r) => r.status === "pending");
    if (first) {
      calledIdRef.current = first.id;
      setCalledId(first.id);
    }
  }, [rows]);

  // ── click-to-run: reset to clean slate, then fire the n8n batch (calls only Tomer) ──
  const handleCall = useCallback(async () => {
    setCaption("מאפסת את הלוח ומחייגת…");
    applyCall("dialing");
    // Safety: if no tool event arrives (e.g. no answer) within 35s, settle back to idle.
    if (dialTimeout.current) clearTimeout(dialTimeout.current);
    dialTimeout.current = setTimeout(() => {
      if (engine.state() === "dialing") {
        applyCall("idle");
        setCaption("");
      }
    }, 35000);
    try {
      const r = await fetch("/api/run", { method: "POST" });
      if (!r.ok) {
        if (dialTimeout.current) clearTimeout(dialTimeout.current);
        applyCall("idle");
        setCaption("ההפעלה נכשלה");
      }
      // success: n8n places the call; the board lights from Supabase Realtime.
    } catch {
      if (dialTimeout.current) clearTimeout(dialTimeout.current);
      applyCall("idle");
      setCaption("ההפעלה נכשלה");
    }
  }, [applyCall, engine]);

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <span className="restaurant">קיסו</span>
          <span className="tagline">מיקה — המארחת הדיגיטלית</span>
        </div>
        <div className="headerEnd">
          <a className="navlink" href="/tonight">
            סיכום הערב ←
          </a>
          <div className="clock mono">{clock}</div>
        </div>
      </header>
      <div className="main">
        <section className="stageCol">
          <Stage state={callState} flares={flares} dbPulse={dbPulse} />
          <div className="caption" key={caption}>
            {caption || " "}
          </div>
          <CallButton state={callState} disabled={false} onCall={handleCall} />
        </section>
        <ReservationsStrip
          rows={rows}
          calledId={calledId}
          flippedId={flippedId}
          onSelect={(id) => {
            // only block while a real call is actually in flight; otherwise always
            // allow re-selecting (the CTA itself is disabled unless idle)
            if (convIdRef.current) return;
            calledIdRef.current = id;
            setCalledId(id);
          }}
        />
      </div>
    </div>
  );
}
