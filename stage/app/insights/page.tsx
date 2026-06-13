"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Insight = {
  theme: string;
  mentions: number;
  share: number;
  implication: string | null;
  recommendation: string | null;
  sample_quote: string | null;
  rank: number;
};

export default function Insights() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [total, setTotal] = useState(0);
  const [period, setPeriod] = useState("");

  useEffect(() => {
    fetch("/api/insights", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.insights)) setInsights(d.insights);
        setTotal(d.total ?? 0);
        setPeriod(d.period ?? "");
      })
      .catch(() => {
        /* keep empty state */
      });
  }, []);

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <span className="restaurant">קיסו</span>
          <span className="tagline">תובנות ביטולים</span>
        </div>
        <div className="headerEnd">
          <Link className="navlink" href="/tonight">
            סיכום הערב ←
          </Link>
          <Link className="navlink" href="/">
            לבמה ←
          </Link>
        </div>
      </header>

      <div className="insights">
        <div className="insightsInner">
          <div className="insHead">
            <h1 className="insTitle">למה אורחים מבטלים?</h1>
            <p className="insSub">
              ניתוח של <b>{total}</b> ביטולים{period ? ` ב${period}` : ""} · {insights.length} נושאים מובילים
            </p>
          </div>

          <div className="insGrid">
            {insights.map((it) => {
              const pct = Math.round((it.share ?? 0) * 100);
              return (
                <article className="insCard" key={it.rank}>
                  <div className="insCardTop">
                    <span className="insRank">{it.rank}</span>
                    <span className="insTheme">{it.theme}</span>
                    <span className="insMentions mono">
                      {it.mentions} · {pct}%
                    </span>
                  </div>
                  <div className="insBar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  {it.sample_quote && <p className="insQuote">”{it.sample_quote}“</p>}
                  {it.implication && (
                    <p className="insLine">
                      <span className="insLabel">המשמעות</span>
                      {it.implication}
                    </p>
                  )}
                  {it.recommendation && (
                    <p className="insLine rec">
                      <span className="insLabel">המלצה</span>
                      {it.recommendation}
                    </p>
                  )}
                </article>
              );
            })}
            {insights.length === 0 && (
              <div className="insEmpty">אין נתוני ביטולים עדיין</div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
