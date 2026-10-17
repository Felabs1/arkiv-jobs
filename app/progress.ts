import { BID_WINDOW_BLOCKS, BLOCK_TIME_SEC, bidCutoffBlock, pickWinner, type TaskState } from "@/lib/rules";
import type { Run, TaskBundle } from "@/lib/types";

export interface Progress {
  pct: number; // 0-100, overall task progress
  phase: string; // short label for chips
  detail: string; // one-line explanation
  live: boolean; // something is actively happening
  winnerRun: Run | null;
  windowLeftSec: number | null; // null: no window yet
  windowFrac: number; // 0-1 elapsed share of the bid window
}

/** One view of "how far along is this task", shared by every panel on the board. */
export function taskProgress(b: TaskBundle, state: TaskState, block: number): Progress {
  const winner = pickWinner(b.task, b.bids);
  const winnerRun = winner ? (b.runs ?? []).find((r) => r.owner === winner.owner) ?? null : null;
  const cutoff = bidCutoffBlock(b.task, b.bids);
  const windowLeftSec = cutoff === null ? null : Math.max(0, (cutoff - block) * BLOCK_TIME_SEC);
  const windowFrac = cutoff === null ? 0 : Math.min(1, Math.max(0, 1 - (cutoff - block) / BID_WINDOW_BLOCKS));

  switch (state) {
    case "open":
      return {
        pct: cutoff === null ? 2 : 5 + windowFrac * 15,
        phase: cutoff === null ? "Waiting" : "Bidding",
        detail: cutoff === null ? "Waiting for the first agent to bid" : `${b.bids.length} bid${b.bids.length === 1 ? "" : "s"} in, window closes in ~${windowLeftSec}s`,
        live: true,
        winnerRun,
        windowLeftSec,
        windowFrac,
      };
    case "in_progress": {
      const pct = winnerRun ? Math.max(25, winnerRun.progress) : 25;
      const streaming = (winnerRun?.chars ?? 0) > 0 || !!winnerRun?.partial;
      return {
        pct,
        phase: streaming ? "Streaming" : "Working",
        detail: winner ? `${winner.agent} won at ${winner.price} pts and is ${streaming ? "writing" : "starting"}` : "Working",
        live: true,
        winnerRun,
        windowLeftSec,
        windowFrac,
      };
    }
    case "delivered":
      return { pct: 100, phase: "Delivered", detail: "Result is in, waiting for the poster's review", live: false, winnerRun, windowLeftSec, windowFrac };
    case "accepted":
      return { pct: 100, phase: "Accepted", detail: "The poster accepted this result", live: false, winnerRun, windowLeftSec, windowFrac };
    case "rejected":
      return { pct: 100, phase: "Rejected", detail: "The poster rejected this result", live: false, winnerRun, windowLeftSec, windowFrac };
    case "no_bids":
      return { pct: 0, phase: "No bids", detail: "No agent bid before the deadline", live: false, winnerRun, windowLeftSec, windowFrac };
    case "expired":
      return { pct: winnerRun?.progress ?? 25, phase: "Expired", detail: "The deadline passed before delivery", live: false, winnerRun, windowLeftSec, windowFrac };
  }
}
