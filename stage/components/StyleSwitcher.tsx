"use client";

import { useEffect, useState } from "react";
import SceneFX from "@/components/SceneFX";

export const STYLES: Array<{ id: string; name: string }> = [
  { id: "s1", name: "גלי קול" },
  { id: "s2", name: "שמיים של לילה" },
  { id: "s3", name: "מפת המסעדה" },
  { id: "s4", name: "קצב הלילה" },
  { id: "s5", name: "אור בוקר" },
  { id: "s6", name: "אורורה חמה" },
  { id: "s7", name: "קווי תנועה" },
  { id: "s8", name: "במה ואור" },
  { id: "s9", name: "מסלולים" },
  { id: "s10", name: "שרטוט" },
];

export default function StyleSwitcher() {
  const [style, setStyle] = useState("s1");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const fromUrl = new URLSearchParams(window.location.search).get("style");
    const saved = fromUrl || localStorage.getItem("mika-style") || "s1";
    apply(STYLES.some((s) => s.id === saved) ? saved : "s1");
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "0") return apply("s10");
      const n = Number(e.key);
      if (n >= 1 && n <= 9) apply(STYLES[n - 1].id);
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
    <>
      {mounted && <SceneFX styleId={style} />}
      <div className="styleSwitcher" data-open={open}>
        <button className="ssToggle" onClick={() => setOpen(!open)} title="סגנונות (1–9, 0)">
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
                <span className="ssNum">{i === 9 ? 0 : i + 1}</span> {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
