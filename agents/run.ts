/**
 * A worker agent. Usage: tsx agents/run.ts <scribe|analyst|coder>
 *
 * watch new tasks -> ask the LLM whether to bid -> bid -> wait for the window to close
 * -> apply the shared winner rule -> if we won, do the work and post the result.
 * Every agent runs the same rule on the same on-chain bids, so they all agree on the winner.
 */
import { formatEther } from "viem";
import { walletFor } from "./env";
import { PERSONAS } from "./personas";
import { WORK_MAX_TOKENS, assess, work } from "./llm";
import {
  EXPLORER,
  createBidWithRun,
  currentBlock,
  createProfile,
  deliverWithRun,
  extendProfile,
  findOwnProfile,
  updateRun,
  type RunState,
  getTaskBundle,
  listTasks,
  publicClient,
} from "../lib/arkiv";
import { BLOCK_TIME_SEC, bidCutoffBlock, firstBid, pickWinner, winningResult } from "../lib/rules";
import type { Hex, Task } from "../lib/types";

const persona = PERSONAS[process.argv[2] ?? ""];
if (!persona) {
  console.error(`Usage: tsx agents/run.ts <${Object.keys(PERSONAS).join("|")}>`);
  process.exit(1);
}

const wallet = walletFor(persona.id);
const me = wallet.account.address.toLowerCase();

const seen = new Set<string>();

function log(task: Task | null, msg: string) {
  const t = new Date().toISOString().slice(11, 19);
  const tag = task ? ` [${task.title.slice(0, 32)}]` : "";
  console.log(`${t} ${persona.name}${tag} ${msg}`);
}

/** Don't bid on a task that leaves too little time to win and deliver. */
const MIN_SECONDS_LEFT = 45;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One wallet, one nonce sequence: every write this agent makes goes through this lock,
 * so a streaming patch never races a bid or a result for the same nonce.
 */
let writeChain: Promise<unknown> = Promise.resolve();
function serialWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => {});
  return next;
}

/** The agent's progress entity for one task, mirrored on Arkiv for the board to watch. */
class RunTracker {
  state: RunState;
  private pending = false;
  private flushing: Promise<void> | null = null;

  constructor(
    readonly task: Task,
    readonly key: Hex,
    initial: RunState,
  ) {
    this.state = initial;
  }

  event(msg: string) {
    this.state.events = [...this.state.events, { t: Date.now(), msg }].slice(-30);
  }

  /** Update locally and push to Arkiv. While a patch is in flight, later updates coalesce into one. */
  push(change: Partial<RunState>, msg?: string) {
    Object.assign(this.state, change);
    if (msg) this.event(msg);
    this.pending = true;
    if (!this.flushing) this.flushing = this.flush();
  }

  private async flush() {
    while (this.pending) {
      this.pending = false;
      const snapshot = { ...this.state, events: [...this.state.events] };
      try {
        await serialWrite(() => updateRun(wallet, this.key, snapshot));
      } catch (e: any) {
        log(this.task, `progress update failed: ${e?.shortMessage ?? e?.message ?? e}`);
      }
    }
    this.flushing = null;
  }

  async settled() {
    while (this.flushing) await this.flushing;
  }
}

const runs = new Map<string, RunTracker>();

async function handle(task: Task) {
  if (seen.has(task.key)) return;
  seen.add(task.key);
  if (!persona.categories.includes(task.category)) return;
  if (task.deadline - Date.now() / 1000 < MIN_SECONDS_LEFT) return;

  let bundle = await getTaskBundle(task);
  const myBid = () => bundle.bids.find((b) => b.creator === me);
  const windowClosed = async () => {
    const cutoff = bidCutoffBlock(task, bundle.bids);
    return cutoff !== null && (await currentBlock()) >= cutoff;
  };

  if (!myBid()) {
    if (await windowClosed()) return;
    const first = firstBid(task, bundle.bids);
    log(task, first ? `${task.category} task, window open (first bid by ${first.agent})` : `new ${task.category} task, no bids yet`);
    try {
      const a = await assess(persona, task);
      if (!a.canDo) return log(task, "passing, not a fit");
      bundle = await getTaskBundle(task);
      if (await windowClosed()) return log(task, "window closed while thinking, skipping bid");
      const initial: RunState = {
        stage: "bid",
        progress: 10,
        partial: "",
        events: [
          { t: Date.now(), msg: `Picked up the task` },
          { t: Date.now(), msg: `Bid ${a.price} pts: ${a.pitch}` },
        ],
      };
      const { txHash, runKey } = await serialWrite(() =>
        createBidWithRun(wallet, task, { agent: persona.name, price: a.price, pitch: a.pitch }, initial),
      );
      runs.set(task.key, new RunTracker(task, runKey, initial));
      log(task, `bid ${a.price} pts "${a.pitch}" ${EXPLORER}${txHash}`);
    } catch (e: any) {
      return log(task, `bid failed: ${e?.shortMessage ?? e?.message ?? e}`);
    }
  } else {
    // Restarted mid-task: pick our run entity back up.
    const run = bundle.runs?.find((r) => r.creator === me);
    if (run) {
      runs.set(task.key, new RunTracker(task, run.key, { stage: run.stage, progress: run.progress, partial: run.partial, events: run.events }));
    }
  }

  await settle(task);
}

/**
 * Wait for the window (opened by the first bid) to close, then apply the shared winner rule.
 * Cheap on quota: one query to learn the first bid, block-number polling while waiting,
 * then one query for the final set of bids.
 */
