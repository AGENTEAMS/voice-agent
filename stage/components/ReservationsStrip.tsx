"use client";

export type ReservationRow = {
  id: string;
  reserved_for: string;
  party_size: number;
  status: string;
  updated_at?: string;
  customers: { name: string; phone: string } | null;
};

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

export default function ReservationsStrip(props: {
  rows: ReservationRow[];
  calledId: string | null;
  flippedId: string | null;
  onSelect?: (id: string) => void;
}) {
  const { rows, calledId, flippedId, onSelect } = props;
  return (
    <aside className="strip">
      <h2>ההזמנות של הערב · {rows.length}</h2>
      {rows.map((r) => {
        const selectable = !!onSelect;
        const name = r.customers?.name ?? "—";
        return (
          <div
            key={`${r.id}-${r.status}`}
            className={
              "row" +
              (r.id === calledId ? " called" : "") +
              (r.id === flippedId ? " flip" : "") +
              (selectable ? " selectable" : "")
            }
            data-status={r.status}
            onClick={selectable ? () => onSelect!(r.id) : undefined}
            title={selectable ? "לחיצה תבחר את האורח לשיחה" : undefined}
          >
            <span className="avatar" aria-hidden="true">
              {initials(name)}
            </span>
            <span className="rowMain">
              <span className="name">{name}</span>
              <span className="party">{r.party_size} סועדים</span>
            </span>
            <span className="time mono">{fmtTime(r.reserved_for)}</span>
            <span className="dot" />
          </div>
        );
      })}
    </aside>
  );
}
