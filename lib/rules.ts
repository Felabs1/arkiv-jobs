/**
 * The rules every participant applies to the same on-chain data.
 * Pure functions only: the UI and every agent import this, so they always agree
 * on who won and what state a task is in, without a coordinator.
 */
import type { Bid, ChainOrder, Result, Review, Task, TaskBundle } from "./types";

/**
 * Block time on Arkiv is 2s. The bid window is 10 blocks (~20s) and opens with the
 * task's first bid, so a task waits for agents that come online after it was posted.
 */
export const BLOCK_TIME_SEC = 2;
export const BID_WINDOW_BLOCKS = 10;

export type TaskState =
  | "open"
  | "in_progress"
  | "delivered"
  | "accepted"
  | "rejected"
  | "no_bids"
  | "expired";

export const STATE_LABEL: Record<TaskState, string> = {
  open: "Open for bids",
  in_progress: "In progress",
  delivered: "Delivered",
  accepted: "Accepted",
  rejected: "Rejected",
  no_bids: "No bids",
  expired: "Expired",
};

export function compareOrder(a: ChainOrder, b: ChainOrder): number {
  return a.block - b.block || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

function wellFormed(task: Task, b: Bid): boolean {
  return b.task === task.key && Number.isFinite(b.price) && b.price >= 0;
}

/** The first bid on-chain for this task, which opens the window. */
export function firstBid(task: Task, bids: Bid[]): Bid | null {
  const mine = bids.filter((b) => wellFormed(task, b)).sort((x, y) => compareOrder(x.order, y.order));
  return mine[0] ?? null;
}

/** Last block a bid may land in, or null while nobody has bid yet. */
export function bidCutoffBlock(task: Task, bids: Bid[]): number | null {
  const first = firstBid(task, bids);
  return first ? first.order.block + BID_WINDOW_BLOCKS : null;
}

/** Bids that landed inside the window, one per wallet (its earliest bid counts). */
export function validBids(task: Task, bids: Bid[]): Bid[] {
  const cutoff = bidCutoffBlock(task, bids);
  if (cutoff === null) return [];
  const byCreator = new Map<string, Bid>();
  for (const b of [...bids].sort((x, y) => compareOrder(x.order, y.order))) {
    if (!wellFormed(task, b)) continue;
    if (b.order.block > cutoff) continue;
    if (!byCreator.has(b.creator)) byCreator.set(b.creator, b);
  }
  return [...byCreator.values()];
}

/** Lowest price wins; ties go to whichever bid landed on-chain first. */
export function pickWinner(task: Task, bids: Bid[]): Bid | null {
  const valid = validBids(task, bids);
  valid.sort((a, b) => a.price - b.price || compareOrder(a.order, b.order));
  return valid[0] ?? null;
}

/** Only a result written by the winning wallet counts. */
export function winningResult(task: Task, bids: Bid[], results: Result[]): Result | null {
  const winner = pickWinner(task, bids);
  if (!winner) return null;
  const mine = results
    .filter((r) => r.task === task.key && r.creator === winner.creator)
    .sort((a, b) => compareOrder(a.order, b.order));
  return mine[0] ?? null;
}

/** Only a review created by the task's creator counts. */
export function ownerReview(task: Task, reviews: Review[]): Review | null {
  const mine = reviews
    .filter((r) => r.task === task.key && r.creator === task.creator)
    .sort((a, b) => compareOrder(a.order, b.order));
  return mine[0] ?? null;
}

export function taskState(b: TaskBundle, currentBlock: number, nowSec: number): TaskState {
  const { task } = b;
  const review = ownerReview(task, b.reviews);
  if (review) return review.verdict === "accepted" ? "accepted" : "rejected";
  if (winningResult(task, b.bids, b.results)) return "delivered";
  const cutoff = bidCutoffBlock(task, b.bids);
  if (cutoff === null) return nowSec > task.deadline ? "no_bids" : "open";
  if (currentBlock <= cutoff) return "open";
  if (nowSec > task.deadline) return "expired";
  return "in_progress";
}

export interface LeaderRow {
  agent: string; // wallet
  name: string;
  accepted: number;
  rejected: number;
}

/** Reputation = accepted results per agent wallet, from reviews signed by the poster. */
export function leaderboard(reviews: Review[]): LeaderRow[] {
  const rows = new Map<string, LeaderRow & { last: ChainOrder }>();
  const seenTask = new Set<string>();
  for (const r of [...reviews].sort((a, b) => compareOrder(a.order, b.order))) {
    if (r.creator !== r.poster) continue;
    if (seenTask.has(r.task)) continue; // first review per task is final
    seenTask.add(r.task);
    const row = rows.get(r.agent) ?? { agent: r.agent, name: r.agentName, accepted: 0, rejected: 0, last: r.order };
    if (r.verdict === "accepted") row.accepted++;
    else row.rejected++;
    row.name = r.agentName || row.name;
    row.last = r.order;
    rows.set(r.agent, row);
  }
  return [...rows.values()]
    .map(({ last, ...row }) => row)
    .sort((a, b) => b.accepted - a.accepted || a.rejected - b.rejected || a.name.localeCompare(b.name));
}
