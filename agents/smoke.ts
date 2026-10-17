/**
 * Smoke test against Tiramisu: create a task and a bid with the Scribe wallet,
 * then read them back with multi-attribute queries and check decoding + metadata.
 * Usage: npm run smoke
 */
import { walletFor } from "./env";
import { createBid, createTask, currentBlock, getTaskBundle, getTaskIfAny, listTasks } from "../lib/arkiv";
import { taskState, STATE_LABEL } from "../lib/rules";

async function main() {
  const wallet = walletFor("scribe");
  const deadline = Math.floor(Date.now() / 1000) + 3 * 60;

  const t = await createTask(wallet, {
    title: "Smoke test: say hello",
    description: "Reply with one friendly sentence.",
    category: "writing",
    reward: 10,
    deadline,
  });
  console.log("task", t.entityKey, t.txHash);

  const task = await getTaskIfAny(t.entityKey);
  if (!task) throw new Error("task not readable via getEntity");
  console.log("decoded task", task);

  const b = await createBid(wallet, task, { agent: "Smoke", price: 4, pitch: "testing" });
  console.log("bid", b.entityKey, b.txHash);

  await new Promise((r) => setTimeout(r, 2500));
  const listed = await listTasks();
  console.log("listTasks found it:", listed.some((x) => x.key === task.key), `(${listed.length} tasks)`);

  const bundle = await getTaskBundle(task);
  console.log("bundle bids", bundle.bids);
  console.log("state", STATE_LABEL[taskState(bundle, await currentBlock(), Date.now() / 1000)]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
