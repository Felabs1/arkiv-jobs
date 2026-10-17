# Friction report

This is what we hit while building Arkiv Jobs on Tiramisu, 17–18 October 2026. Each entry gives what we expected, what happened, how to reproduce it, and what would fix it. Entries marked ✅ are paths that worked as documented. They're listed so the team knows those surfaces were exercised.

**Environment:** `@arkiv-network/sdk` 0.8.1 (started on 0.6.8, see #1), `viem` 2.57.7, Node 24.6.0, Next.js 15, macOS 15 (Darwin 25.5). Network: Tiramisu, chain 7738577.

---

## 1. A project created from older examples starts on a retired network with an incompatible SDK

- **Surface:** TypeScript SDK and docs (networks)
- **Expected:** `npm install @arkiv-network/sdk` plus the `kaolin` or `braga` chain from older guides would connect.
- **Actual:** our scaffold pinned `@arkiv-network/sdk@^0.6.0`, which resolved to 0.6.8 and only exports `kaolin`, `braga` and `localhost`.
  - Kaolin was retired on 15 May 2026 and Braga on 12 August 2026. Their RPCs time out with no error: `curl https://braga.hoodi.arkiv.network/rpc` hangs until timeout.
  - Tiramisu needs 0.8, and the 0.6 → 0.8 changes are breaking:
    - `subscribeEntityEvents(handlers, interval)` became `watchEntityEvents({ … })`, which is no longer async.
    - Attributes changed from `[{ key, value }]` to `{ key: value }` with typed values (`u64(…)`).
    - `expiresIn: seconds` became `expires: ExpirationTime.…`.
    - `buildQuery().where(eq())…withPayload()` became `select(…).where(…)`.
    - `Entity.createdAtBlock`, `transactionIndexInBlock` and `operationIndexInTransaction` became just `createdAt`. See #6.
    - `accounts` is no longer exported, so `privateKeyToAccount` must come from `viem/accounts`.
- **Repro:** `npm i @arkiv-network/sdk@0.6.8`, then `createPublicClient({ chain: braga, transport: http() }).getBlockNumber()` hangs.
- **Fix:** mark the 0.6/0.7 releases deprecated on npm, pointing at 0.8 and the "Older networks" page. Ship a short 0.6 → 0.8 migration table (the list above). Have retired RPC hostnames return a clear error such as HTTP 410 "network retired, use Tiramisu", not a silent timeout.

## 2. `watchEntities` does not exist

- **Surface:** docs and LLM-generated code
- **Expected:** our design notes (written from memory of the docs) used `watchEntities` to react to new tasks.
- **Actual:** no SDK version has it. 0.6 has `subscribeEntityEvents` and 0.8 has `watchEntityEvents`. AI coding assistants also produce `watchEntities`, so other builders will hit this.
- **Fix:** add `watchEntities` as a documented alias, or add a "did you mean `watchEntityEvents`" note on the Live Events page.

## 3. A rate-limited query looks like a hang

- **Surface:** public RPC, TypeScript SDK (viem transport)
- **Expected:** after the anonymous budget runs out, a query fails fast with a JSON-RPC error.
- **Actual:** the RPC answers HTTP 429 with a body that isn't JSON-RPC: `{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; …"}`. With default transport settings, viem retries with backoff, so `select(...).fetch()` seemed to hang for over 45 seconds before we inspected it with curl. Keyed requests later returned `{"error":"QUOTA_EXCEEDED","message":"quota exhausted"}` the same way.
- **Repro:** use up the anonymous budget, then:
  ```bash
  curl -s -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["type = str(\"task\")",{"select":{"key":true}}]}' \
    https://rpc.tiramisu.db-chain.testnet.arkiv.network
  ```
- **Fix:** return a standard JSON-RPC error object (e.g. code -32005 "limit exceeded") with a `Retry-After` header. In the SDK, treat 429 as non-retryable by default and throw a typed `RateLimitedError` that includes the Hub link.

## 4. Query quota runs out fast, and the cost per query is invisible

- **Surface:** Hub access keys, `watchEntityEvents`
- **Expected:** a monthly quota would last a hackathon-sized app with three agents and one board.
- **Actual:** one afternoon of development used up the key (`QUOTA_EXCEEDED`). The cause, found by reading our own code: `watchEntityEvents` reports every entity created on the whole network, with no attribute filter. To know whether an event was ours, we had to call `getEntity` (agents) or re-run the board query (UI) per event. On top of that, the board selected `"*"`, including large streamed-text payloads. Nothing in the Hub or the responses showed which calls were expensive.
- **Workaround:** board queries now select headers only (`{ key, owner, createdAt, updatedAt, attributes }`). The UI reacts only to patches of entity keys it already knows. Agents poll a range-filtered query (`deadline > now`) instead of watching. Block heights use `eth_blockNumber`, which isn't charged against query quota.
- **Fix:** server-side filtered subscriptions, e.g. `watchEntityEvents({ where: eq("ns","jobboard-v1") })`. A cost-units field in each `arkiv_query` response, or a per-method breakdown in the Hub Usage tab.

## 5. A camelCase attribute name passes the SDK but reverts on-chain

- **Surface:** TypeScript SDK `createEntity`, Arkiv contract
- **Expected:** `agentName` is a valid attribute name. The revert message says the charset is `"A"-"Z", "a"-"z", "0"-"9", ".", "-" and "_"`.
- **Actual:** the transaction reverts: `Ident32InvalidByte(5, 0x4e)` ("an attribute name holds "N" (0x4e) at byte 5, which is outside the name charset"). Uppercase letters are rejected even though the message lists them. The SDK's `validateAttributeName` didn't catch it client-side, so we paid gas to find out.
- **Repro:**
  ```ts
  await wallet.createEntity({ payload: jsonToPayload({}), contentType: "application/json",
    attributes: { agentName: "x" }, expires: ExpirationTime.fromHours(1) })
  ```
- **Fix:** make the SDK's name validation match the contract (lowercase only?), and correct the charset in the error text.

## 6. Entities created in the same block can't be ordered

- **Surface:** entity metadata (0.8)
- **Expected:** to order bids deterministically, "earliest bid wins ties", we used block, then transaction index, then operation index, which 0.6 exposed.
- **Actual:** 0.8 only exposes `createdAt` (a block number). Two bids in the same block can't be ordered by arrival. We break ties by entity key, which is deterministic but arbitrary, and a bidder could grind the salt for a lower key. Events do carry `(blockNumber, logIndex)`, but only if you were watching when they happened.
- **Related:** an entity read with `select("*")` doesn't include its creation transaction hash either. To link "view on explorer" to the transaction rather than the creator's address page, we look up the `EntityCreated` log by `entityKey` in the creation block: `getLogs({ event: EntityCreated, args: { entityKey }, fromBlock: createdAt, toBlock: createdAt })` (`findCreationTx` in `lib/arkiv.ts`).
- **Fix:** add `createdAtTxIndex`, `createdAtLogIndex` and `createdInTx` back as selectable fields.

## 7. The node rejects `!=` although the SDK exports `ne()`

- **Surface:** query language
- **Expected:** `ne("type", "run")` would return everything except runs.
- **Actual:** `Query rejected (type, -32002): Requested resource not available.. Query: ns = str('jobboard-v1') AND type != str('run')`.
- **Workaround:** `or(eq("type","task"), eq("type","bid"), …)`.
- **Fix:** support `!=` on string attributes in the node, or remove `ne()` and document why. The error text "Requested resource not available" doesn't point at the operator.

## 8. The Tiramisu chain definition has no block explorer

- **Surface:** `@arkiv-network/sdk/chains` (`tiramisu`), MetaMask
- **Expected:** `tiramisu.blockExplorers.default.url` exists, as it did for `kaolin` and `braga`, so links and `wallet_addEthereumChain` work out of the box.
- **Actual:** it's `undefined`. We hardcoded `https://tiramisu.explorer.arkiv.network`.
- **Fix:** add `blockExplorers` to the chain object.

## 9. Lifetimes must be a multiple of the block time

- **Surface:** `ExpirationTime`
- **Actual:** `ExpirationTime.fromSeconds(45)` throws "a lifetime must be a multiple of the 2s block time". The message is clear and suggests valid values. ✅ We list it because it surprises people coming from second-based expiry. `ExpirationTime.atDate(new Date(...))` avoids it entirely and fits deadlines perfectly.

## 10. A short RPC outage shows up as an opaque transaction error

- **Surface:** public and keyed RPC, `createEntity`
- **When:** 18 October 2026, around 21:10 UTC.
- **Actual:**
  - `eth_blockNumber` on the public RPC returned HTTP 502.
  - The keyed URL took about 9.4 s.
  - An agent's `createEntity` (profile) failed with `Transaction failed: Execution error without revert data`.
  - All three were fine about 5 minutes later.
- **Impact:** the error text reads like a contract revert, so we first looked for a bug in our payload. Our agent had also skipped publishing its presence entity until restarted. We now retry on the next heartbeat (`renewLease` in `agents/run.ts`).
- **Fix:** surface upstream 5xx as a transport error (e.g. `RpcUnavailableError`), not an execution error. A public status page for Tiramisu would also help.

## 11. The Origins allowlist blocks server-side clients entirely

- **Surface:** Hub access keys (Origins allowlist), HTTP RPC
- **Expected:** the docs say the Origins list is for "websites that can use the key from a browser" and that "non-browser clients can forge the Origin header, so treat this as attribution, not access control". We read this as: browsers get checked, server clients carry on.
- **Actual:** as soon as one origin was added, every request **without** an `Origin` header got `HTTP 403 {"error":"ORIGIN_FORBIDDEN","message":"origin not allowed for this key"}`. That broke our hosted agents (Node, no Origin) and our server-side funding route within a minute, with only a 403 in the logs.
- **Repro:** add `https://example.app` to a key's Origins, then:
  ```bash
  curl -s -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
    https://rpc.tiramisu.db-chain.testnet.arkiv.network/<key>          # 403 ORIGIN_FORBIDDEN
  curl ... -H 'Origin: https://example.app' ...                         # 200
  ```
- **Workaround:** server-side clients send the app's origin explicitly (`fetchOptions.headers.Origin`, see `rpcTransport` in `lib/arkiv.ts`).
- **Fix:** document that a non-empty Origins list rejects requests without an Origin header, or let requests with no Origin through and leave those to the IP allowlist. Better still, allow a second key per wallet so browser and server traffic can use separate keys and quotas.

## 12. ✅ Worked as documented

- `executeBatch` with two creates (bid and run) in one transaction, and with a create plus a patch (result and closing the run) in one transaction. `createdEntities` comes back in order.
- `patchEntity` with `set` and `payload`, used about once a block to stream an agent's partial output. Each patch fires `EntityPatched` to watchers.
- Typed numeric ranges: `gt("deadline", u64(now))` on a `u64` attribute.
- `ExpirationTime.atDate` for "expires at the deadline". Expired tasks disappear with no cleanup job.
- `select({ key, owner, createdAt, updatedAt, attributes })` projections, which cut payload size for list views.
- MetaMask signing through `createWalletClient({ transport: custom(window.ethereum) })`. The SDK's `writeContract` path works with a JSON-RPC account.
- Faucet and Hub: the access key worked in the URL path for both HTTP and WebSocket. `watchEntityEvents` over `webSocket(wss…/<key>)` delivered about 1 event a second network-wide.
- Creation flag `permissionlessExtension`: a result created by an agent's wallet was extended by a different (browser test) wallet with `extendEntity`, from about 12 minutes left to about 24 hours. This is what powers "Keep alive".
- `createdBy()` with an attribute filter: each agent finds and resumes its own profile lease after a restart instead of creating a duplicate.
