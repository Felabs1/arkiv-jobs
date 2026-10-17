/**
 * Runs every persona in one Node process: each agent keeps its own wallet, nonce lock, runs and
 * lease (see agents/agent.ts), but they share one runtime and one task poll. That keeps memory
 * well inside a 512 MB host and uses a third of the query quota of separate processes.
 * Usage: npm run agents   (or: AGENTS=scribe,coder npm run agents)
 *
 * If PORT is set (Render web services set it), a tiny status server answers on it, so the
 * agents can run as a free web service kept awake by an uptime pinger.
 */
import { createServer } from "node:http";
import { createAgent, type Agent } from "./agent";
import { PERSONAS } from "./personas";
import { listTasks } from "../lib/arkiv";

/**
 * Poll for open tasks (deadline > now) every few seconds. Watching creation events would fire for
 * every entity on the whole Arkiv network and cost a lookup each; one filtered query is far cheaper,
 * and the bid window only opens with the first bid, so a few seconds of latency is harmless.
 */
const POLL_MS = 6000;
const RETRY_MS = 30_000;

const ids = (process.env.AGENTS ?? Object.keys(PERSONAS).join(","))
  .split(",")
  .map((s) => s.trim())
  .filter((id) => id in PERSONAS);

const agents = new Map<string, Agent>();
const startedAt = Date.now();
let lastPoll = { at: 0, tasks: 0, error: "" };

// One agent's bug must not take the others down.
process.on("unhandledRejection", (e: any) => console.error("[launcher] unhandled:", e?.message ?? e));
process.on("uncaughtException", (e) => console.error("[launcher] uncaught:", e?.message ?? e));

async function start(id: string) {
  try {
    agents.set(id, await createAgent(PERSONAS[id]));
  } catch (e: any) {
    console.error(`[launcher] ${id} failed to start: ${e?.message ?? e}; retrying in ${RETRY_MS / 1000}s`);
    setTimeout(() => start(id), RETRY_MS);
  }
}

async function poll() {
  try {
    const tasks = await listTasks();
    lastPoll = { at: Date.now(), tasks: tasks.length, error: "" };
    for (const a of agents.values()) a.onTasks(tasks);
  } catch (e: any) {
    lastPoll = { ...lastPoll, error: e?.shortMessage ?? e?.message ?? String(e) };
    console.error(`[launcher] poll failed: ${lastPoll.error}`);
  }
}

console.log(`[launcher] starting ${ids.join(", ")} in one process`);
Promise.all(ids.map(start)).then(() => {
  poll();
  setInterval(poll, POLL_MS);
});

if (process.env.PORT) {
  createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        up_s: Math.round((Date.now() - startedAt) / 1000),
        agents: [...agents.keys()],
        last_poll_s_ago: lastPoll.at ? Math.round((Date.now() - lastPoll.at) / 1000) : null,
        open_tasks: lastPoll.tasks,
        poll_error: lastPoll.error || undefined,
        rss_mb: Math.round(process.memoryUsage().rss / 1e6),
      }),
    );
  }).listen(Number(process.env.PORT), () => console.log(`[launcher] status on :${process.env.PORT}`));
}
