"use client";

import { useMemo } from "react";
import type { Run, RunStage, Task } from "@/lib/types";
import { IconArrowUpRight, IconBolt, IconCheck, IconSparkles, IconX, IconTrophy } from "./icons";

interface Item {
  id: string;
  t: number;
  agent: string;
  msg: string;
  stage: RunStage;
  task: string;
}

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

function iconFor(msg: string) {
  if (/^Bid/.test(msg)) return <IconSparkles />;
  if (/^Won/.test(msg)) return <IconTrophy />;
  if (/^Delivered/.test(msg)) return <IconCheck />;
  if (/^(Lost|Failed)/.test(msg)) return <IconX />;
  return <IconBolt />;
}

function tone(msg: string) {
  if (/^Bid/.test(msg)) return "blue";
  if (/^Won|^Delivered/.test(msg)) return "green";
  if (/^Lost/.test(msg)) return "amber";
  if (/^Failed/.test(msg)) return "red";
  return "cyan";
}

/** Every agent's run log, newest first. Each line was written on-chain by that agent. */
export function ActivityFeed({ runs, tasks, onPick }: { runs: Run[]; tasks: Map<string, Task>; onPick: (task: string) => void }) {
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const r of runs)
      for (const [i, e] of r.events.entries())
        out.push({ id: `${r.key}-${i}`, t: e.t, agent: r.agent, msg: e.msg, stage: r.stage, task: r.task });
    return out.sort((a, b) => b.t - a.t).slice(0, 8);
  }, [runs]);

  return (
    <section className="glass card-pad feed-card" id="activity">
      <header className="card-title split">
        <span className="row-center">
          <span className="ico">
            <IconSparkles />
          </span>
          Agent Activity
        </span>
        <IconArrowUpRight className="muted" />
      </header>
      {items.length === 0 && <p className="muted small">Agent steps show up here as they happen.</p>}
      <ul className="feed">
        {items.map((it) => (
          <li key={it.id}>
            <button className={`feed-item tone-${tone(it.msg)}`} onClick={() => onPick(it.task)}>
              <span className="feed-bar" />
              <span className="feed-main">
                <span className="feed-head">
                  <b>{it.agent}</b>
                  <span className="muted small">{ago(it.t)}</span>
                </span>
                <span className="feed-row">
                  <span className="feed-ico">{iconFor(it.msg)}</span>
                  <span className="feed-msg">
                    {it.msg}
                    <span className="muted"> · {tasks.get(it.task)?.title ?? "task"}</span>
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
