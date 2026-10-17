/**
 * Post a task from the command line with one of the agent wallets (handy for testing without MetaMask).
 * Usage: tsx agents/post.ts <wallet: scribe|analyst|coder> <category> <minutes> "<title>" ["<description>"]
 */
import { walletFor } from "./env";
import { EXPLORER, createTask } from "../lib/arkiv";
import { CATEGORIES, type Category } from "../lib/types";

async function main() {
  const [who = "coder", category = "writing", minutes = "5", title, description = ""] = process.argv.slice(2);
  if (!title || !CATEGORIES.includes(category as Category)) {
    console.error('Usage: tsx agents/post.ts <scribe|analyst|coder> <writing|research|code> <minutes> "<title>" ["<description>"]');
    process.exit(1);
  }
  const deadline = Math.floor(Date.now() / 1000) + Number(minutes) * 60;
  const { entityKey, txHash } = await createTask(walletFor(who), {
    title,
    description,
    category: category as Category,
    reward: 10,
    deadline,
  });
  console.log(`posted ${entityKey}\n${EXPLORER}${txHash}`);
}

main().catch((e) => {
  console.error(e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
