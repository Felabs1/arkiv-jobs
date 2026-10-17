import { test } from "node:test";
import assert from "node:assert/strict";
import { BID_WINDOW_BLOCKS, leaderboard, pickWinner, taskState, validBids } from "../lib/rules";
import type { Bid, Result, Review, Task, TaskBundle } from "../lib/types";

const T = "0xtask" as const;
const at = (block: number, key = "0x00") => ({ block, key });
const meta = (who: string) => ({ creator: who, owner: who, expiresAt: 0, attrs: {} });

const task: Task = {
  key: T, ...meta("0xposter"), order: at(100),
  title: "t", description: "d", category: "writing", reward: 10, deadline: 1_000,
};
const bid = (owner: string, price: number, block: number, key = `0xbid-${owner}-${block}`): Bid => ({
  key: key as any, ...meta(owner), order: at(block, key), task: T, agent: owner, price, pitch: "",
});
const result = (owner: string, block = 120): Result => ({
  key: `0xres-${owner}`, ...meta(owner), order: at(block, `0xres-${owner}`), task: T, agent: owner, output: "done",
});
const review = (owner: string, verdict: "accepted" | "rejected", agent = "0xa", taskKey = T, block = 130): Review => ({
  key: `0xrev-${owner}-${block}`, ...meta(owner), order: at(block, `0xrev-${owner}-${block}`), task: taskKey, result: "0xres-0xa",
  agent, agentName: agent.toUpperCase(), verdict, poster: "0xposter", title: "t",
});
const bundle = (p: Partial<TaskBundle>): TaskBundle => ({ task, bids: [], results: [], reviews: [], ...p });

test("lowest price wins", () => {
  assert.equal(pickWinner(task, [bid("0xa", 5, 101), bid("0xb", 3, 105)])?.owner, "0xb");
});

test("tie goes to the earliest bid on-chain, then lowest key", () => {
  assert.equal(pickWinner(task, [bid("0xa", 5, 103), bid("0xb", 5, 102)])?.owner, "0xb");
  assert.equal(pickWinner(task, [bid("0xa", 5, 102, "0x9f"), bid("0xb", 5, 102, "0x1a")])?.owner, "0xb");
});

test("window opens at the first bid, however late it comes", () => {
  const first = bid("0xb", 9, 500);
  const inWindow = bid("0xc", 7, 500 + BID_WINDOW_BLOCKS);
  const late = bid("0xa", 1, 500 + BID_WINDOW_BLOCKS + 1);
  assert.equal(pickWinner(task, [late, first, inWindow])?.owner, "0xc");
});

test("only a wallet's earliest bid counts", () => {
  const v = validBids(task, [bid("0xa", 9, 101), bid("0xa", 1, 102)]);
  assert.equal(v.length, 1);
  assert.equal(v[0].price, 9);
});

test("no bids -> null winner", () => {
  assert.equal(pickWinner(task, []), null);
});

test("state: open while waiting for a first bid, until the deadline", () => {
  assert.equal(taskState(bundle({}), 900, 500), "open");
  assert.equal(taskState(bundle({}), 900, 1_001), "no_bids");
});

test("state: open during the window after the first bid", () => {
  assert.equal(taskState(bundle({ bids: [bid("0xa", 5, 300)] }), 305, 500), "open");
  assert.equal(taskState(bundle({ bids: [bid("0xa", 5, 300)] }), 311, 500), "in_progress");
});

test("state: in progress, then expired", () => {
  const b = bundle({ bids: [bid("0xa", 5, 101)] });
  assert.equal(taskState(b, 112, 500), "in_progress");
  assert.equal(taskState(b, 112, 1_001), "expired");
});

test("state: result from a non-winner does not count", () => {
  const b = bundle({ bids: [bid("0xa", 5, 101), bid("0xb", 9, 101)], results: [result("0xb")] });
  assert.equal(taskState(b, 120, 500), "in_progress");
  assert.equal(taskState({ ...b, results: [result("0xa")] }, 120, 500), "delivered");
});

test("state: accepted / rejected only from the task owner", () => {
  const b = bundle({ bids: [bid("0xa", 5, 101)], results: [result("0xa")] });
  assert.equal(taskState({ ...b, reviews: [review("0xmallory", "accepted")] }, 140, 500), "delivered");
  assert.equal(taskState({ ...b, reviews: [review("0xposter", "accepted")] }, 140, 500), "accepted");
  assert.equal(taskState({ ...b, reviews: [review("0xposter", "rejected")] }, 140, 2_000), "rejected");
});

test("trust follows $creator, not a transferred $owner", () => {
  const b = bundle({ bids: [bid("0xa", 5, 101)], results: [result("0xa")] });
  // A review whose current owner is the poster but which the poster did not create doesn't count.
  const forged = { ...review("0xmallory", "accepted"), owner: "0xposter" };
  assert.equal(taskState({ ...b, reviews: [forged] }, 140, 500), "delivered");
});

test("leaderboard counts accepted reviews signed by the poster, first per task", () => {
  const rows = leaderboard([
    review("0xposter", "accepted", "0xa", "0xt1" as any, 1),
    review("0xposter", "rejected", "0xa", "0xt1" as any, 2), // second review on same task ignored
    review("0xposter", "accepted", "0xb", "0xt2" as any, 3),
    review("0xposter", "accepted", "0xb", "0xt3" as any, 4),
    review("0xmallory", "accepted", "0xa", "0xt4" as any, 5), // not the poster
  ]);
  assert.deepEqual(rows.map((r) => [r.agent, r.accepted, r.rejected]), [["0xb", 2, 0], ["0xa", 1, 0]]);
});
