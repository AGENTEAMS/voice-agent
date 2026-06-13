"use client";

export type ReservationRow = {
  id: string;
  reserved_for: string;
  party_size: number;
  status: string;
  customers: { name: string; phone: string } | null;
};

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export default function ReservationsStrip(props: {
  rows: ReservationRow[];
  calledId: string | null;
  flippedId: string | null;
}) {
  const { rows, calledId, flippedId } = props;
  return (
    <aside className="strip">
      <h2>ההזמנות של הערב · {rows.length}</h2>
      {rows.map((r) => (
        <div
          key={`${r.id}-${r.status}`}
          className={
            "row" +
            (r.id === calledId ? " called" : "") +
            (r.id === flippedId ? " flip" : "")
          }
          data-status={r.status}
        >
          <span className="dot" />
          <span className="name">{r.customers?.name ?? "—"}</span>
          <span className="meta">
            {fmtTime(r.reserved_for)} · {r.party_size}
          </span>
        </div>
      ))}
    </aside>
  );
}
