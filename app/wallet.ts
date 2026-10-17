"use client";

import { createWalletClient } from "@arkiv-network/sdk";
import { custom, numberToHex, type Address } from "viem";
import { CHAIN } from "@/lib/arkiv";

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<any>; on?: any; removeListener?: any };
  }
}

const CHAIN_ID_HEX = numberToHex(CHAIN.id);

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

export async function connect(): Promise<Address> {
  if (!window.ethereum) throw new Error("MetaMask not found. Install it to post tasks.");
  const [addr] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as Address[];
  await ensureChain();
  return addr;
}

export async function walletClient(address: Address) {
  await ensureChain();
  return createWalletClient({ chain: CHAIN, transport: custom(window.ethereum!), account: address });
}
