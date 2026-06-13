"use client";

// Decorative animated scene layers per style. Deterministic positions only
// (no Math.random at render — values are precomputed module constants).

const seeded = (n: number, salt: number) => {
  const v = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const STARS = Array.from({ length: 90 }, (_, i) => ({
  x: seeded(i, 1) * 100,
  y: seeded(i, 2) * 100,
  s: 1 + Math.round(seeded(i, 3) * 2),
  d: (seeded(i, 4) * 6).toFixed(2),
}));

const TABLES = [
  { x: 8, y: 18, r: 46, seats: 4 }, { x: 22, y: 64, r: 34, seats: 2 },
  { x: 9, y: 84, r: 40, seats: 4 }, { x: 38, y: 12, r: 34, seats: 2 },
  { x: 55, y: 80, r: 52, seats: 6 }, { x: 72, y: 14, r: 40, seats: 4 },
  { x: 88, y: 38, r: 34, seats: 2 }, { x: 84, y: 78, r: 46, seats: 4 },
  { x: 40, y: 88, r: 34, seats: 2 }, { x: 93, y: 12, r: 30, seats: 2 },
];

const BARS = Array.from({ length: 56 }, (_, i) => ({
  h: 12 + Math.round(seeded(i, 7) * 46),
  d: (seeded(i, 8) * 2.4).toFixed(2),
}));

const MOTES = Array.from({ length: 14 }, (_, i) => ({
  x: 34 + seeded(i, 11) * 26,
  d: (seeded(i, 12) * 16).toFixed(1),
  t: 14 + seeded(i, 13) * 14,
}));

export default function SceneFX({ styleId }: { styleId: string }) {
  return (
    <div className="scenefx" aria-hidden="true">
      {styleId === "s2" && (
        <>
          <div className="stars">
            {STARS.map((s, i) => (
              <i
                key={i}
                style={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  width: s.s,
                  height: s.s,
                  animationDelay: `${s.d}s`,
                }}
              />
            ))}
          </div>
          <span className="shooting" />
        </>
      )}

      {styleId === "s3" && (
        <div className="floorplan">
          {TABLES.map((t, i) => (
            <span
              key={i}
              className="table"
              style={{ left: `${t.x}%`, top: `${t.y}%`, width: t.r, height: t.r }}
              data-seats={t.seats}
            />
          ))}
        </div>
      )}

      {styleId === "s4" && (
        <div className="eqcity">
          {BARS.map((b, i) => (
            <i key={i} style={{ height: b.h, animationDelay: `${b.d}s` }} />
          ))}
        </div>
      )}

      {styleId === "s5" && (
        <>
          <div className="sunpatch a" />
          <div className="sunpatch b" />
          <div className="leaf a" />
          <div className="leaf b" />
        </>
      )}

      {styleId === "s6" && (
        <>
          <div className="aurora a" />
          <div className="aurora b" />
          <div className="aurora c" />
        </>
      )}

      {styleId === "s7" && (
        <svg className="flows" viewBox="0 0 1440 900" preserveAspectRatio="none">
          <path d="M-40,720 C320,640 520,820 880,700 S1300,560 1500,640" />
          <path d="M-40,180 C260,260 620,120 940,220 S1340,320 1500,240" />
          <path d="M-40,460 C400,380 800,560 1500,430" />
        </svg>
      )}

      {styleId === "s8" && (
        <div className="motes">
          {MOTES.map((m, i) => (
            <i
              key={i}
              style={{
                left: `${m.x}%`,
                animationDelay: `${m.d}s`,
                animationDuration: `${m.t}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
