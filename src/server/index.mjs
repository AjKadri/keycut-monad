import { getAddress } from "viem";
import { monadTestnet } from "../chain.mjs";
import {
  createApprovalAccumulator,
  createDefaultPublicClient,
  finalizeDiscovery,
  mergeRanges,
  scanRpcRange,
} from "../discovery-core.mjs";
import { scanApprovalHistory } from "./hypersync.mjs";

const RECENT_RPC_FALLBACK_BLOCKS = 1_000n;

/**
 * @param {{ owner: `0x${string}`, fromBlock?: bigint | number | string, toBlock?: bigint | number | string, rpcFromBlock?: bigint | number | string, source?: "auto" | "rpc", chain?: import("viem").Chain, chunkSize?: bigint, client?: ReturnType<typeof createDefaultPublicClient>, hypersyncClient?: { get: (query: any) => Promise<any> }, apiToken?: string }} options
 */
export async function discover({
  owner,
  fromBlock,
  toBlock,
  rpcFromBlock,
  source = "auto",
  chain = monadTestnet,
  chunkSize = 100n,
  client = createDefaultPublicClient(chain),
  hypersyncClient,
  apiToken = globalThis.process?.env?.ENVIO_API_TOKEN,
}) {
  if (source !== "auto" && source !== "rpc") throw new TypeError('source must be "auto" or "rpc"');
  const account = getAddress(owner);
  const end = toBlock === undefined ? await client.getBlockNumber() : BigInt(toBlock);
  const requestedStart = fromBlock === undefined ? 0n : BigInt(fromBlock);
  if (requestedStart < 0n || end < requestedStart) throw new RangeError("Invalid block range");

  if (source === "rpc") {
    if (fromBlock === undefined) throw new TypeError('fromBlock is required when source is "rpc"');
    return scanRpcRange({
      owner: account,
      fromBlock: requestedStart,
      toBlock: end,
      chunkSize,
      client,
      accumulator: createApprovalAccumulator(account),
      requestedFromBlock: requestedStart,
      requestedToBlock: end,
      source: "rpc",
    });
  }

  if (!apiToken && !hypersyncClient) {
    const fallbackStart = rpcFromBlock === undefined
      ? end - RECENT_RPC_FALLBACK_BLOCKS + 1n > requestedStart ? end - RECENT_RPC_FALLBACK_BLOCKS + 1n : requestedStart
      : BigInt(rpcFromBlock);
    return scanRpcRange({
      owner: account,
      fromBlock: fallbackStart,
      toBlock: end,
      chunkSize,
      client,
      accumulator: createApprovalAccumulator(account),
      requestedFromBlock: requestedStart,
      requestedToBlock: end,
      source: "rpc-fallback",
      fallbackReason: "was not configured",
      concurrency: 10,
    });
  }

  const history = await scanApprovalHistory({
    owner: account,
    fromBlock: requestedStart,
    toBlock: end,
    chainId: chain.id,
    apiToken,
    client: hypersyncClient,
  });
  const accumulator = createApprovalAccumulator(account);
  accumulator.addMany(history.logs);

  const mergedHistoryRanges = mergeRanges(history.coveredRanges);
  const historyIsComplete = mergedHistoryRanges.length === 1
    && mergedHistoryRanges[0].fromBlock === requestedStart.toString()
    && mergedHistoryRanges[0].throughBlock === end.toString();
  if (!history.failure && historyIsComplete) {
    return finalizeDiscovery({
      owner: account,
      requestedFromBlock: requestedStart,
      requestedToBlock: end,
      coveredRanges: history.coveredRanges,
      accumulator,
      client,
      allowanceReadBlock: end,
      source: "hypersync",
      hypersyncRequests: history.requests,
      cacheHit: history.cacheHit,
    });
  }
  if (!history.failure && history.capped) {
    return finalizeDiscovery({
      owner: account,
      requestedFromBlock: requestedStart,
      requestedToBlock: end,
      coveredRanges: history.coveredRanges,
      accumulator,
      client,
      allowanceReadBlock: end,
      source: "hypersync",
      fallbackReason: `was capped after ${history.maxRequests} request${history.maxRequests === 1 ? "" : "s"}`,
      hypersyncRequests: history.requests,
      cacheHit: history.cacheHit,
    });
  }

  const fallbackStart = rpcFromBlock === undefined
    ? end - RECENT_RPC_FALLBACK_BLOCKS + 1n > requestedStart ? end - RECENT_RPC_FALLBACK_BLOCKS + 1n : requestedStart
    : BigInt(rpcFromBlock);
  const reason = history.rateLimited
    ? "was rate-limited"
    : history.failure
      ? `failed (${history.failure})`
      : history.capped
        ? `was capped after ${history.maxRequests} request${history.maxRequests === 1 ? "" : "s"}`
        : "did not cover the requested range";
  return scanRpcRange({
    owner: account,
    fromBlock: fallbackStart,
    toBlock: end,
    chunkSize,
    client,
    accumulator,
    coveredRanges: history.coveredRanges,
    requestedFromBlock: requestedStart,
    requestedToBlock: end,
    source: "rpc-fallback",
    fallbackReason: reason,
    hypersyncRequests: history.requests,
    cacheHit: history.cacheHit,
    concurrency: 10,
  });
}

export { revoke, verify } from "../permissions.mjs";
