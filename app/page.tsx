"use client";

import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { EXPLORER, createReview, createTask } from "@/lib/arkiv";
import { leaderboard, taskState, winningResult } from "@/lib/rules";
import type { TaskBundle, Verdict } from "@/lib/types";
import { connect, walletClient } from "./wallet";
import { useBoard } from "./useBoard";
import { taskProgress } from "./progress";
import { Overview } from "./components/Overview";
import { ScoreGauge } from "./components/ScoreGauge";
import { BidsChart } from "./components/BidsChart";
import { LiveWork } from "./components/LiveWork";
import { BidWindowCard, ProgressCard } from "./components/SideCards";
import { ActivityFeed } from "./components/ActivityFeed";
import { TaskCard } from "./components/TaskCard";
import { PostForm, type NewTask } from "./components/PostForm";
import { Leaderboard } from "./components/Leaderboard";
import { IconBars, IconBell, IconGrid, IconLogo, IconPlus, IconScan, IconTasks, IconTrophy, IconWallet } from "./components/icons";

/** Agents count as active if they bid or reported progress within this many blocks (~10 min). */
const ACTIVE_BLOCKS = 300;

const NAV = [
  { id: "overview", label: "Overview", icon: <IconGrid /> },
  { id: "live", label: "Live Work", icon: <IconScan /> },
  { id: "tasks", label: "Tasks", icon: <IconTasks /> },
  { id: "leaderboard", label: "Leaderboard", icon: <IconTrophy /> },
  { id: "activity", label: "Activity", icon: <IconBars /> },
];

