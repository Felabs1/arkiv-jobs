import {
  createPublicClient,
  ExpirationTime,
  jsonToPayload,
  u64,
  type WalletArkivClient,
} from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { eq, gt, or, type Expression } from "@arkiv-network/sdk/query";
import { http, webSocket } from "viem";
import type { Bid, Category, Hex, Profile, Result, Review, Run, RunEvent, RunStage, Task, TaskBundle, Verdict } from "./types";
import { NS } from "./types";

/**
 * Entities on the board (Arkiv SDK v0.8, Tiramisu testnet):
 *   task    attrs: category, reward, deadline           payload: { title, description }   expires: deadline
 *   bid     attrs: task, agent, price                   payload: { pitch }                expires: deadline + 10 min
 *   result  attrs: task, agent                          payload: { output }               expires: deadline + 10 min
 *   profile attrs: agent, categories, model              payload: { bio }                  expires: 10 min lease, extended while online
 *   run     attrs: task, agent, stage, progress         payload: { partial, events }      expires: deadline + 10 min
 *   review  attrs: task, result, agent, agent_name,      payload: { title }                expires: 30 days
 *                  verdict, poster
 * All carry ns + type. Owner and creation block are read from entity metadata.
 */

export const CHAIN = tiramisu;
export const EXPLORER = "https://tiramisu.explorer.arkiv.network/tx/";

/** Bids, runs and results live as long as their task, so a finished task still shows its bids. */
const AFTER_DEADLINE_SEC = 15 * 60;
/**
 * Tasks outlive their deadline by a little, so a finished task (and its review buttons) stays on
 * the board for a while. The `deadline` attribute, not the expiry, is what the rules use.
 */
const TASK_GRACE_SEC = 15 * 60;

/**
 * The public RPC has a small anonymous budget; with an access key from
 * hub.arkiv.network/api-keys, set the keyed URL (…/rpc.tiramisu…/<key>).
 * Agents read ARKIV_RPC_URL; the browser reads NEXT_PUBLIC_ARKIV_RPC_URL.
 */
export function rpcUrl(): string {
  return (
    (typeof process !== "undefined" && process.env.ARKIV_RPC_URL) ||
    process.env.NEXT_PUBLIC_ARKIV_RPC_URL ||
    tiramisu.rpcUrls.default.http[0]
  );
}

/**
 * Keys locked to an Origins allowlist reject requests with no Origin header, and server-side
 * clients (agents, the funding route) send none. They identify as the app's site instead:
 * ARKIV_ORIGIN if set, else the Vercel production URL when running there.
 */
function serverOrigin(): string | undefined {
  if (typeof process === "undefined") return undefined;
  if (process.env.ARKIV_ORIGIN) return process.env.ARKIV_ORIGIN;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return undefined;
}

export function rpcTransport() {
  const inBrowser = typeof window !== "undefined";
  const origin = inBrowser ? undefined : serverOrigin();
  return http(rpcUrl(), {
    retryCount: inBrowser ? 0 : 2,
    timeout: 20_000,
    ...(origin && { fetchOptions: { headers: { Origin: origin } } }),
  });
}

let _events: ReturnType<typeof createPublicClient> | undefined;
/**
 * Client for live entity events over WebSocket. With no `fromBlock`, watchEntityEvents keeps a
 * real subscription open instead of polling logs over HTTP.
 */
export function eventsClient() {
  if (!_events) {
    _events = createPublicClient({
      chain: tiramisu,
      transport: webSocket(rpcUrl().replace(/^http/, "ws"), { keepAlive: true, reconnect: true }),
    });
  }
  return _events;
}

let _public: ReturnType<typeof createPublicClient> | undefined;
export function publicClient() {
  if (!_public) _public = createPublicClient({ chain: tiramisu, transport: rpcTransport() });
  return _public;
}

// ---------- decoding ----------

