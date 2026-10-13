import { HypersyncClient, JoinMode } from "@envio-dev/hypersync-client";
import { getAddress } from "viem";
import { approvalTopic, toOwnerTopic } from "../discovery-core.mjs";

const HYPERSYNC_URLS = new Map([
  [10143, "https://monad-testnet.hypersync.xyz"],
  [143, "https://monad.hypersync.xyz"],
]);
const CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_CACHE_ENTRIES = 128;
const DEFAULT_MAX_REQUESTS = 2;
const DEFAULT_REQUEST_TIMEOUT_MS = 11_000;
const PARALLEL_RANGE_THRESHOLD = 1_000_000n;
const historyCache = new Map();
const inFlight = new Map();

const cleanError = (error, apiToken) => {
  const raw = String(error?.shortMessage ?? error?.message ?? error).replaceAll(apiToken ?? "\u0000", "[redacted]");
  return raw.replace(/(bearer\s+)[^\s,;]+/ig, "$1[redacted]").slice(0, 400);
};

export function isRateLimitError(error) {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  return status === 429 || /\b429\b|rate.?limit|too many requests|quota exceeded/i.test(String(error?.message ?? error));
}

function newHypersyncClient(apiToken, chainId) {
  const url = HYPERSYNC_URLS.get(chainId);
  if (!url) throw new RangeError(`Unsupported HyperSync chain id: ${chainId}`);
  return new HypersyncClient({ url, apiToken, maxNumRetries: 0 });
}

function makeCacheEntry(owner, start, chainId) {
  return { owner, start, chainId, logs: [], coveredRanges: [], expiresAt: 0, failure: null, rateLimited: false, capped: false, maxRequests: 1 };
}

function pruneCache(now) {
  for (const [key, value] of historyCache) if (value.expiresAt <= now) historyCache.delete(key);
  while (historyCache.size > MAX_CACHE_ENTRIES) historyCache.delete(historyCache.keys().next().value);
}

async function readApprovalHistory({ owner, fromBlock, toBlock, chainId = 10143, apiToken, client, maxRequests = DEFAULT_MAX_REQUESTS, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS }) {
  const account = getAddress(owner);
  const start = BigInt(fromBlock);
  const exclusiveEnd = BigInt(toBlock) + 1n;
  const key = `${chainId}:${account.toLowerCase()}:${start}`;
  const now = Date.now();
  pruneCache(now);
  if (!Number.isInteger(maxRequests) || maxRequests < 1) throw new RangeError("maxRequests must be a positive integer");

  const pending = inFlight.get(key);
  if (pending) {
    await pending;
    return readApprovalHistory({ owner, fromBlock, toBlock, chainId, apiToken, client, maxRequests, requestTimeoutMs });
  }

  const operation = (async () => {
    let entry = historyCache.get(key);
    if (!entry || entry.expiresAt <= now) entry = makeCacheEntry(account, start, chainId);
    const isFreshHit = entry.expiresAt > now;
    let requests = 0;
    let failure = entry.failure;
    let rateLimited = entry.rateLimited;
    let capped = entry.capped;
    let requestLimit = entry.maxRequests;

    if (!isFreshHit) {
      const hypersync = client ?? newHypersyncClient(apiToken, chainId);
      const span = exclusiveEnd - start;
      requestLimit = span > PARALLEL_RANGE_THRESHOLD ? Math.min(maxRequests, Number(span)) : 1;
      const step = (span + BigInt(requestLimit) - 1n) / BigInt(requestLimit);
      const ranges = [];
      for (let from = start; from < exclusiveEnd; from += step) {
        ranges.push({ fromBlock: from, throughExclusive: from + step < exclusiveEnd ? from + step : exclusiveEnd });
      }
      requests = ranges.length;
      const responses = await Promise.all(ranges.map(async ({ fromBlock, throughExclusive }) => {
        try {
          const query = {
            fromBlock: Number(fromBlock),
            toBlock: Number(throughExclusive),
            logs: [{ topics: [[approvalTopic], [toOwnerTopic(account)]] }],
            fieldSelection: { log: ["BlockNumber", "Address", "Data", "TransactionHash", "LogIndex", "Topic0", "Topic1", "Topic2", "Topic3"] },
            joinMode: JoinMode.JoinNothing,
          };
          let timeout;
          const response = await Promise.race([
            hypersync.get(query),
            new Promise((_, reject) => {
              timeout = setTimeout(() => reject(Object.assign(new Error(`HyperSync request exceeded ${requestTimeoutMs} ms`), { code: "HYPERSYNC_TIMEOUT" })), requestTimeoutMs);
              timeout.unref?.();
            }),
          ]).finally(() => clearTimeout(timeout));
          const next = BigInt(response.nextBlock);
          if (next <= fromBlock) throw new Error(`HyperSync made no progress from block ${fromBlock}`);
          return { fromBlock, throughExclusive, next: next < throughExclusive ? next : throughExclusive, logs: response.data.logs, capped: next < throughExclusive };
        } catch (error) {
          return { fromBlock, throughExclusive, error: error?.code === "HYPERSYNC_TIMEOUT" ? null : error, rateLimited: isRateLimitError(error), capped: error?.code === "HYPERSYNC_TIMEOUT" };
        }
      }));
      entry.logs = responses.flatMap((response) => response.logs ?? []);
      entry.coveredRanges = responses
        .filter((response) => response.next > response.fromBlock)
        .map((response) => ({ fromBlock: response.fromBlock.toString(), throughBlock: (response.next - 1n).toString() }));
      const failed = responses.find((response) => response.error);
      failure = failed ? cleanError(failed.error, apiToken) : null;
      rateLimited = responses.some((response) => response.rateLimited);
      capped = responses.some((response) => response.capped);
      entry.failure = failure;
      entry.rateLimited = rateLimited;
      entry.capped = capped;
      entry.maxRequests = requestLimit;
    }
    const fresh = requests > 0 || isFreshHit;
    if (fresh) {
      entry.expiresAt = Date.now() + CACHE_TTL_MS;
      historyCache.set(key, entry);
      pruneCache(Date.now());
    }

    return {
      logs: entry.logs.filter((log) => log.blockNumber === undefined || BigInt(log.blockNumber) <= BigInt(toBlock)),
      coveredRanges: entry.coveredRanges
        .map(({ fromBlock, throughBlock }) => ({ fromBlock: BigInt(fromBlock), throughBlock: BigInt(throughBlock) }))
        .map(({ fromBlock, throughBlock }) => ({
          fromBlock: fromBlock < start ? start.toString() : fromBlock.toString(),
          throughBlock: throughBlock >= exclusiveEnd ? (exclusiveEnd - 1n).toString() : throughBlock.toString(),
        }))
        .filter(({ throughBlock, fromBlock }) => BigInt(throughBlock) >= BigInt(fromBlock)),
      requests,
      cacheHit: isFreshHit,
      failure,
      rateLimited,
      capped,
      maxRequests: requestLimit,
    };
  })();

  inFlight.set(key, operation);
  try {
    return await operation;
  } finally {
    inFlight.delete(key);
  }
}

export async function scanApprovalHistory(options) {
  if (!options.apiToken && !options.client) throw new Error("ENVIO_API_TOKEN is required for HyperSync discovery");
  return readApprovalHistory(options);
}

export const clearHyperSyncCacheForTests = () => {
  historyCache.clear();
  inFlight.clear();
};