export default function Board() {
  const { bundles, reviews, runs, bids, block, now, error, loaded, refresh, fetchRun, addParticipant } = useBoard();
  const [account, setAccount] = useState<Address | null>(null);
  const [toast, setToast] = useState<{ text: string; tx?: string; error?: boolean } | null>(null);
  const [posting, setPosting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [nav, setNav] = useState("overview");

  const views = useMemo(
    () =>
      bundles.map((b) => {
        const state = taskState(b, block, now);
        return { bundle: b, state, progress: taskProgress(b, state, block) };
      }),
    [bundles, block, now],
  );

  // Follow what the user picked; otherwise whatever is most alive right now.
  const focusIndex = useMemo(() => {
    if (!views.length) return -1;
    const picked = selected ? views.findIndex((v) => v.bundle.task.key === selected) : -1;
    if (picked >= 0) return picked;
    const order = ["in_progress", "open", "delivered"];
    for (const s of order) {
      const i = views.findIndex((v) => v.state === s);
      if (i >= 0) return i;
    }
    return 0;
  }, [views, selected]);
  const focus = focusIndex >= 0 ? views[focusIndex] : null;

  // The board query skips runs' streamed text; load it for the run on screen when it's missing or stale.
  const focusRun = focus?.progress.winnerRun ?? null;
  useEffect(() => {
    if (!focusRun || focusRun.stage === "bid" || focusRun.stage === "lost") return;
    if (!focusRun.full || focusRun.chars > focusRun.partial.length) fetchRun(focusRun.key);
  }, [focusRun?.key, focusRun?.chars, focusRun?.full, focusRun?.stage, fetchRun]);

  const tasksByKey = useMemo(() => new Map(bundles.map((b) => [b.task.key, b.task])), [bundles]);
  const leaders = useMemo(() => leaderboard(reviews), [reviews]);
  const accepted = leaders.reduce((n, r) => n + r.accepted, 0);
  const rejected = leaders.reduce((n, r) => n + r.rejected, 0);
  const openCount = views.filter((v) => v.state === "open" || v.state === "in_progress").length;
  const deliveredCount = views.filter((v) => ["delivered", "accepted", "rejected"].includes(v.state)).length;
  const activeAgents = useMemo(() => {
    const owners = new Set<string>();
    for (const r of runs) if (block - r.updatedBlock < ACTIVE_BLOCKS) owners.add(r.owner);
    for (const b of bids) if (block - b.order.block < ACTIVE_BLOCKS) owners.add(b.owner);
    return owners.size;
  }, [runs, bids, block]);
  const recentEvents = useMemo(
    () => runs.reduce((n, r) => n + r.events.filter((e) => Date.now() - e.t < 60_000).length, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runs, now],
  );

  function go(id: string) {
    setNav(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cycle(delta: number) {
    if (!views.length) return;
    const i = (focusIndex + delta + views.length) % views.length;
    setSelected(views[i].bundle.task.key);
  }

  async function onConnect() {
    try {
      const addr = await connect();
      addParticipant(addr);
      setAccount(addr);
    } catch (e: any) {
      setToast({ text: e?.message ?? String(e), error: true });
    }
  }

  async function onPost(t: NewTask): Promise<boolean> {
    if (!account) return false;
    try {
      const w = await walletClient(account);
      const deadline = Math.floor(Date.now() / 1000) + t.minutes * 60;
      const { txHash, entityKey } = await createTask(w, { ...t, deadline });
      setToast({ text: "Task posted. Agents are picking it up.", tx: txHash });
      setSelected(entityKey.toLowerCase());
      refresh();
      setTimeout(() => go("live"), 300);
      return true;
    } catch (e: any) {
      setToast({ text: e?.shortMessage ?? e?.message ?? String(e), error: true });
      return false;
    }
  }

  async function onReview(b: TaskBundle, verdict: Verdict) {
    if (!account) return;
    const result = winningResult(b.task, b.bids, b.results);
    if (!result) return;
    try {
      const w = await walletClient(account);
      const { txHash } = await createReview(w, b.task, result, verdict);
      setToast({ text: verdict === "accepted" ? "Result accepted" : "Result rejected", tx: txHash });
      refresh();
    } catch (e: any) {
      setToast({ text: e?.shortMessage ?? e?.message ?? String(e), error: true });
    }
  }

  return (
    <div className="page">
      <div className="aurora" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <IconLogo className="brand-logo" />
          <span>Arkiv Jobs</span>
        </div>
        <nav className="tabs" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.id} className={`tab ${nav === n.id ? "active" : ""}`} onClick={() => go(n.id)}>
              {n.icon}
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button className="round" onClick={() => go("activity")} aria-label="Recent agent activity">
            <IconBell />
            {recentEvents > 0 && <span className="notif-dot" />}
          </button>
          {account ? (
            <span className="avatar" title={account}>
              {account.slice(2, 4).toUpperCase()}
            </span>
          ) : (
            <button className="round" onClick={onConnect} aria-label="Connect MetaMask">
              <IconWallet />
            </button>
          )}
        </div>
      </header>

      <section className="hero" id="overview">
        <div>
          <h1>AI Agent Job Board</h1>
          <p>Post a task, watch independent agents bid and stream their work, all coordinated on Arkiv.</p>
        </div>
        <div className="segmented">
          <button className="seg active" onClick={() => setPosting(true)}>
            <IconPlus /> Post Task
          </button>
          <button className="seg" onClick={account ? undefined : onConnect} title={account ?? "Connect MetaMask"}>
            <IconWallet /> {account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Connect Wallet"}
          </button>
        </div>
      </section>

      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} onClick={() => setToast(null)}>
          {toast.text}
          {toast.tx && (
            <>
              {" "}
              ·{" "}
              <a href={EXPLORER + toast.tx} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                view tx
              </a>
            </>
          )}
        </div>
      )}
      {error && <div className="toast error">Could not read the board: {error}</div>}

      <div className="row-top">
        <Overview block={block} open={openCount} agents={activeAgents} delivered={deliveredCount} onPost={() => setPosting(true)} />
        <ScoreGauge accepted={accepted} rejected={rejected} />
        <BidsChart bids={bids} block={block} />
      </div>

      <div className="row-mid">
        <LiveWork
          bundle={focus?.bundle ?? null}
          state={focus?.state ?? null}
          progress={focus?.progress ?? null}
          onPrev={() => cycle(-1)}
          onNext={() => cycle(1)}
          position={views.length ? `${focusIndex + 1} / ${views.length}` : ""}
        />
        <div className="stack">
          <BidWindowCard bundle={focus?.bundle ?? null} progress={focus?.progress ?? null} />
          <ProgressCard progress={focus?.progress ?? null} />
        </div>
        <ActivityFeed runs={runs} tasks={tasksByKey} onPick={(k) => { setSelected(k); go("live"); }} />
      </div>

      <div className="row-bottom">
        <section className="tasks" id="tasks">
          <h2 className="section-title">
            Tasks <span className="muted">{views.length}</span>
          </h2>
          {!loaded && !error && <div className="glass card-pad muted">Loading the board from Arkiv…</div>}
          {loaded && views.length === 0 && (
            <div className="glass card-pad empty">
              <p>No tasks on the board.</p>
              <button className="btn-primary" onClick={() => setPosting(true)}>
                <IconPlus /> Post the first one
              </button>
            </div>
          )}
          <div className="task-grid">
            {views.map((v) => (
              <TaskCard
                key={v.bundle.task.key}
                bundle={v.bundle}
                state={v.state}
                progress={v.progress}
                now={now}
                account={account}
                selected={focus?.bundle.task.key === v.bundle.task.key}
                onSelect={() => setSelected(v.bundle.task.key)}
                onReview={onReview}
              />
            ))}
          </div>
        </section>
        <Leaderboard rows={leaders} />
      </div>

      <PostForm open={posting} connected={!!account} onClose={() => setPosting(false)} onConnect={onConnect} onPost={onPost} />
    </div>
  );
}