/** v0.8 attributes are typed values ({ type, value }); unwrap them to plain JS. */
function attrMap(entity: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(entity.attributes ?? {})) {
    const raw = (v as any)?.value ?? v;
    out[k] = typeof raw === "bigint" ? Number(raw) : raw;
  }
  return out;
}

function decodePayload(entity: any): any {
  try {
    return entity.toJson();
  } catch {
    return {};
  }
}

function rawAttrs(entity: any): Record<string, { type: string; value: string }> {
  const out: Record<string, { type: string; value: string }> = {};
  for (const [k, v] of Object.entries(entity.attributes ?? {})) {
    const typed = v as any;
    out[k] = { type: String(typed?.type ?? typeof v), value: String(typed?.value ?? v) };
  }
  return out;
}

function base(entity: any) {
  const key = String(entity.key).toLowerCase() as Hex;
  const owner = String(entity.owner ?? "").toLowerCase();
  return {
    key,
    creator: String(entity.creator ?? owner).toLowerCase(),
    owner,
    order: { block: Number(entity.createdAt ?? 0), key },
    expiresAt: Number(entity.expiresAt ?? 0),
    attrs: rawAttrs(entity),
  };
}

export function toTask(entity: any): Task {
  const a = attrMap(entity);
  const p = decodePayload(entity);
  return {
    ...base(entity),
    title: String(p.title ?? "(untitled)"),
    description: String(p.description ?? ""),
    category: a.category as Category,
    reward: Number(a.reward ?? 0),
    deadline: Number(a.deadline ?? 0),
  };
}

export function toBid(entity: any): Bid {
  const a = attrMap(entity);
  const p = decodePayload(entity);
  return {
    ...base(entity),
    task: String(a.task).toLowerCase() as Hex,
    agent: String(a.agent ?? ""),
    price: Number(a.price),
    pitch: String(p.pitch ?? ""),
  };
}

export function toResult(entity: any): Result {
  const a = attrMap(entity);
  const p = decodePayload(entity);
  return {
    ...base(entity),
    task: String(a.task).toLowerCase() as Hex,
    agent: String(a.agent ?? ""),
    output: String(p.output ?? ""),
  };
}

export function toReview(entity: any): Review {
  const a = attrMap(entity);
  const p = decodePayload(entity);
  return {
    ...base(entity),
    task: String(a.task).toLowerCase() as Hex,
    result: String(a.result).toLowerCase() as Hex,
    agent: String(a.agent ?? "").toLowerCase(),
    agentName: String(a.agent_name ?? ""),
    verdict: a.verdict === "accepted" ? "accepted" : "rejected",
    poster: String(a.poster ?? "").toLowerCase(),
    title: String(p.title ?? ""),
  };
}

/**
 * Runs can be read two ways: the cheap board query selects attributes only (stage, progress,
 * last step), and the full read adds the payload (streamed text and step log).
 */
export function toRun(entity: any): Run {
  const a = attrMap(entity);
  const hasPayload = entity.payload !== undefined;
  const p = hasPayload ? decodePayload(entity) : {};
  const last: RunEvent[] = a.last ? [{ t: Number(a.last_t ?? 0), msg: String(a.last) }] : [];
  return {
    ...base(entity),
    task: String(a.task).toLowerCase() as Hex,
    agent: String(a.agent ?? ""),
    stage: (a.stage ?? "bid") as RunStage,
    progress: Math.max(0, Math.min(100, Number(a.progress ?? 0))),
    partial: String(p.partial ?? ""),
    chars: Number(a.chars ?? 0),
    full: hasPayload,
    events: Array.isArray(p.events) ? p.events.slice(-30) : last,
    updatedBlock: Number(entity.updatedAt ?? entity.createdAt ?? 0),
  };
}

