import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters } from "viem";
import { createApprovalAccumulator, approvalTopic, toOwnerTopic } from "../src/discovery-core.mjs";
import { discover as browserDiscover } from "../src/discover.mjs";
import { discover } from "../src/server/index.mjs";
import { clearHyperSyncCacheForTests } from "../src/server/hypersync.mjs";
import { monadMainnet, monadTestnet } from "../src/chain.mjs";
import { grantCreatedTopic } from "../src/grants.mjs";

const owner = "0x0000000000000000000000000000000000000001";

test("approval parser ignores the empty fourth HyperSync topic slot", () => {
  const accumulator = createApprovalAccumulator(owner);
  accumulator.add({
    address: "0x0000000000000000000000000000000000000002",
    blockNumber: 10,
    topics: [
      approvalTopic,
      toOwnerTopic(owner),
      `0x${"0".repeat(63)}3`,
      null,
    ],
    data: `0x${"0".repeat(64)}`,
  });

  assert.equal(accumulator.logCount, 1);
  assert.equal(accumulator.ignoredApprovalLogCount, 0);
  assert.equal(accumulator.pairs.length, 1);
});

test("browser-safe RPC discovery returns grant state when configured", async () => {
  const grantAddress = "0x0000000000000000000000000000000000000009";
  const agent = "0x0000000000000000000000000000000000000003";
  const token = "0x0000000000000000000000000000000000000004";
  const grantLog = {
    address: grantAddress,
    blockNumber: 10,
    logIndex: 0,
    transactionHash: `0x${"33".repeat(32)}`,
    topics: [grantCreatedTopic, toOwnerTopic(owner), `0x${agent.slice(2).padStart(64, "0")}`, `0x${token.slice(2).padStart(64, "0")}`],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [50n, 3_000n]),
  };
  const client = {
    request: async () => [grantLog],
    multicall: async ({ contracts }) => contracts.map(({ functionName }) => functionName === "getGrant"
      ? { status: "success", result: { cap: 50n, spent: 10n, expiry: 3_000n, active: true } }
      : { status: "success", result: 0n }),
  };
  const result = await browserDiscover({ owner, fromBlock: 0n, toBlock: 10n, client, grantAddress });
  assert.equal(result.grants.length, 1);
  assert.equal(result.grants[0].active, true);
  assert.equal(result.grants[0].spent, "10");
});

function publicClient(head, onRequest = () => {}) {
  return {
    getBlockNumber: async () => BigInt(head),
    request: async (request) => {
      onRequest(request);
      return [];
    },
    multicall: async ({ contracts }) => contracts.map(() => ({ status: "success", result: 0n })),
  };
}

test("HyperSync reuses a wallet's recent complete log scan", async () => {
  clearHyperSyncCacheForTests();
  let requests = 0;
  const hypersyncClient = {
    get: async (query) => {
      requests += 1;
      assert.equal(query.fromBlock, 0);
      assert.equal(query.toBlock, 101);
      assert.deepEqual(query.fieldSelection.log, ["BlockNumber", "Address", "Data", "TransactionHash", "LogIndex", "Topic0", "Topic1", "Topic2", "Topic3"]);
      return { nextBlock: query.toBlock, data: { logs: [] } };
    },
  };

  const first = await discover({ owner, toBlock: 100n, hypersyncClient, client: publicClient(100) });
  const second = await discover({ owner, toBlock: 100n, hypersyncClient, client: publicClient(100) });

  assert.equal(first.complete, true);
  assert.equal(first.hypersyncRequests, 1);
  assert.equal(first.cacheHit, false);
  assert.equal(second.complete, true);
  assert.equal(second.hypersyncRequests, 0);
  assert.equal(second.cacheHit, true);
  assert.equal(requests, 1);
});

test("HyperSync cache entries are isolated by Monad chain", async () => {
  clearHyperSyncCacheForTests();
  const calls = [];
  const hypersyncClient = {
    get: async (query) => {
      calls.push(query.fromBlock);
      return { nextBlock: query.toBlock, data: { logs: [] } };
    },
  };

  const first = await discover({ owner, chain: monadTestnet, toBlock: 4n, hypersyncClient, client: publicClient(4) });
  const second = await discover({ owner, chain: monadMainnet, toBlock: 4n, hypersyncClient, client: publicClient(4) });

  assert.equal(first.hypersyncRequests, 1);
  assert.equal(second.hypersyncRequests, 1);
  assert.deepEqual(calls, [0, 0]);
  clearHyperSyncCacheForTests();
});

