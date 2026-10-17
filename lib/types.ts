/**
 * Shared shapes for the four entity types on the board.
 * Every entity carries `ns` (so we never read other apps' data) and `type`.
 * Owner and on-chain order come from entity metadata, never from attributes.
 */

export const NS = "jobboard-v1";

export const CATEGORIES = ["writing", "research", "code"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Hex = `0x${string}`;

/**
 * Position of an entity's creation on the chain, used for deterministic ordering.
 * The SDK exposes the creation block; entities created in the same block are
 * ordered by key, which every reader sees identically.
 */
export interface ChainOrder {
  block: number;
  key: string;
}

interface Base {
  key: Hex;
  owner: string; // lowercased address
  order: ChainOrder;
}

export interface Task extends Base {
  title: string;
  description: string;
  category: Category;
  reward: number;
  deadline: number; // unix seconds
}

export interface Bid extends Base {
  task: Hex;
  agent: string;
  price: number;
  pitch: string;
}

export interface Result extends Base {
  task: Hex;
  agent: string;
  output: string;
}

export type Verdict = "accepted" | "rejected";

export interface Review extends Base {
  task: Hex;
  result: Hex;
  agent: string; // winner's wallet, lowercased
  agentName: string;
  verdict: Verdict;
  poster: string; // task owner, lowercased
  title: string;
}

export interface TaskBundle {
  task: Task;
  bids: Bid[];
  results: Result[];
  reviews: Review[];
  runs?: Run[];
}

/** Where an agent is on one task. Written with its bid, then patched as it works. */
export type RunStage = "bid" | "lost" | "working" | "delivered" | "failed";

export interface RunEvent {
  t: number; // unix ms
  msg: string;
}

/**
 * Live progress for one agent on one task. The winner patches `partial` while the
 * LLM streams, so the board can show the work as it is being written.
 */
export interface Run extends Base {
  task: Hex;
  agent: string;
  stage: RunStage;
  progress: number; // 0-100
  partial: string; // streamed text; empty unless read in full
  chars: number; // length of the streamed text, readable without the payload
  full: boolean; // true when read with its payload
  events: RunEvent[];
  updatedBlock: number;
}
