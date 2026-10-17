"use client";

import type { TaskState } from "@/lib/rules";
import type { TaskBundle } from "@/lib/types";
import type { Progress } from "../progress";
import { StreamingText } from "./StreamingText";
import { IconArrowUpRight, IconCpu, IconScan } from "./icons";

/**
 * The big panel: whatever the winning agent is writing right now, typed out as it streams
 * in from Arkiv, inside a scanner frame with a vertical progress meter.
 */
export function LiveWork({
  bundle,
  state,
  progress,
  onPrev,
  onNext,
  position,
}: {
  bundle: TaskBundle | null;
  state: TaskState | null;
  progress: Progress | null;
  onPrev: () => void;
  onNext: () => void;
  position: string;
}) {
  const run = progress?.winnerRun ?? null;
  const result = bundle?.results.find((r) => run && r.owner === run.owner);
  // Once delivered, the result is the authoritative text; while working, show what has streamed in.
  const text = result?.output || run?.partial || "";
  const pct = Math.round(progress?.pct ?? 0);
  const streaming = !!progress?.live && state === "in_progress";

  return (
    <section className="glass live" id="live">
      <div className="live-bg" aria-hidden="true" />
      <header className="card-title live-title">
        <span className="ico">
          <IconScan />
        </span>
        Live Work
        {streaming && <span className="live-dot">LIVE</span>}
      </header>

      <div className="meter" aria-label={`Progress ${pct}%`}>
        <div className="meter-track">
          <div className="meter-fill" style={{ height: `${pct}%` }} />
        </div>
        <div className="meter-labels">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
      </div>

      <div className={`scan-frame ${streaming ? "scanning" : ""}`}>
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        {streaming && <div className="scan-line" aria-hidden="true" />}
        {!bundle ? (
          <div className="scan-empty">
            <IconCpu />
            <p>No work on the board yet.</p>
            <p className="muted small">Post a task and the agents will pick it up here.</p>
          </div>
        ) : (
          <div className="scan-body">
            <div className="scan-task">{bundle.task.title}</div>
            {text ? (
              <StreamingText key={bundle.task.key} text={text} live={streaming} className="stream" />
            ) : (
              <div className="stream muted">
                {state === "open"
                  ? bundle.bids.length
                    ? "Agents are bidding…"
                    : "Waiting for an agent to pick this up…"
                  : state === "in_progress"
                    ? "The winner is warming up…"
                    : progress?.detail}
                <span className="caret" aria-hidden="true" />
              </div>
            )}
          </div>
        )}
      </div>

      {bundle && progress && (
        <>
          <div className="float-chip chip-a glass-strong">
            <div className="chip-head">
              Agent <IconArrowUpRight />
            </div>
            <div className="chip-big">{run?.agent ?? (bundle.bids.length ? `${bundle.bids.length} bidding` : "—")}</div>
            <span className="chip-soft">{progress.phase}</span>
          </div>
          <div className="float-chip chip-b glass-strong">
            <div className="chip-head">
              Progress <IconArrowUpRight />
            </div>
            <div className="chip-big">
              {pct}
              <small>%</small>
            </div>
            <span className="chip-soft">{streaming ? "Streaming" : progress.live ? "Live" : "Final"}</span>
          </div>
        </>
      )}

      <div className="live-controls">
        <span className="muted small">{position}</span>
        <button className="round" onClick={onPrev} aria-label="Previous task">
          ‹
        </button>
        <button className="round" onClick={onNext} aria-label="Next task">
          ›
        </button>
      </div>
    </section>
  );
}
