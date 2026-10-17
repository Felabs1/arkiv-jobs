"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRun, isRateLimited, listBoard, publicClient, usingAccessKey } from "@/lib/arkiv";
import type { Bid, Hex, Result, Review, Run, RunEvent, Task, TaskBundle } from "@/lib/types";

/** Keep finished tasks on screen this long after their deadline, even once Arkiv has expired them. */
const KEEP_AFTER_DEADLINE_SEC = 15 * 60;
/**
 * Board poll interval; backs off on errors. Streaming doesn't depend on it: run patches
 * arrive as events and fetch just that run.
 */
const POLL_MS = 8000;
const MAX_POLL_MS = 60_000;
/** Don't re-query the whole board more often than this, whatever the events say. */
const MIN_REFRESH_GAP_MS = 3000;

interface Cache {
  tasks: Map<string, Task>;
  bids: Map<string, Bid>;
  results: Map<string, Result>;
  reviews: Map<string, Review>;
  runs: Map<string, Run>;
}

function merge<T extends { key: string }>(into: Map<string, T>, items: T[]) {
  for (const i of items) into.set(i.key, i);
}

function mergeEvents(a: RunEvent[], b: RunEvent[]): RunEvent[] {
  const seen = new Map<string, RunEvent>();
  for (const e of [...a, ...b]) seen.set(`${e.t}|${e.msg}`, e);
  return [...seen.values()].sort((x, y) => x.t - y.t).slice(-30);
}

/**
 * Keep the streamed text and step history we already have when a newer header-only copy
 * arrives; the header still updates stage, progress and length.
 */
function mergeRun(into: Map<string, Run>, next: Run) {
  const prev = into.get(next.key);
  if (!prev) return into.set(next.key, next);
  if (!next.full && next.updatedBlock < prev.updatedBlock) return;
  into.set(next.key, {
    ...next,
    partial: next.full ? next.partial : prev.partial,
    full: next.full || (prev.full && prev.partial.length >= next.chars),
    events: mergeEvents(prev.events, next.events),
  });
}

function groupByTask<T extends { task: string }>(m: Map<string, T>) {
  const g = new Map<string, T[]>();
  for (const x of m.values()) g.set(x.task, [...(g.get(x.task) ?? []), x]);
  return g;
}

export function useBoard() {
  const cache = useRef<Cache>({
    tasks: new Map(),
    bids: new Map(),
    results: new Map(),
    reviews: new Map(),
    runs: new Map(),
  });
  const [version, setVersion] = useState(0);
  const [block, setBlock] = useState(0);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false);
  const delay = useRef(POLL_MS);
  const lastRefresh = useRef(0);
  const participants = useRef(new Set<string>());
  const runFetches = useRef(new Map<string, Promise<void>>());

  /** One board query at a time. Returns false on failure so the poller can back off. */
  const refresh = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return true;
    inFlight.current = true;
    lastRefresh.current = Date.now();
    try {
      const snap = await listBoard();
      const c = cache.current;
      merge(c.tasks, snap.tasks);
      merge(c.bids, snap.bids);
      merge(c.results, snap.results);
      merge(c.reviews, snap.reviews);
      for (const r of snap.runs) mergeRun(c.runs, r);
      for (const x of [...snap.tasks, ...snap.bids, ...snap.runs]) participants.current.add(x.owner);
      setBlock(snap.block);
      setVersion((v) => v + 1);
      setError(null);
      setLoaded(true);
      return true;
    } catch (e: any) {
      setError(
        isRateLimited(e)
          ? usingAccessKey()
            ? "Arkiv RPC rate limit hit for your access key. Retrying more slowly…"
            : "The public Arkiv RPC is out of anonymous budget. Set NEXT_PUBLIC_ARKIV_RPC_URL in .env.local to your keyed URL from hub.arkiv.network/api-keys, then restart `npm run dev`."
          : (e?.shortMessage ?? e?.message ?? String(e)),
      );
      return false;
    } finally {
      inFlight.current = false;
    }
  }, []);

  /** Fetch one run in full (its streamed text). Concurrent calls for the same run share one request. */
  const fetchRun = useCallback((key: string) => {
    const existing = runFetches.current.get(key);
    if (existing) return existing;
    const p = getRun(key as Hex)
      .then((r) => {
        if (r) {
          mergeRun(cache.current.runs, r);
          setVersion((v) => v + 1);
        }
      })
      .finally(() => runFetches.current.delete(key));
    runFetches.current.set(key, p);
    return p;
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      const ok = await refresh();
      delay.current = ok ? POLL_MS : Math.min(Math.max(delay.current, POLL_MS) * 2, MAX_POLL_MS);
      if (!stopped) timer = setTimeout(loop, delay.current);
    };
    loop();

    const tick = setInterval(() => setNow(Date.now() / 1000), 1000);

    // Arkiv events cover the whole network, so only react to our own entities:
    // a patch to a run we know streams that run's text in; a new entity from someone already
    // on the board (an agent bidding, a poster) triggers a rate-limited board refresh.
    let pending: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      if (pending) return;
      const wait = Math.max(300, MIN_REFRESH_GAP_MS - (Date.now() - lastRefresh.current));
      pending = setTimeout(() => {
        pending = undefined;
        refresh();
      }, wait);
    };
    const unwatch = publicClient().watchEntityEvents({
      pollingInterval: 2000,
      onEntityPatched: (e) => {
        const key = e.entityKey.toLowerCase();
        if (cache.current.runs.has(key)) fetchRun(key);
      },
      onEntityCreated: (e) => {
        if (participants.current.has(e.owner.toLowerCase())) soon();
      },
      onError: () => {},
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(tick);
      clearTimeout(pending);
      unwatch();
    };
  }, [refresh, fetchRun]);

  /** Let the page register the connected wallet, so its own posts refresh the board at once. */
  const addParticipant = useCallback((addr: string) => participants.current.add(addr.toLowerCase()), []);

  const bundles = useMemo(() => {
    const c = cache.current;
    const bids = groupByTask(c.bids);
    const results = groupByTask(c.results);
    const reviews = groupByTask(c.reviews);
    const runs = groupByTask(c.runs);
    return [...c.tasks.values()]
      .filter((t) => now < t.deadline + KEEP_AFTER_DEADLINE_SEC)
      .sort((a, b) => b.order.block - a.order.block)
      .map(
        (task): TaskBundle => ({
          task,
          bids: bids.get(task.key) ?? [],
          results: results.get(task.key) ?? [],
          reviews: reviews.get(task.key) ?? [],
          runs: runs.get(task.key) ?? [],
        }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, now]);

  const reviews = useMemo(() => [...cache.current.reviews.values()], [version]);
  const runs = useMemo(() => [...cache.current.runs.values()], [version]);
  const bids = useMemo(() => [...cache.current.bids.values()], [version]);

  return { bundles, reviews, runs, bids, block, now, error, loaded, refresh, fetchRun, addParticipant };
}
