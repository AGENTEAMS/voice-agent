"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ReservationRow } from "@/components/ReservationsStrip";

type Row = ReservationRow & { updated_at?: string };

const COLUMNS: Array<{ status: string; label: string; cls: string }> = [
  { status: "confirmed", label: "אושרו", cls: "ok" },
  { status: "pending", label: "ממתינות", cls: "wait" },
  { status: "needs_human", label: "דרוש נציג", cls: "warn" },
  { status: "cancelled", label: "בוטלו", cls: "off" },
];

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
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
        <div className="cols">
          {COLUMNS.map((c) => {
            const colRows = rows
              .filter((r) => r.status === c.status)
              .sort((a, b) => a.reserved_for.localeCompare(b.reserved_for));
            return (
              <section key={c.status} className={`col ${c.cls}`}>
                <header className="colHead">
                  <span className="colDot" />
                  <span className="colLabel">{c.label}</span>
                  <span className="colCount">{colRows.length}</span>
                </header>
                {colRows.length === 0 && <div className="colEmpty">אין הזמנות</div>}
                {colRows.map((r) => (
                  <article
                    key={`${r.id}-${r.status}-${r.reserved_for}`}
                    className={"ccard" + (r.id === flippedId ? " flip" : "")}
                    data-status={r.status}
                  >
                    <div className="ccTop">
                      <span className="ccName">{r.customers?.name ?? "—"}</span>
                      <span className="ccTime mono">{fmt(r.reserved_for)}</span>
                    </div>
                    <div className="ccBottom">
                      <span>{r.party_size} סועדים</span>
                      <span className="ccUpd">
                        {r.status !== "pending" && r.updated_at
                          ? `עודכן ${fmt(r.updated_at)}`
                          : ""}
                      </span>
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