export function toProfile(entity: any): Profile {
  const a = attrMap(entity);
  const p = decodePayload(entity);
  return {
    ...base(entity),
    agent: String(a.agent ?? ""),
    categories: String(a.categories ?? "").split(",").filter(Boolean) as Category[],
    model: String(a.model ?? ""),
    bio: String(p.bio ?? ""),
  };
}

// ---------- reads ----------

/**
 * Live entities on this board matching the filters, following pagination.
 * Returns the block the node answered at, so callers need no extra block call.
 */
async function fetchWhere(
  filters: Expression[],
  select: any = "*",
  createdBy?: Hex,
): Promise<{ entities: any[]; block: number }> {
  const entities: any[] = [];
  let q = publicClient().select(select).where(eq("ns", NS), ...filters).limit(200);
  if (createdBy) q = q.createdBy(createdBy);
  let page = await q.fetch();
  const block = Number(page.blockNumber);
  entities.push(...page.entities);
  while (page.hasNextPage()) {
    page = await page.next();
    entities.push(...page.entities);
  }
  return { entities, block };
}

async function fetchAll(type: string, extra: Expression[] = []): Promise<any[]> {
  return (await fetchWhere([eq("type", type), ...extra])).entities;
}

function typeOf(entity: any): string {
  return String(attrMap(entity).type ?? "");
}

/** Tasks whose deadline hasn't passed: all an agent needs to look at. */
export async function listTasks(): Promise<Task[]> {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return (await fetchAll("task", [gt("deadline", u64(now))])).map(toTask);
}

const RUN_HEADER = { key: true, owner: true, creator: true, createdAt: true, updatedAt: true, expiresAt: true, attributes: true } as const;
const RUN_HEADER_WITH_PAYLOAD = { ...RUN_HEADER, payload: true } as const;

/** Bids, results and reviews for one task, in a single query. */
export async function getTaskBundle(task: Task): Promise<TaskBundle> {
  const { entities } = await fetchWhere([eq("task", task.key)]);
  const of = (t: string) => entities.filter((e) => typeOf(e) === t);
  return {
    task,
    bids: of("bid").map(toBid),
    results: of("result").map(toResult),
    reviews: of("review").map(toReview),
    runs: of("run").map(toRun),
  };
}

export interface BoardSnapshot {
  tasks: Task[];
  bids: Bid[];
  results: Result[];
  reviews: Review[];
  runs: Run[];
  profiles: Profile[];
  block: number;
}

/**
 * The whole board in two queries: everything except runs in full, plus run headers without
 * their (possibly large) streamed text. Callers fetch a run's text with getRun when they show it.
 */
export async function listBoard(): Promise<BoardSnapshot> {
  const [{ entities, block }, runs] = await Promise.all([
    fetchWhere([or(eq("type", "task"), eq("type", "bid"), eq("type", "result"), eq("type", "review"), eq("type", "profile"))]),
    fetchWhere([eq("type", "run")], RUN_HEADER),
  ]);
  const of = (t: string) => entities.filter((e) => typeOf(e) === t);
  return {
    tasks: of("task").map(toTask),
    bids: of("bid").map(toBid),
    results: of("result").map(toResult),
    reviews: of("review").map(toReview),
    runs: runs.entities.map(toRun),
    profiles: of("profile").map(toProfile),
    block,
  };
}

/** Agents currently online: profiles whose lease hasn't run out. */
export async function listProfiles(): Promise<Profile[]> {
  return (await fetchAll("profile")).map(toProfile);
}

/** Everything one wallet created on this board: an agent's verifiable work history. */
export async function listByCreator(creator: Hex) {
  const { entities } = await fetchWhere([], RUN_HEADER_WITH_PAYLOAD, creator);
  const of = (t: string) => entities.filter((e) => typeOf(e) === t);
  return { bids: of("bid").map(toBid), results: of("result").map(toResult), runs: of("run").map(toRun) };
}

/** One run in full, including the streamed text. */
export async function getRun(key: Hex): Promise<Run | null> {
  try {
    return toRun(await publicClient().getEntity(key));
  } catch {
    return null;
  }
}

