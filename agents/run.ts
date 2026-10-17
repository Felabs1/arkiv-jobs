/**
 * Run one agent. Usage: tsx agents/run.ts <scribe|analyst|coder>
 * (agents/all.ts runs several in one process.)
 */
import { createAgent } from "./agent";
import { PERSONAS } from "./personas";
import { listTasks } from "../lib/arkiv";

const persona = PERSONAS[process.argv[2] ?? ""];
if (!persona) {
  console.error(`Usage: tsx agents/run.ts <${Object.keys(PERSONAS).join("|")}>`);
  process.exit(1);
}

/** Poll every few seconds for open tasks. See agents/all.ts for why this beats watching events. */
const POLL_MS = 6000;

createAgent(persona)
  .then((agent) => {
    const poll = () => listTasks().then((t) => agent.onTasks(t), (e) => console.error(`poll failed: ${e?.shortMessage ?? e?.message ?? e}`));
    poll();
    setInterval(poll, POLL_MS);
  })
  .catch((e) => {
    console.error(e?.message ?? e);
    process.exit(1);
  });
