"use client";

import { useEffect, useMemo, useState } from "react";
import { EXPLORER, createReview, createTask, keepAlive } from "@/lib/arkiv";
import { leaderboard, taskState, winningResult } from "@/lib/rules";
import type { Hex, Profile, TaskBundle, Verdict } from "@/lib/types";
import { connectMetaMask, existingBurner, startBurner, walletClient, type Signer } from "./wallet";
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
import { AgentsCard } from "./components/AgentsCard";
import { EntityInspector, type InspectTarget } from "./components/EntityInspector";
import { AgentHistory } from "./components/AgentHistory";
import { BOARD_QUERY, BY_TASK_QUERY, PROFILE_QUERY, WHY } from "./inspect";
import { IconBars, IconBell, IconCpu, IconGrid, IconLogo, IconPlus, IconScan, IconTasks, IconTrophy, IconWallet } from "./components/icons";


const NAV = [
  { id: "overview", label: "Overview", icon: <IconGrid /> },
  { id: "live", label: "Live Work", icon: <IconScan /> },
  { id: "tasks", label: "Tasks", icon: <IconTasks /> },
  { id: "agents", label: "Agents", icon: <IconCpu /> },
  { id: "leaderboard", label: "Leaderboard", icon: <IconTrophy /> },
  { id: "activity", label: "Activity", icon: <IconBars /> },
];

export default function Board() {
  const { bundles, reviews, runs, bids, profiles, block, now, error, loaded, refresh, fetchRun, addParticipant } = useBoard();
  const [signer, setSigner] = useState<Signer | null>(null);
  const account = signer?.address ?? null;
  const [walletBusy, setWalletBusy] = useState(false);

  // A burner created earlier in this browser comes back on reload.
  useEffect(() => {
    const b = existingBurner();
    if (b) {
      addParticipant(b.address);
      setSigner(b);
    }
  }, [addParticipant]);
  const [toast, setToast] = useState<{ text: string; tx?: string; error?: boolean } | null>(null);
  const [posting, setPosting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [nav, setNav] = useState("overview");
  const [inspect, setInspect] = useState<InspectTarget | null>(null);

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
  // Agents with a live profile lease (they renew it every few minutes while running).
  const activeAgents = useMemo(() => profiles.filter((p) => !block || p.expiresAt > block).length, [profiles, block]);
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

  async function adoptSigner(get: () => Promise<Signer>) {
    setWalletBusy(true);
    try {
      const s = await get();
      addParticipant(s.address);
      setSigner(s);
      setToast({ text: s.kind === "burner" ? "Test wallet ready. You can post tasks and review results." : "MetaMask connected" });
      return true;
    } catch (e: any) {
      setToast({ text: e?.message ?? String(e), error: true });
      return false;
    } finally {
      setWalletBusy(false);
    }
  }
  const onConnect = () => adoptSigner(connectMetaMask);
  const onTryIt = () => adoptSigner(() => startBurner((text) => setToast({ text })));

  async function onPost(t: NewTask): Promise<boolean> {
    if (!signer) return false;
    try {
      const w = await walletClient(signer);
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

  async function onKeepAlive(key: Hex) {
    if (!signer) {
      setToast({ text: "Get a test wallet first (Try it now), then any wallet can keep this result alive.", error: true });
      return;
    }
    try {
      const w = await walletClient(signer);
      const { txHash } = await keepAlive(w, key, 1);
      setToast({ text: "Kept alive for another day. Anyone can extend results, not just the agent.", tx: txHash });
      refresh();
    } catch (e: any) {
      setToast({ text: e?.shortMessage ?? e?.message ?? String(e), error: true });
    }
  }

  function inspectProfile(p: Profile) {
    setInspect({
      title: `${p.agent}'s public profile`,
      type: "profile",
      entity: p,
      query: PROFILE_QUERY,
      why: WHY.profile,
      extra: <AgentHistory creator={p.creator} />,
    });
  }

  async function onReview(b: TaskBundle, verdict: Verdict) {
    if (!signer) return;
    const result = winningResult(b.task, b.bids, b.results);
    if (!result) return;
    try {
      const w = await walletClient(signer);
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
            <button className="round" onClick={onTryIt} aria-label="Get a test wallet">
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
          {account ? (
            <span className="seg" title={account}>
              <IconWallet /> {signer?.kind === "burner" ? "Test wallet " : ""}
              {`${account.slice(0, 6)}…${account.slice(-4)}`}
            </span>
          ) : (
            <button className="seg" onClick={onTryIt} disabled={walletBusy} title="Creates a Tiramisu test wallet in this browser and funds it">
              <IconWallet /> {walletBusy ? "Preparing…" : "Try it now"}
            </button>
          )}
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
                onInspect={setInspect}
                onKeepAlive={onKeepAlive}
                block={block}
              />
            ))}
          </div>
        </section>
        <aside className="side-col">
          <AgentsCard profiles={profiles} leaders={leaders} block={block} onInspect={inspectProfile} />
          <Leaderboard rows={leaders} />
        </aside>
      </div>

      <EntityInspector target={inspect} block={block} onClose={() => setInspect(null)} />

      <PostForm
        open={posting}
        connected={!!account}
        walletBusy={walletBusy}
        onClose={() => setPosting(false)}
        onTryIt={onTryIt}
        onConnect={onConnect}
        onPost={onPost}
      />
    </div>
  );
}
