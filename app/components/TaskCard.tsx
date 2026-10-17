"use client";

import { useState } from "react";
import { BLOCK_TIME_SEC, STATE_LABEL, ownerReview, pickWinner, validBids, winningResult, type TaskState } from "@/lib/rules";
import type { Hex, TaskBundle, Verdict } from "@/lib/types";
import type { Progress } from "../progress";
import { BY_TASK_QUERY, OPEN_TASKS_QUERY, WHY } from "../inspect";
import type { InspectTarget } from "./EntityInspector";
import { StreamingText } from "./StreamingText";
import { IconBlocks, IconCheck, IconX } from "./icons";

/** Small "On Arkiv" button; stops the click from also selecting the card. */
function OnArkiv({ onClick, label = "On Arkiv" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      className="on-arkiv"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <IconBlocks /> {label}
    </button>
  );
}

function mmss(sec: number) {
  if (sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const STEPS = ["Bidding", "Working", "Delivered", "Reviewed"] as const;
function stepIndex(state: TaskState): number {
  switch (state) {
    case "open":
      return 0;
    case "in_progress":
      return 1;
    case "delivered":
      return 2;
    case "accepted":
    case "rejected":
      return 3;
    default:
      return -1;
  }
}

export function TaskCard({
  bundle,
  state,
  progress,
  now,
  account,
  selected,
  onSelect,
  onReview,
  onInspect,
  onKeepAlive,
  block,
}: {
  bundle: TaskBundle;
  state: TaskState;
  progress: Progress;
  now: number;
  account: string | null;
  selected: boolean;
  onSelect: () => void;
  onReview: (b: TaskBundle, verdict: Verdict) => Promise<void>;
  onInspect: (t: InspectTarget) => void;
  onKeepAlive: (key: Hex) => Promise<void>;
  block: number;
}) {
  const { task } = bundle;
  const [busy, setBusy] = useState(false);
  const winner = state === "open" ? null : pickWinner(task, bundle.bids);
  const result = winningResult(task, bundle.bids, bundle.results);
  const valid = new Set(validBids(task, bundle.bids).map((b) => b.key));
  const bids = [...bundle.bids].sort((a, b) => a.price - b.price || a.order.block - b.order.block);
  const runByOwner = new Map((bundle.runs ?? []).map((r) => [r.creator, r]));
  const isPoster = account?.toLowerCase() === task.creator;
  const step = stepIndex(state);
  const working = state === "in_progress" && !!progress.winnerRun?.partial;
  const review = ownerReview(task, bundle.reviews);
  const resultLeft = result && block ? (result.expiresAt - block) * BLOCK_TIME_SEC : null;

  async function decide(v: Verdict) {
    setBusy(true);
    try {
      await onReview(bundle, v);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`glass task state-${state} ${selected ? "selected" : ""}`} onClick={onSelect}>
      <header className="task-head">
        <div className="task-titles">
          <h3>{task.title}</h3>
          <div className="meta">
            <span className="chip-soft outline">{task.category}</span>
            <span>{task.reward} pts</span>
            <span title={`$creator ${task.creator}`} className="signed">
              ✓ by {isPoster ? "you" : short(task.creator)}
            </span>
            {!["accepted", "rejected", "expired", "no_bids"].includes(state) && (
              <span className="tnum">⏱ {mmss(task.deadline - now)}</span>
            )}
          </div>
        </div>
        <span className="head-right">
          <span className={`badge badge-${state}`}>{STATE_LABEL[state]}</span>
          <OnArkiv
            onClick={() =>
              onInspect({ title: task.title, type: "task", entity: task, query: OPEN_TASKS_QUERY, why: WHY.task })
            }
          />
        </span>
      </header>

      {step >= 0 && (
        <ol className="stepper" aria-label="Task stages">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? "done" : i === step ? (progress.live ? "active" : "done") : ""}>
              <span className="step-dot" />
              <span className="step-label">{i === 3 && state === "rejected" ? "Rejected" : s}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mini-bar" aria-hidden="true">
        <div className={`mini-fill ${progress.live ? "pulsing" : ""}`} style={{ width: `${Math.max(2, progress.pct)}%` }} />
      </div>
      <p className="muted small">{progress.detail}</p>

      {task.description && <p className="desc">{task.description}</p>}

      {bids.length > 0 && (
        <ul className="bids">
          {bids.map((b) => {
            const run = runByOwner.get(b.creator);
            const isWin = winner?.key === b.key;
            return (
              <li key={b.key} className={[isWin ? "win" : "", valid.has(b.key) ? "" : "late"].join(" ")}>
                <span className="agent">
                  {isWin && "★ "}
                  {b.agent}
                </span>
                <span className="price tnum">{b.price} pts</span>
                <span className="pitch">{b.pitch}</span>
                {run && <span className={`run-chip run-${run.stage}`}>{run.stage}</span>}
                <OnArkiv
                  label=""
                  onClick={() =>
                    onInspect({ title: `${b.agent} bid ${b.price} pts`, type: "bid", entity: b, query: BY_TASK_QUERY(task.key), why: WHY.bid })
                  }
                />
                {!valid.has(b.key) && <span className="muted small">after window</span>}
              </li>
            );
          })}
        </ul>
      )}

      {working && progress.winnerRun && (
        <div className="output live-output">
          <StreamingText text={progress.winnerRun.partial} live className="stream-sm" />
        </div>
      )}

      {result && (
        <section>
          <div className="split result-head">
            <h4>
              Result from {result.agent} <span className="signed">✓ signed by {short(result.creator)}</span>
            </h4>
            <OnArkiv
              onClick={() =>
                onInspect({ title: `Result from ${result.agent}`, type: "result", entity: result, query: BY_TASK_QUERY(task.key), why: WHY.result })
              }
            />
          </div>
          <div className="output">
            <StreamingText text={result.output} live={false} />
          </div>
          {review && (
            <div className="split review-row" onClick={(e) => e.stopPropagation()}>
              <span className="muted small">
                {review.verdict === "accepted" ? "Accepted" : "Rejected"} by the poster ·{" "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() =>
                    onInspect({ title: `Review: ${review.verdict}`, type: "review", entity: review, query: BY_TASK_QUERY(task.key), why: WHY.review })
                  }
                >
                  view review on Arkiv
                </button>
              </span>
              {state === "accepted" && (
                <button
                  type="button"
                  className="btn-ghost keep"
                  onClick={() => onKeepAlive(result.key)}
                  title="Results are created with permissionless extension: any wallet can keep a good answer on Arkiv longer"
                >
                  Keep alive +1 day{resultLeft !== null ? ` · ${Math.max(0, Math.round(resultLeft / 60))}m left` : ""}
                </button>
              )}
            </div>
          )}
          {isPoster && state === "delivered" && (
            <div className="actions" onClick={(e) => e.stopPropagation()}>
              <button className="btn-primary" disabled={busy} onClick={() => decide("accepted")}>
                <IconCheck /> Accept
              </button>
              <button className="btn-ghost" disabled={busy} onClick={() => decide("rejected")}>
                <IconX /> Reject
              </button>
            </div>
          )}
        </section>
      )}
    </article>
  );
}
