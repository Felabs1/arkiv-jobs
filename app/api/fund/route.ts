/**
 * Tiny testnet "faucet relay" so judges can try the board without MetaMask or a faucet visit.
 * It only sends a little Tiramisu GLM to a browser-generated burner address. Everything the
 * burner then does (posting tasks, reviewing results) is signed in the browser, so `$creator`
 * on Arkiv is still the user, not this server. This route is deliberately kept off Arkiv.
 */
import { NextResponse } from "next/server";
import { createWalletClient, isAddress, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN, publicClient, rpcTransport } from "@/lib/arkiv";

const AMOUNT = parseEther("0.02"); // ~100 task posts or reviews
const MIN_BALANCE = parseEther("0.002"); // top up only below this
const PER_IP_WINDOW_MS = 60 * 60_000;
const PER_IP_MAX = 3;

// Best effort (per server instance). Enough to stop casual draining of a testnet sponsor.
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < PER_IP_WINDOW_MS);
  if (recent.length >= PER_IP_MAX) return true;
  hits.set(ip, [...recent, now]);
  return false;
}

export async function POST(req: Request) {
  const key = process.env.SPONSOR_PRIVATE_KEY as Hex | undefined;
  if (!key) return NextResponse.json({ error: "Test wallets are not enabled on this deployment." }, { status: 503 });

  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "Invalid address" }, { status: 400 });

  const balance = await publicClient().getBalance({ address: address as Address });
  if (balance >= MIN_BALANCE) return NextResponse.json({ ok: true, funded: false });

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many test wallets from this network. Try again in an hour." }, { status: 429 });
  }

  try {
    const sponsor = createWalletClient({ chain: CHAIN, transport: rpcTransport(), account: privateKeyToAccount(key) });
    const hash = await sponsor.sendTransaction({ to: address as Address, value: AMOUNT });
    await publicClient().waitForTransactionReceipt({ hash });
    return NextResponse.json({ ok: true, funded: true, txHash: hash });
  } catch (e: any) {
    return NextResponse.json({ error: `Funding failed: ${e?.shortMessage ?? e?.message ?? e}` }, { status: 502 });
  }
}
