"use client";

import type { CallState, NodeId } from "@/lib/constellation";

export type NodeFlare = { id: number; writes: boolean } | null;

const NODES: Array<{ id: NodeId | "supabase"; icon: string; name: string; angle: number }> = [
  { id: "check_availability", icon: "🗓", name: "check_availability", angle: 0 },
  { id: "transfer_to_human", icon: "📞", name: "transfer_to_human", angle: 60 },
  { id: "schedule_callback", icon: "⏰", name: "schedule_callback", angle: 120 },
  { id: "supabase", icon: "🗄", name: "Supabase", angle: 180 },
  { id: "set_reservation_status", icon: "✓", name: "set_reservation_status", angle: 240 },
  { id: "change_reservation", icon: "✏️", name: "change_reservation", angle: 300 },
];

const R = 252; // ring radius (px) inside the .constellation box

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
                style={{ width: wireLen, transform: `rotate(${rot}deg)`, ["--len" as string]: `${wireLen}px` }}
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
                <span className="icon">{n.icon}</span>
                <span className="name mono">{n.name}</span>
              </div>
            </div>
          );
        })}
        <div className="orb" data-state={state}>
          <div className="eq" data-still={state !== "live" ? "true" : "false"}>
            <i /><i /><i /><i /><i />
          </div>
        </div>
        <div className="orbLabel">מיקה · המארחת הדיגיטלית</div>
      </div>
    </div>
  );
}