test("HyperSync caps a long history scan and caches the partial result", async () => {
  clearHyperSyncCacheForTests();
  let requests = 0;
  const hypersyncClient = {
    get: async (query) => {
      requests += 1;
      return { nextBlock: 50, data: { logs: [] } };
    },
  };
  const first = await discover({ owner, toBlock: 2_500n, hypersyncClient, client: publicClient(2_500) });
  const second = await discover({ owner, toBlock: 2_500n, hypersyncClient, client: publicClient(2_500) });

  assert.equal(requests, 1);
  assert.equal(first.complete, false);
  assert.match(first.coverageReport, /capped after 1 request/i);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.hypersyncRequests, 0);
  clearHyperSyncCacheForTests();
});

test("HyperSync timeouts return honest partial coverage", async () => {
  clearHyperSyncCacheForTests();
  const result = await discover({
    owner,
    toBlock: 2_500n,
    requestTimeoutMs: 10,
    hypersyncClient: { get: () => new Promise(() => {}) },
    client: publicClient(2_500),
  });

  assert.equal(result.source, "hypersync");
  assert.equal(result.complete, false);
  assert.match(result.coverageReport, /capped after 1 request/i);
  assert.equal(result.approvals.length, 0);
  clearHyperSyncCacheForTests();
});

test("HyperSync rate limits fall back to a bounded RPC scan with an honest coverage report", async () => {
  clearHyperSyncCacheForTests();
  const rpcRanges = [];
  const hypersyncClient = {
    get: async () => {
      throw Object.assign(new Error("429 rate limit for unit-secret"), { status: 429 });
    },
  };

  const result = await discover({
    owner,
    apiToken: "unit-secret",
    toBlock: 2_500n,
    hypersyncClient,
    client: publicClient(2_500, (request) => rpcRanges.push(request.params[0])),
  });

  assert.equal(result.source, "rpc-fallback");
  assert.equal(result.complete, false);
  assert.equal(result.hypersyncRequests, 1);
  assert.equal(rpcRanges.length, 10);
  assert.equal(rpcRanges[0].fromBlock, "0x5dd");
  assert.equal(rpcRanges.at(-1).toBlock, "0x9c4");
  assert.match(result.coverageReport, /rate-limited/i);
  assert.match(result.coverageReport, /older history was not checked/i);
  assert.doesNotMatch(JSON.stringify(result), /unit-secret/);

  clearHyperSyncCacheForTests();
  const completeFallback = await discover({
    owner,
    apiToken: "unit-secret",
    toBlock: 50n,
    rpcFromBlock: 0n,
    hypersyncClient,
    client: publicClient(50),
  });
  assert.equal(completeFallback.complete, true);
  assert.match(completeFallback.coverageReport, /HyperSync was rate-limited/i);
  assert.match(completeFallback.coverageReport, /requested range is fully covered/i);
});

test("RPC fallback preserves grant events found by HyperSync", async () => {
  clearHyperSyncCacheForTests();
  const grantAddress = "0x0000000000000000000000000000000000000009";
  const agent = "0x0000000000000000000000000000000000000003";
  const token = "0x0000000000000000000000000000000000000004";
  const grantLog = {
    address: grantAddress,
    blockNumber: 2_000,
    logIndex: 0,
    transactionHash: `0x${"22".repeat(32)}`,
    topics: [grantCreatedTopic, toOwnerTopic(owner), `0x${agent.slice(2).padStart(64, "0")}`, `0x${token.slice(2).padStart(64, "0")}`],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [50n, 3_000n]),
  };
  const client = {
    getBlockNumber: async () => 2_500n,
    request: async () => [grantLog],
    multicall: async ({ contracts }) => contracts.map(({ functionName }) => functionName === "getGrant"
      ? { status: "success", result: { cap: 50n, spent: 10n, expiry: 3_000n, active: true } }
      : { status: "success", result: 0n }),
  };
  const result = await discover({
    owner,
    apiToken: "unit-secret",
    toBlock: 2_500n,
    hypersyncClient: { get: async () => { throw Object.assign(new Error("429"), { status: 429 }); } },
    client,
    grantAddress,
  });

  assert.equal(result.source, "rpc-fallback");
  assert.equal(result.grants.length, 1);
  assert.equal(result.grants[0].agent, agent);
  assert.equal(result.grants[0].spent, "10");
  clearHyperSyncCacheForTests();
});
