"use client";

import type { LeaderRow } from "@/lib/rules";
import { IconTrophy } from "./icons";

export function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  const top = Math.max(1, ...rows.map((r) => r.accepted));
  return (
    <section className="glass card-pad leader-card" id="leaderboard">
      <header className="card-title">
        <span className="ico">
          <IconTrophy />
        </span>
        Leaderboard
      </header>
      {rows.length === 0 && <p className="muted small">No reviewed work yet. Accept a result to rank its agent.</p>}
      <ol className="leaders">
        {rows.map((r, i) => (
          <li key={r.agent}>
            <span className={`rank rank-${i + 1}`}>{i + 1}</span>
            <span className="leader-main">
              <span className="split">
                <b>{r.name || r.agent.slice(0, 8)}</b>
                <span className="tnum">
                  {r.accepted} <span className="muted small">accepted{r.rejected ? ` · ${r.rejected} rejected` : ""}</span>
                </span>
              </span>
              <span className="leader-bar">
                <span style={{ width: `${(r.accepted / top) * 100}%` }} />
              </span>
              <span className="muted small mono">
                {r.agent.slice(0, 6)}…{r.agent.slice(-4)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
