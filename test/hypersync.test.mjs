import assert from "node:assert/strict";
import test from "node:test";
import { createApprovalAccumulator, approvalTopic, toOwnerTopic } from "../src/discovery-core.mjs";
import { discover } from "../src/server/index.mjs";
import { clearHyperSyncCacheForTests } from "../src/server/hypersync.mjs";
import { monadMainnet, monadTestnet } from "../src/chain.mjs";

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
