import "./load-env-local.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPublicClient, getAddress, http } from "viem";
import { monadTestnet, monadMainnet } from "../src/chain.mjs";
import { approvalTopic } from "../src/discovery-core.mjs";
import { discover, verify } from "../src/server/index.mjs";

const deployment = JSON.parse(await readFile(new URL("../deployments/monad-testnet.json", import.meta.url), "utf8"));
const owner = getAddress(deployment.owner);
const testnetClient = createPublicClient({
  chain: monadTestnet,
  transport: http(globalThis.process?.env?.MONAD_TESTNET_RPC_URL ?? undefined),
});
const mainnetClient = createPublicClient({
  chain: monadMainnet,
  transport: http(globalThis.process?.env?.MONAD_MAINNET_RPC_URL ?? undefined),
});
const emptyOwner = "0x0000000000000000000000000000000000000000";
const charlie = deployment.approvals.find(({ label }) => label === "Demo spender Charlie");
const bravo = deployment.approvals.find(({ label }) => label === "Demo spender Bravo");
const alpha = deployment.approvals.find(({ label }) => label === "Demo spender Alpha");
const browserRevokeHash = "0xc29a3485a27cbf9f98131e7c3d082887c4de2e54026d49c63395c9a1b460cd6b";
const charlieRevokeHash = "0x678f2d4c9e20e9d83f5912e6340da88c482d6254a39c3bc9e7f8d6810f528bde";
const emptyLimitMs = 15_000;
const checks = [];

function requireSeed(value, name) {
  if (!value) throw new Error(`seed manifest has no ${name} approval`);
  return value;
}

function pairKey(token, spender) {
  return `${token.toLowerCase()}:${spender.toLowerCase()}`;
}

function sortedMap(approvals) {
  return new Map(approvals.map(({ token, spender, allowance }) => [pairKey(token, spender), allowance]).sort(([left], [right]) => left.localeCompare(right)));
}

function receiptApproval(receipt, token) {
  const ownerTopic = `0x${owner.slice(2).toLowerCase().padStart(64, "0")}`;
  const log = receipt.logs.find((candidate) => candidate.address.toLowerCase() === token.toLowerCase()
    && candidate.topics[0]?.toLowerCase() === approvalTopic.toLowerCase()
    && candidate.topics[1]?.toLowerCase() === ownerTopic);
  if (!log || !log.topics[2]) throw new Error("receipt has no matching ERC-20 Approval event");
  return getAddress(`0x${log.topics[2].slice(-40)}`);
}

async function check(label, fn) {
  try {
    const detail = await fn();
    checks.push(true);
    console.log(`PASS ${label}${detail ? ` (${detail})` : ""}`);
  } catch (error) {
    checks.push(false);
    console.log(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const seed = await (async () => {
  const started = performance.now();
  const result = await discover({ owner, chain: monadTestnet, client: testnetClient });
  return { result, ms: Math.round(performance.now() - started) };
})();
const liveSeed = await Promise.all(deployment.approvals.map(async (approval) => ({
  ...approval,
  live: await verify(owner, approval.token, approval.spender, { publicClient: testnetClient }),
})));
const expectedActive = sortedMap(liveSeed.filter(({ live }) => BigInt(live.allowance) > 0n));
const actualActive = sortedMap(seed.result.approvals);

await check("discovers seeded approvals with full-history coverage", () => {
  assert.equal(seed.result.complete, true, seed.result.coverageReport);
  assert.equal(seed.result.source, "hypersync", seed.result.coverageReport);
  assert.match(seed.result.coverageReport, /requested range is fully covered/i);
  assert.deepEqual(actualActive, expectedActive);
  return `${actualActive.size} active, ${seed.ms} ms via HyperSync`;
});

const charlieApproval = requireSeed(charlie, "Demo spender Charlie");
await check(`KEUR -> Charlie revoke reads 0 onchain (tx ${charlieRevokeHash})`, async () => {
  const receipt = await testnetClient.getTransactionReceipt({ hash: charlieRevokeHash });
  assert.equal(receipt.status, "success");
  assert.equal(receiptApproval(receipt, charlieApproval.token), getAddress(charlieApproval.spender));
  const state = await verify(owner, charlieApproval.token, charlieApproval.spender, { publicClient: testnetClient });
  assert.deepEqual(state, { allowance: "0", isRevoked: true });
});

await check("discovery no longer lists revoked approvals", () => {
  const revokedKeys = liveSeed.filter(({ live }) => BigInt(live.allowance) === 0n).map(({ token, spender }) => pairKey(token, spender));
  for (const key of revokedKeys) assert.equal(actualActive.has(key), false, key);
  return `${revokedKeys.length} zero-allowance approvals omitted`;
});

const bravoApproval = requireSeed(bravo, "Demo spender Bravo");
await check("KUSD -> Bravo remains active for the demo", async () => {
  const state = await verify(owner, bravoApproval.token, bravoApproval.spender, { publicClient: testnetClient });
  assert.equal(state.allowance, "350000000000000000000");
  assert.equal(state.isRevoked, false);
  assert.equal(actualActive.has(pairKey(bravoApproval.token, bravoApproval.spender)), true);
  return "350 KUSD";
});

await check(`empty wallet returns 0 approvals within ${emptyLimitMs / 1000} seconds`, async () => {
  const started = performance.now();
  const result = await discover({ owner: emptyOwner, chain: monadMainnet, client: mainnetClient });
  const ms = Math.round(performance.now() - started);
  assert.equal(result.approvals.length, 0);
  assert.ok(ms <= emptyLimitMs, `${ms} ms exceeded ${emptyLimitMs} ms`);
  return `${ms} ms, ${result.coverageReport}`;
});

const browserApproval = requireSeed(alpha, "Demo spender Alpha");
await check(`KUSD -> Alpha revoke via browser wallet reads 0 onchain (tx ${browserRevokeHash})`, async () => {
  const receipt = await testnetClient.getTransactionReceipt({ hash: browserRevokeHash });
  assert.equal(receipt.status, "success");
  const receiptSpender = receiptApproval(receipt, browserApproval.token);
  assert.equal(receiptSpender, getAddress(browserApproval.spender), `receipt targets ${receiptSpender}, but Alpha is ${getAddress(browserApproval.spender)}`);
  const state = await verify(owner, browserApproval.token, browserApproval.spender, { publicClient: testnetClient });
  assert.deepEqual(state, { allowance: "0", isRevoked: true });
});

if (checks.some((passed) => !passed)) process.exitCode = 1;