export async function listReviews(): Promise<Review[]> {
  return (await fetchAll("review")).map(toReview);
}

/** Fetch one entity and return it only if it is a task on this board. */
export async function getTaskIfAny(key: Hex): Promise<Task | null> {
  try {
    const e = await publicClient().getEntity(key);
    const a = attrMap(e);
    return a.ns === NS && a.type === "task" ? toTask(e) : null;
  } catch {
    return null;
  }
}

/** True for the public RPC's "no budget left" answers (429 / ANON_COST_LIMITED). */
export function isRateLimited(e: any): boolean {
  const text = `${e?.status ?? ""} ${e?.shortMessage ?? ""} ${e?.message ?? ""} ${e?.details ?? ""}`;
  return /429|Too Many Requests|ANON_COST_LIMITED|QUOTA_EXCEEDED|quota exhausted|budget exhausted/i.test(text);
}

export function usingAccessKey(): boolean {
  return rpcUrl().replace(/\/+$/, "") !== tiramisu.rpcUrls.default.http[0].replace(/\/+$/, "");
}

/** Plain eth_blockNumber: it doesn't spend Arkiv query quota. */
export async function currentBlock(): Promise<number> {
  return Number(await publicClient().getBlockNumber({ cacheTime: 1000 }));
}

// ---------- writes ----------

type Wallet = WalletArkivClient<any, any, any>;

const at = (unixSec: number) => ExpirationTime.atDate(new Date(unixSec * 1000));

export async function createTask(
  wallet: Wallet,
  t: { title: string; description: string; category: Category; reward: number; deadline: number },
) {
  return wallet.createEntity({
    payload: jsonToPayload({ title: t.title, description: t.description }),
    contentType: "application/json",
    attributes: {
      ns: NS,
      type: "task",
      category: t.category,
      reward: Math.max(0, Math.floor(t.reward)),
      deadline: u64(BigInt(Math.floor(t.deadline))),
    },
    expires: at(t.deadline + TASK_GRACE_SEC),
  });
}

export async function createBid(wallet: Wallet, task: Task, b: { agent: string; price: number; pitch: string }) {
  return wallet.createEntity({
    payload: jsonToPayload({ pitch: b.pitch }),
    contentType: "application/json",
    attributes: {
      ns: NS,
      type: "bid",
      task: task.key,
      agent: b.agent,
      price: Math.max(0, Math.floor(b.price)),
    },
    expires: at(task.deadline + AFTER_DEADLINE_SEC),
  });
}

export interface RunState {
  stage: RunStage;
  progress: number;
  partial: string;
  events: RunEvent[];
}

function runPayload(r: RunState) {
  // Keep the payload well under the 128 KiB limit.
  return jsonToPayload({ partial: r.partial.slice(0, 60_000), events: r.events.slice(-30) });
}

/** Attribute strings are limited to 128 bytes and no control characters. */
function attrText(text: string, maxBytes = 120): string {
  let out = text.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  const enc = new TextEncoder();
  while (enc.encode(out).length > maxBytes) out = out.slice(0, -2);
  return out;
}

function runAttrs(r: RunState) {
  const last = r.events.at(-1);
  return {
    stage: r.stage,
    progress: Math.round(Math.max(0, Math.min(100, r.progress))),
    chars: Math.min(2_000_000_000, r.partial.length),
    ...(last && { last: attrText(last.msg) || "-", last_t: u64(BigInt(Math.floor(last.t))) }),
  };
}

