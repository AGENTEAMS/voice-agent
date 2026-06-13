"use client";

import { useEffect, useState } from "react";

export const STYLES: Array<{ id: string; name: string }> = [
  { id: "v1", name: "פשתן +" },
  { id: "v2", name: "כרטיסיות" },
  { id: "v3", name: "פנקס המארחת" },
  { id: "v4", name: "אור נרות" },
  { id: "v5", name: "טראצו" },
  { id: "v6", name: "ביסטרו" },
  { id: "v7", name: "זכוכית חמה" },
  { id: "v8", name: "קו דק" },
];

export default function StyleSwitcher() {
  const [style, setStyle] = useState("v1");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("style");
    const saved = fromUrl || localStorage.getItem("mika-style") || "v1";
    apply(saved);
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= STYLES.length && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        apply(STYLES[n - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(id: string) {
    document.body.dataset.style = id;
    localStorage.setItem("mika-style", id);
    setStyle(id);
  }

  return (
    <div className="styleSwitcher" data-open={open}>
      <button className="ssToggle" onClick={() => setOpen(!open)} title="סגנונות (1–8)">
        🎨 {STYLES.find((s) => s.id === style)?.name}
      </button>
      {open && (
        <div className="ssList">
          {STYLES.map((s, i) => (
            <button
              key={s.id}
              className={"ssItem" + (s.id === style ? " active" : "")}
              onClick={() => apply(s.id)}
            >
              <span className="ssNum">{i + 1}</span> {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
