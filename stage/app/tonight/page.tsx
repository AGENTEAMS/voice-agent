"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ReservationRow } from "@/components/ReservationsStrip";

type Row = ReservationRow & { updated_at?: string };
type Callback = {
  id: string;
  kind: "callback" | "retry";
  status: string;
  scheduled_for: string;
  reason: string | null;
  reservations: { id: string; customers: { name: string } | null } | null;
};

const COLUMNS: Array<{ status: string; label: string; cls: string }> = [
  { status: "confirmed", label: "אושרו", cls: "ok" },
  { status: "pending", label: "ממתינות", cls: "wait" },
  { status: "needs_human", label: "דרוש נציג", cls: "warn" },
  { status: "cancelled", label: "בוטלו", cls: "off" },
];

const CB_STATUS_HE: Record<string, string> = {
  pending: "ממתינה",
  in_progress: "מתבצעת",
  done: "בוצעה",
  cancelled: "בוטלה",
  failed: "נכשלה",
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export default function Tonight() {
  const [rows, setRows] = useState<Row[]>([]);
  const [callbacks, setCallbacks] = useState<Callback[]>([]);
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());
  const [flippedId, setFlippedId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const r = await fetch("/api/tonight", { cache: "no-store" });
      const data = await r.json();
      if (Array.isArray(data.reservations)) setRows(data.reservations);
      if (Array.isArray(data.callbacks)) setCallbacks(data.callbacks);
      if (Array.isArray(data.changedIds)) setChangedIds(new Set(data.changedIds));
    } catch {
      /* keep current data */
    }
  }, []);

  useEffect(() => {
    fetchAll();
    let unsub: (() => void) | undefined;
    import("@/lib/supabase").then(({ subscribeStage }) => {
      unsub = subscribeStage({
        onToolEvent: (tool) => {
          if (tool === "change_reservation" || tool === "schedule_call") fetchAll();
        },
        onReservationChange: (row) => {
          setFlippedId(row.id);
          fetchAll();
        },
      });
    });
    return () => unsub?.();
  }, [fetchAll]);

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <span className="restaurant">מיקה</span>
          <span className="tagline">סיכום הערב</span>
        </div>
        <div className="headerEnd">
          <Link className="navlink" href="/insights">
            תובנות ביטולים ←
          </Link>
          <Link className="navlink" href="/">
            ← לבמה
          </Link>
        </div>
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
                    {changedIds.has(r.id) && <span className="badge">השעה שונתה בשיחה</span>}
                  </article>
                ))}
              </section>
            );
          })}
          <section className="col cbcol">
            <header className="colHead">
              <span className="colDot cb" />
              <span className="colLabel">שיחות חוזרות</span>
              <span className="colCount">{callbacks.length}</span>
            </header>
            {callbacks.length === 0 && (
              <div className="colEmpty">אין שיחות חוזרות</div>
            )}
            {callbacks.map((cb) => (
              <article key={cb.id} className="ccard cb">
                <div className="ccTop">
                  <span className="ccName">
                    {cb.reservations?.customers?.name ?? "—"}
                  </span>
                  <span className="ccTime mono">{fmt(cb.scheduled_for)}</span>
                </div>
                <div className="ccBottom">
                  <span>{cb.kind === "retry" ? "ניסיון חוזר" : "לבקשת האורח"}</span>
                  <span>{CB_STATUS_HE[cb.status] ?? cb.status}</span>
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
