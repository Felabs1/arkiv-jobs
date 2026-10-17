"use client";

import { createWalletClient } from "@arkiv-network/sdk";
import { custom, numberToHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CHAIN, publicClient, rpcTransport } from "@/lib/arkiv";

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<any>; on?: any; removeListener?: any };
  }
}

export type SignerKind = "metamask" | "burner";
export interface Signer {
  address: Address;
  kind: SignerKind;
}

const CHAIN_ID_HEX = numberToHex(CHAIN.id);
const BURNER_KEY = "arkiv-jobs-burner";

// ---------- MetaMask ----------

async function ensureChain() {
  const eth = window.ethereum!;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (e: any) {
    // 4902: chain not added to MetaMask yet
    if (e?.code !== 4902 && e?.data?.originalError?.code !== 4902) throw e;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_ID_HEX,
          chainName: CHAIN.name,
          nativeCurrency: CHAIN.nativeCurrency,
          rpcUrls: CHAIN.rpcUrls.default.http,
          blockExplorerUrls: ["https://tiramisu.explorer.arkiv.network"],
        },
      ],
    });
  }
}

export async function connectMetaMask(): Promise<Signer> {
  if (!window.ethereum) throw new Error("MetaMask not found. Use “Try it now” for an instant test wallet instead.");
  const [addr] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as Address[];
  await ensureChain();
  return { address: addr, kind: "metamask" };
}

// ---------- Burner (testnet-only key kept in this browser) ----------

function loadBurnerKey(): Hex | null {
  try {
    const k = localStorage.getItem(BURNER_KEY);
    return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : null;
  } catch {
    return null;
  }
}

/** The burner already created in this browser, if any. */
export function existingBurner(): Signer | null {
  const k = loadBurnerKey();
  return k ? { address: privateKeyToAccount(k).address, kind: "burner" } : null;
}

/**
 * Create (or reuse) a burner wallet and make sure it has a little test GLM.
 * The key never leaves this browser; the server only sends GLM to its address.
 */
export async function startBurner(onStatus?: (s: string) => void): Promise<Signer> {
  let k = loadBurnerKey();
  if (!k) {
    k = generatePrivateKey();
    try {
      localStorage.setItem(BURNER_KEY, k);
    } catch {
      /* private mode: the burner lives for this tab only */
    }
  }
  const address = privateKeyToAccount(k).address;
  const balance = await publicClient().getBalance({ address });
  if (balance < 2_000_000_000_000_000n) {
    onStatus?.("Funding your test wallet with Tiramisu GLM…");
    const res = await fetch("/api/fund", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Funding failed (${res.status})`);
  }
  return { address, kind: "burner" };
}

// ---------- signing client for whichever wallet is active ----------

export async function walletClient(signer: Signer) {
  if (signer.kind === "burner") {
    const k = loadBurnerKey();
    if (!k) throw new Error("Test wallet missing. Click “Try it now” again.");
    return createWalletClient({ chain: CHAIN, transport: rpcTransport(), account: privateKeyToAccount(k) });
  }
  await ensureChain();
  return createWalletClient({ chain: CHAIN, transport: custom(window.ethereum!), account: signer.address });
}
