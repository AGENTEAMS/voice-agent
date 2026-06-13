"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ReservationRow } from "@/components/ReservationsStrip";

type Row = ReservationRow & { updated_at?: string };

const STATUS_HE: Record<string, string> = {
  pending: "ממתינה",
  confirmed: "אושרה",
  cancelled: "בוטלה",
  needs_human: "דרוש נציג",
};

const fmt = (iso: string, withSeconds = false) =>
  new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  }).format(new Date(iso));

export default function Tonight() {
  const [rows, setRows] = useState<Row[]>([]);
  const [flippedId, setFlippedId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const r = await fetch("/api/reservations", { cache: "no-store" });
      const data = await r.json();
      if (Array.isArray(data)) setRows(data);
    } catch {
      /* keep current rows */
    }
  }, []);

  useEffect(() => {
    fetchRows();
    let unsub: (() => void) | undefined;
    import("@/lib/supabase").then(({ subscribeStage }) => {
      unsub = subscribeStage({
        onToolEvent: () => {},
        onReservationChange: (row) => {
          setFlippedId(row.id);
          fetchRows();
        },
      });
    });
    return () => unsub?.();
  }, [fetchRows]);

  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const counters = [
    { key: "confirmed", label: "אושרו", cls: "ok" },
    { key: "pending", label: "ממתינות", cls: "" },
    { key: "cancelled", label: "בוטלו", cls: "off" },
    { key: "needs_human", label: "דרוש נציג", cls: "warn" },
  ];

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <span className="restaurant">קיסו</span>
          <span className="tagline">סיכום הערב</span>
        </div>
        <Link className="navlink" href="/">
          ← לבמה
        </Link>
      </header>
      <div className="tonight">
        <div className="counters">
          {counters.map((c) => (
            <div key={c.key} className={`counter ${c.cls}`}>
              <span className="num">{count(c.key)}</span>
              <span className="lbl">{c.label}</span>
            </div>
          ))}
        </div>
        <div className="tlist">
          {rows.map((r) => (
            <div
              key={`${r.id}-${r.status}-${r.reserved_for}`}
              className={"trow" + (r.id === flippedId ? " flip" : "")}
              data-status={r.status}
            >
              <span className="dot" />
              <span className="tname">{r.customers?.name ?? "—"}</span>
              <span className="tmeta mono">{fmt(r.reserved_for)}</span>
              <span className="tparty">{r.party_size} סועדים</span>
              <span className="pill" data-status={r.status}>
                {STATUS_HE[r.status] ?? r.status}
              </span>
              <span className="tupd">
                {r.status !== "pending" && r.updated_at ? `עודכן ${fmt(r.updated_at)}` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
