"use client";

import type { CallState, NodeId } from "@/lib/constellation";

export type NodeFlare = { id: number; writes: boolean } | null;

const NODES: Array<{
  id: NodeId | "supabase";
  icon: string;
  label: string;
  angle: number;
}> = [
  { id: "check_availability", icon: "🗓", label: "בדיקת זמינות", angle: 0 },
  { id: "transfer_to_human", icon: "📞", label: "העברה לנציג", angle: 60 },
  { id: "schedule_callback", icon: "⏰", label: "שיחה חוזרת", angle: 120 },
  { id: "supabase", icon: "", label: "מסד נתונים", angle: 180 },
  { id: "set_reservation_status", icon: "✓", label: "עדכון סטטוס", angle: 240 },
  { id: "change_reservation", icon: "✏️", label: "שינוי הזמנה", angle: 300 },
];

const R = 252; // ring radius (px) inside the .constellation box

function SupabaseIcons() {
  return (
    <span className="icons">
      {/* Supabase logomark — Simple Icons, brand color */}
      <svg viewBox="0 0 24 24" width="16" height="16" fill="#3FCF8E" aria-label="Supabase">
        <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C-.33 13.427.65 15.455 2.409 15.455h9.579l.113 7.51c.014.985 1.259 1.408 1.873.636l9.262-11.653c1.093-1.375.113-3.403-1.645-3.403h-9.642z" />
      </svg>
      {/* database cylinder */}
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5V19A9 3 0 0 0 21 19V5" />
        <path d="M3 12A9 3 0 0 0 21 12" />
      </svg>
    </span>
  );
}

export default function Stage(props: {
  state: CallState;
  flares: Partial<Record<NodeId | "supabase", NodeFlare>>;
  dbPulse: { id: number } | null;
}) {
  const { state, flares, dbPulse } = props;

  return (
    <div className="constellation" data-state={state}>
      <div className="center">
        {NODES.map((n) => {
          const rad = (n.angle * Math.PI) / 180;
          const x = Math.round(R * Math.sin(rad));
          const y = Math.round(-R * Math.cos(rad));
          const wireLen = R - 30;
          const rot = n.angle - 90;
          const flare = flares[n.id] ?? null;
          const isDb = n.id === "supabase";
          return (
            <div key={n.id}>
              <div
                className="wire"
                style={{
                  width: wireLen,
                  transform: `rotate(${rot}deg)`,
                  ["--len" as string]: `${wireLen}px`,
                }}
              >
                {flare && !isDb && <span className="dot" key={flare.id} />}
                {isDb && dbPulse && <span className="dot green" key={dbPulse.id} />}
              </div>
              <div
                className={
                  "node" +
                  (flare && !isDb ? " flare" : "") +
                  (isDb && dbPulse ? " dbflash" : "")
                }
                key={isDb ? dbPulse?.id ?? "db" : flare?.id ?? n.id}
                style={{ transform: `translate(${x}px, ${y}px)` }}
              >
                {isDb ? <SupabaseIcons /> : <span className="icon">{n.icon}</span>}
                <span className="name">{n.label}</span>
              </div>
            </div>
          );
        })}
        <div className="orb" data-state={state}>
          <div className="eq" data-still={state !== "live" ? "true" : "false"}>
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="orbLabel">מיקה · המארחת הדיגיטלית</div>
      </div>
    </div>
  );
}
