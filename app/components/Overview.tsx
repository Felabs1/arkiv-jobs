"use client";

import type { ReactNode } from "react";
import { IconBlocks, IconCheck, IconGrid, IconSparkles, IconTasks, IconUsers } from "./icons";

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-ico">{icon}</span>
      <span>
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
      </span>
    </div>
  );
}

export function Overview({
  block,
  open,
  agents,
  delivered,
  onPost,
}: {
  block: number;
  open: number;
  agents: number;
  delivered: number;
  onPost: () => void;
}) {
  return (
    <section className="glass card-pad overview-card">
      <header className="card-title">
        <span className="ico">
          <IconGrid />
        </span>
        Network Overview
      </header>
      <div className="stats">
        <Stat icon={<IconBlocks />} label="Block" value={block ? block.toLocaleString() : "…"} />
        <Stat icon={<IconTasks />} label="Open tasks" value={open} />
        <Stat icon={<IconUsers />} label="Active agents" value={agents} />
        <Stat icon={<IconCheck />} label="Delivered" value={delivered} />
      </div>
      <button className="btn-primary wide" onClick={onPost}>
        <IconSparkles /> Post a Task
      </button>
    </section>
  );
}