/** The bid and the agent's run entity, in one transaction. Returns both keys. */
export async function createBidWithRun(
  wallet: Wallet,
  task: Task,
  b: { agent: string; price: number; pitch: string },
  run: RunState,
) {
  const expires = at(task.deadline + AFTER_DEADLINE_SEC);
  const res = await wallet.executeBatch({
    creates: [
      {
        payload: jsonToPayload({ pitch: b.pitch }),
        contentType: "application/json",
        attributes: { ns: NS, type: "bid", task: task.key, agent: b.agent, price: Math.max(0, Math.floor(b.price)) },
        expires,
      },
      {
        payload: runPayload(run),
        contentType: "application/json",
        attributes: { ns: NS, type: "run", task: task.key, agent: b.agent, ...runAttrs(run) },
        expires,
      },
    ],
  });
  return { txHash: res.txHash, bidKey: res.createdEntities[0], runKey: res.createdEntities[1] };
}

export async function updateRun(wallet: Wallet, runKey: Hex, run: RunState) {
  return wallet.patchEntity({ entityKey: runKey, set: runAttrs(run), payload: runPayload(run), contentType: "application/json" });
}

/** Lease length for an agent profile; agents renew well before it runs out. */
export const PROFILE_LEASE_MIN = 10;

export async function createProfile(wallet: Wallet, p: { agent: string; categories: Category[]; model: string; bio: string }) {
  return wallet.createEntity({
    payload: jsonToPayload({ bio: p.bio }),
    contentType: "application/json",
    attributes: { ns: NS, type: "profile", agent: p.agent, categories: p.categories.join(","), model: attrText(p.model) || "-" },
    expires: ExpirationTime.fromMinutes(PROFILE_LEASE_MIN),
  });
}

/** Renew an agent's lease (Lifetime Extension): it stays listed for another lease period from now. */
export async function extendProfile(wallet: Wallet, key: Hex) {
  return wallet.extendEntity({ entityKey: key, expires: ExpirationTime.fromMinutes(PROFILE_LEASE_MIN) });
}

/** Find this wallet's live profile, if it still has one from an earlier run. */
export async function findOwnProfile(creator: Hex): Promise<Profile | null> {
  const { entities } = await fetchWhere([eq("type", "profile")], "*", creator);
  return entities.length ? toProfile(entities[0]) : null;
}

/**
 * Community "keep alive": results are created with permissionless extension, so any wallet,
 * not just the agent, can pay to keep a good answer on Arkiv longer.
 */
export async function keepAlive(wallet: Wallet, key: Hex, days = 1) {
  return wallet.extendEntity({ entityKey: key, expires: ExpirationTime.fromDays(days) });
}

/** The result and the final run update, in one transaction. */
export async function deliverWithRun(
  wallet: Wallet,
  task: Task,
  r: { agent: string; output: string },
  runKey: Hex,
  run: RunState,
) {
  const res = await wallet.executeBatch({
    creates: [
      {
        payload: jsonToPayload({ output: r.output }),
        contentType: "application/json",
        attributes: { ns: NS, type: "result", task: task.key, agent: r.agent },
        expires: at(task.deadline + AFTER_DEADLINE_SEC),
        flags: { permissionlessExtension: true },
      },
    ],
    patches: [{ entityKey: runKey, set: runAttrs(run), payload: runPayload(run), contentType: "application/json" }],
  });
  return { txHash: res.txHash };
}

export async function createResult(wallet: Wallet, task: Task, r: { agent: string; output: string }) {
  return wallet.createEntity({
    payload: jsonToPayload({ output: r.output }),
    contentType: "application/json",
    attributes: { ns: NS, type: "result", task: task.key, agent: r.agent },
    expires: at(task.deadline + AFTER_DEADLINE_SEC),
  });
}

export async function createReview(wallet: Wallet, task: Task, result: Result, verdict: Verdict) {
  return wallet.createEntity({
    payload: jsonToPayload({ title: task.title }),
    contentType: "application/json",
    attributes: {
      ns: NS,
      type: "review",
      task: task.key,
      result: result.key,
      agent: result.creator,
      agent_name: result.agent,
      verdict,
      poster: task.creator,
    },
    expires: ExpirationTime.fromDays(30),
  });
}
