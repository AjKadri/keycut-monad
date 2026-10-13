import { getAddress } from "viem";
import {
  createApprovalAccumulator,
  createDefaultPublicClient,
  finalizeDiscovery,
  scanRpcRange,
} from "../discovery-core.mjs";
import { scanApprovalHistory } from "./hypersync.mjs";

const RECENT_RPC_FALLBACK_BLOCKS = 1_000n;

export async function discover({
  owner,
  fromBlock,
  toBlock,
  rpcFromBlock,
  source = "auto",
  chunkSize = 100n,
  client = createDefaultPublicClient(),
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
    });
  }

  const history = await scanApprovalHistory({
    owner: account,
    fromBlock: requestedStart,
    toBlock: end,
    apiToken,
    client: hypersyncClient,
  });
  const accumulator = createApprovalAccumulator(account);
  accumulator.addMany(history.logs);

  if (!history.failure && history.coveredRanges[0]?.throughBlock === end.toString()) {
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

  const fallbackStart = rpcFromBlock === undefined
    ? end - RECENT_RPC_FALLBACK_BLOCKS + 1n > requestedStart ? end - RECENT_RPC_FALLBACK_BLOCKS + 1n : requestedStart
    : BigInt(rpcFromBlock);
  const reason = history.rateLimited ? "was rate-limited" : history.failure ? `failed (${history.failure})` : "did not cover the requested range";
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
  });
}

export { revoke, verify } from "../permissions.mjs";
