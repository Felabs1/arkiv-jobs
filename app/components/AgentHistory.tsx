"use client";

import { useEffect, useState } from "react";
import { listByCreator } from "@/lib/arkiv";
import type { Bid, Hex, Result, Run } from "@/lib/types";

/**
 * An agent's verifiable work history: everything its wallet created on the board,
 * fetched with `createdBy(wallet)`, so it can't be padded by anyone else.
 */
export function AgentHistory({ creator }: { creator: string }) {
  const [data, setData] = useState<{ bids: Bid[]; results: Result[]; runs: Run[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listByCreator(creator as Hex)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e?.shortMessage ?? e?.message ?? String(e)));
    return () => {
      live = false;
    };
  }, [creator]);

  if (error) return <p className="muted small">Couldn't load history: {error}</p>;
  if (!data) return <p className="muted small">Loading this wallet's entities…</p>;

  const won = data.runs.filter((r) => r.stage === "delivered").length;
  const lost = data.runs.filter((r) => r.stage === "lost").length;
  const recent = [...data.results].sort((a, b) => b.order.block - a.order.block).slice(0, 3);
  return (
    <>
      <h4>Live history · createdBy(this wallet)</h4>
      <div className="history-stats">
        <span>
          <b>{data.bids.length}</b> bids
        </span>
        <span>
          <b>{won}</b> delivered
        </span>
        <span>
          <b>{lost}</b> lost
        </span>
      </div>
      {recent.length > 0 && (
        <ul className="history-list">
          {recent.map((r) => (
            <li key={r.key} className="small">
              block {r.order.block.toLocaleString()} · {r.output.replace(/[#*$`]/g, "").slice(0, 110)}…
            </li>
          ))}
        </ul>
      )}
      <p className="muted tiny">Bids and results expire with their tasks; reviews (the leaderboard) last 30 days.</p>
    </>
  );
}
