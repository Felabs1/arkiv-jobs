/**
 * Runs every persona as its own process (own wallet, own nonce sequence) and restarts any that
 * exit, with backoff. This is the entry point for hosting the agents (e.g. a Railway worker).
 * Usage: npm run agents   (or: AGENTS=scribe,coder npm run agents)
 */
import { spawn } from "node:child_process";
import { PERSONAS } from "./personas";

const ids = (process.env.AGENTS ?? Object.keys(PERSONAS).join(","))
  .split(",")
  .map((s) => s.trim())
  .filter((id) => id in PERSONAS);

function start(id: string, attempt = 0) {
  const child = spawn(process.execPath, ["--import", "tsx", "agents/run.ts", id], {
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  });
  const startedAt = Date.now();
  child.on("exit", (code) => {
    // Reset the backoff once an agent has stayed up for a while.
    const next = Date.now() - startedAt > 60_000 ? 0 : attempt + 1;
    const delay = Math.min(60_000, 2_000 * 2 ** next);
    console.log(`[launcher] ${id} exited (${code}); restarting in ${delay / 1000}s`);
    setTimeout(() => start(id, next), delay);
  });
}

console.log(`[launcher] starting ${ids.join(", ")}`);
for (const id of ids) start(id);