async function settle(task: Task): Promise<void> {
  const run = runs.get(task.key);
  let bundle = await getTaskBundle(task);
  // Our own bid may take a moment to be indexed; until then the window is unknown.
  for (let i = 0; bidCutoffBlock(task, bundle.bids) === null && i < 10; i++) {
    await sleep(BLOCK_TIME_SEC * 1000);
    bundle = await getTaskBundle(task);
  }
  const cutoff = bidCutoffBlock(task, bundle.bids);
  if (cutoff === null) return log(task, "could not see any bids for this task");
  // Wait one extra block past the cutoff so every bid in the window is indexed.
  while ((await currentBlock()) <= cutoff + 1) {
    if (Date.now() / 1000 > task.deadline) return log(task, "deadline passed before the window closed");
    await sleep(BLOCK_TIME_SEC * 1000);
  }
  bundle = await getTaskBundle(task);
  const winner = pickWinner(task, bundle.bids);
  if (!winner) return log(task, "window closed with no valid bids");
  if (winner.creator !== me) {
    run?.push({ stage: "lost", progress: 100 }, `Lost to ${winner.agent} at ${winner.price} pts`);
    return log(task, `lost to ${winner.agent} at ${winner.price} pts`);
  }
  if (winningResult(task, bundle.bids, bundle.results)) return log(task, "won, result already posted");
  if (Date.now() / 1000 > task.deadline) return log(task, "won, but the deadline has passed");
  if (!run) return log(task, "won, but no run entity to report progress on");

  log(task, `WON at ${winner.price} pts, working...`);
  run.push({ stage: "working", progress: 25 }, `Won at ${winner.price} pts, starting work`);

  // Rough progress: the share of the token budget used so far (~4 chars per token), capped at 95%.
  const expectedChars = WORK_MAX_TOKENS * 4 * 0.35;
  let output: string;
  try {
    output = await work(persona, task, (text) => {
      run.push({ partial: text, progress: Math.min(95, 25 + (text.length / expectedChars) * 70) });
    });
  } catch (e: any) {
    run.push({ stage: "failed" }, `Failed: ${e?.message ?? e}`);
    await run.settled();
    return log(task, `work failed: ${e?.message ?? e}`);
  }

  // Let in-flight progress patches land first, then deliver the result and close the run in one tx.
  await run.settled();
  run.event(`Delivered ${output.length} chars`);
  const final: RunState = { ...run.state, stage: "delivered", progress: 100, partial: output };
  const { txHash } = await serialWrite(() => deliverWithRun(wallet, task, { agent: persona.name, output }, run.key, final));
  run.state = final;
  log(task, `delivered (${output.length} chars) ${EXPLORER}${txHash}`);
  renewLease("after delivery");
}

/**
 * The agent's public profile is a 10-minute lease on Arkiv, renewed while the agent runs
 * (Lifetime Extension). If the process stops, the profile expires and the agent drops off
 * the board's "Agents online" list on its own; no one has to clean up.
 */
let profileKey: Hex | null = null;
const LEASE_RENEW_MS = 3 * 60_000;

async function startLease() {
  const existing = await findOwnProfile(me as Hex).catch(() => null);
  if (existing) {
    profileKey = existing.key;
    await renewLease("resumed profile");
    return;
  }
  const { entityKey, txHash } = await serialWrite(() =>
    createProfile(wallet, {
      agent: persona.name,
      categories: persona.categories,
      model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash-lite",
      bio: persona.style,
    }),
  );
  profileKey = entityKey;
  log(null, `profile published ${EXPLORER}${txHash}`);
}

async function renewLease(why: string) {
  if (!profileKey) {
    // Never published (e.g. the RPC was down at startup) or lost: try again now.
    await startLease().catch((e) => log(null, `could not publish profile: ${e?.message ?? e}`));
    return;
  }
  const key = profileKey;
  try {
    await serialWrite(() => extendProfile(wallet, key));
    log(null, `lease renewed (${why})`);
  } catch (e: any) {
    log(null, `lease renewal failed: ${e?.shortMessage ?? e?.message ?? e}`);
    // The profile may have expired while we were offline; publish a fresh one.
    profileKey = null;
    await startLease().catch(() => {});
  }
}

async function poll() {
  try {
    const tasks = await listTasks();
    for (const t of tasks) if (!seen.has(t.key)) handle(t).catch((e) => log(t, `error: ${e?.message ?? e}`));
  } catch (e: any) {
    log(null, `poll failed: ${e?.shortMessage ?? e?.message ?? e}`);
  }
}

async function main() {
  const balance = await publicClient().getBalance({ address: wallet.account.address });
  if (balance === 0n) {
    log(null, `wallet ${wallet.account.address} has 0 GLM. Fund it (faucet: https://hub.arkiv.network/faucet) and restart.`);
    process.exit(1);
  }
  log(null, `online as ${me} (${formatEther(balance)} GLM), watching ${persona.categories.join(", ")}`);
  await startLease().catch((e) => log(null, `could not publish profile: ${e?.message ?? e}`));
  setInterval(() => renewLease("heartbeat"), LEASE_RENEW_MS);
  await poll();
  // Poll for open tasks. Watching creation events would fire for every entity on the whole
  // Arkiv network and cost a lookup each; a filtered query every few seconds is far cheaper,
  // and the bid window only opens with the first bid, so a few seconds of latency is harmless.
  setInterval(poll, 6000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
