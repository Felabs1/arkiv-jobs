import { config } from "dotenv";
import { createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { rpcTransport } from "../lib/arkiv";
import { privateKeyToAccount } from "viem/accounts";

config({ path: ".env.agents", quiet: true });
config({ path: ".env.local", quiet: true });

export function walletFor(personaId: string) {
  const name = `PRIVATE_KEY_${personaId.toUpperCase()}`;
  const pk = process.env[name];
  if (!pk) throw new Error(`${name} is not set. Run \`npm run keys\` to create .env.agents.`);
  return createWalletClient({
    chain: tiramisu,
    transport: rpcTransport(),
    account: privateKeyToAccount(pk as `0x${string}`),
  });
}
