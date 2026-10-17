"use client";

import { pickWinner } from "@/lib/rules";
import type { TaskBundle } from "@/lib/types";
import type { Progress } from "../progress";
import { IconArrowUpRight, IconClock, IconLayers } from "./icons";

/** Bid window: a slider that fills as the ~20s window (opened by the first bid) runs out. */
export function BidWindowCard({ bundle, progress }: { bundle: TaskBundle | null; progress: Progress | null }) {
  const left = progress?.windowLeftSec ?? null;
  const frac = progress?.windowFrac ?? 0;
  const lowest = bundle ? pickWinner(bundle.task, bundle.bids) : null;
  const open = left !== null && left > 0;
  const big = !bundle ? "—" : left === null ? "—" : open ? `${left}s` : "Closed";

  return (
    <section className="glass card-pad window-card">
      <header className="card-title split">
        <span className="row-center">
          <span className="ico">
            <IconClock />
          </span>
          Bid Window
        </span>
        <IconArrowUpRight className="muted" />
      </header>
      <div className="split baseline">
        <span className="muted small">{left === null ? "Opens with the first bid" : open ? "Closing in" : "Lowest bid wins"}</span>
        <span className="big-num">{big}</span>
      </div>
      <div className="slider" aria-hidden="true">
        <div className="slider-ticks" />
        <div className="slider-fill" style={{ width: `${frac * 100}%` }} />
        <div className="slider-knob" style={{ left: `${frac * 100}%` }} />
      </div>
      <div className="split muted small">
        <span>0s</span>
        <span>20s</span>
      </div>
      <p className="card-foot">
        {!bundle
          ? "No task selected"
          : bundle.bids.length === 0
            ? "No bids yet"
            : `${bundle.bids.length} bid${bundle.bids.length === 1 ? "" : "s"} · ${lowest ? `${open ? "lowest so far" : "winner"}: ${lowest.agent} at ${lowest.price} pts` : ""}`}
      </p>
    </section>
  );
}

/** Overall task progress as a striped bar, like a loading meter. */
export function ProgressCard({ progress }: { progress: Progress | null }) {
  const pct = Math.round(progress?.pct ?? 0);
  return (
    <section className="glass card-pad progress-card">
      <header className="card-title">
        <span className="ico">
          <IconLayers />
        </span>
        Task Progress
      </header>
      <div className="row-center gap">
        <span className="big-num">
          {pct}
          <small>%</small>
        </span>
        {progress && <span className="chip-soft outline">{progress.phase}</span>}
      </div>
      <div className="bar" aria-hidden="true">
        <div className={`bar-fill ${progress?.live ? "pulsing" : ""}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <div className="split muted small">
        <span>0</span>
        <span>100%</span>
      </div>
      <p className="card-foot">{progress?.detail ?? "Select a task to follow its progress"}</p>
    </section>
  );
}
