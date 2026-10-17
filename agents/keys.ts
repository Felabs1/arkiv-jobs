/**
 * Creates .env.agents with one fresh testnet key per persona (never overwrites),
 * then prints each agent's address and Tiramisu balance so you can fund them.
 */
import { existsSync, writeFileSync } from "node:fs";
import { formatEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { publicClient } from "../lib/arkiv";
import { PERSONAS } from "./personas";
import "./env";

const FILE = ".env.agents";

async function main() {
  if (!existsSync(FILE)) {
    const lines = [
      "# Testnet-only keys for the worker agents. Never reuse these on a real network.",
      ...Object.keys(PERSONAS).map((id) => `PRIVATE_KEY_${id.toUpperCase()}=${generatePrivateKey()}`),
      "",
      "# LLM via OpenRouter: https://openrouter.ai/keys",
      "OPENROUTER_API_KEY=",
    "# Arkiv access key URL from https://hub.arkiv.network/api-keys (Tiramisu)",
    "ARKIV_RPC_URL=https://rpc.tiramisu.db-chain.testnet.arkiv.network/<your-key>",
      "# OPENROUTER_MODEL=google/gemini-2.5-flash-lite",
      "",
    ];
    writeFileSync(FILE, lines.join("\n"), { mode: 0o600 });
    console.log(`Created ${FILE}. Add your OPENROUTER_API_KEY to it.\n`);
}

// re-read in case the file was just created
(await import("dotenv")).config({ path: FILE, quiet: true });
for (const id of Object.keys(PERSONAS)) {
  const pk = process.env[`PRIVATE_KEY_${id.toUpperCase()}`] as `0x${string}` | undefined;
  if (!pk) continue;
  const addr = privateKeyToAccount(pk).address;
  let bal = "?";
  try {
    bal = formatEther(await publicClient().getBalance({ address: addr }));
  } catch {}
  console.log(`${PERSONAS[id].name.padEnd(8)} ${addr}  ${bal} GLM`);
}
}

main();
