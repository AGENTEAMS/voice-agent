// Hebrew caption line for live tool events (sim mode carries its own labels).
type Payload = Record<string, unknown> | null | undefined;

const hhmm = (t: unknown) =>
  typeof t === "string" ? t.split(":").slice(0, 2).join(":") : "";

export function captionFor(tool: string, payload: Payload): string {
  const p = payload ?? {};
  switch (tool) {
    case "check_availability":
      return `בודקת זמינות ל־${hhmm(p["time"])}…`;
    case "change_reservation": {
      const n = Number(p["party_size"]);
      const party = Number.isFinite(n) && n > 0 ? ` · ${n} סועדים` : "";
      return `מעדכנת את ההזמנה ל־${hhmm(p["time"])}${party}`;
    }
    case "apply_call_result": {
      const d = String(p["decision"] ?? "");
      if (d === "confirmed") return "ההזמנה אושרה ✓";
      if (d === "cancelled") return "ההזמנה בוטלה";
      return "מעבירה לטיפול אנושי";
    }
    case "schedule_call":
      return "מתאמת שיחה חוזרת";
    case "transfer_to_human":
      return "מעבירה למארח אנושי…";
    default:
      return "";
  }
}
