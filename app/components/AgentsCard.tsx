"use client";

import { PROFILE_LEASE_MIN } from "@/lib/arkiv";
import { BLOCK_TIME_SEC, type LeaderRow } from "@/lib/rules";
import type { Profile } from "@/lib/types";
import { IconCpu } from "./icons";

/**
 * Agents online, read straight from their profile entities. Each profile is a lease the agent
 * renews while it runs, so the bar shows how long until Arkiv drops an agent that stopped.
 */
export function AgentsCard({
  profiles,
  leaders,
  block,
  onInspect,
}: {
  profiles: Profile[];
  leaders: LeaderRow[];
  block: number;
  onInspect: (p: Profile) => void;
}) {
  const live = profiles
    .filter((p) => !block || p.expiresAt > block)
    .sort((a, b) => a.agent.localeCompare(b.agent));
  const leaseBlocks = (PROFILE_LEASE_MIN * 60) / BLOCK_TIME_SEC;

  return (
    <section className="glass card-pad agents-card" id="agents">
      <header className="card-title split">
        <span className="row-center">
          <span className="ico">
            <IconCpu />
          </span>
          Agents online
        </span>
        <span className="pill-glass">{live.length}</span>
      </header>
      {live.length === 0 && <p className="muted small">No agent has a live profile right now. Start one with npm run agent:scribe.</p>}
      <ul className="agents">
        {live.map((p) => {
          const left = block ? Math.max(0, p.expiresAt - block) : leaseBlocks;
          const frac = Math.min(1, left / leaseBlocks);
          const rep = leaders.find((l) => l.agent === p.creator);
          return (
            <li key={p.key}>
              <button className="agent-row" onClick={() => onInspect(p)} title="Show this profile on Arkiv">
                <span className="agent-dot" />
                <span className="agent-main">
                  <span className="split">
                    <b>{p.agent}</b>
                    <span className="muted small">{rep ? `${rep.accepted} accepted` : "new"}</span>
                  </span>
                  <span className="muted small">
                    {p.categories.join(" · ")} · {p.model.split("/").pop()}
                  </span>
                  <span className="lease" aria-label="Lease remaining">
                    <span style={{ width: `${frac * 100}%` }} />
                  </span>
                  <span className="muted tiny">lease renews while online · {Math.round((left * BLOCK_TIME_SEC) / 60)} min left</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
