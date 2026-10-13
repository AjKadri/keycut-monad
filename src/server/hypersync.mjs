import { HypersyncClient, JoinMode } from "@envio-dev/hypersync-client";
import { getAddress } from "viem";
import { approvalTopic, toOwnerTopic } from "../discovery-core.mjs";

const HYPERSYNC_URLS = new Map([
  [10143, "https://monad-testnet.hypersync.xyz"],
  [143, "https://monad.hypersync.xyz"],
]);
const CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_CACHE_ENTRIES = 128;
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
  return { owner, start, chainId, nextBlock: start, logs: [], expiresAt: 0 };
}

function pruneCache(now) {
  for (const [key, value] of historyCache) if (value.expiresAt <= now) historyCache.delete(key);
  while (historyCache.size > MAX_CACHE_ENTRIES) historyCache.delete(historyCache.keys().next().value);
}

async function readApprovalHistory({ owner, fromBlock, toBlock, chainId = 10143, apiToken, client }) {
  const account = getAddress(owner);
  const start = BigInt(fromBlock);
  const exclusiveEnd = BigInt(toBlock) + 1n;
  const key = `${chainId}:${account.toLowerCase()}:${start}`;
  const now = Date.now();
  pruneCache(now);

  const pending = inFlight.get(key);
  if (pending) {
    await pending;
    return readApprovalHistory({ owner, fromBlock, toBlock, chainId, apiToken, client });
  }

  const operation = (async () => {
    let entry = historyCache.get(key);
    if (!entry || entry.expiresAt <= now) entry = makeCacheEntry(account, start, chainId);
    const isFreshHit = entry.expiresAt > now && entry.nextBlock >= exclusiveEnd;
    let requests = 0;
    let failure = null;
    let rateLimited = false;

    if (!isFreshHit && entry.nextBlock < exclusiveEnd) {
      const hypersync = client ?? newHypersyncClient(apiToken, chainId);
      let cursor = entry.nextBlock;
      while (cursor < exclusiveEnd) {
        try {
          requests += 1;
          const response = await hypersync.get({
            fromBlock: Number(cursor),
            toBlock: Number(exclusiveEnd),
            logs: [{ topics: [[approvalTopic], [toOwnerTopic(account)]] }],
            fieldSelection: { log: ["BlockNumber", "Address", "Data", "TransactionHash", "LogIndex", "Topic0", "Topic1", "Topic2", "Topic3"] },
            joinMode: JoinMode.JoinNothing,
          });
          entry.logs.push(...response.data.logs);
          const next = BigInt(response.nextBlock);
          if (next <= cursor) throw new Error(`HyperSync made no progress from block ${cursor}`);
          cursor = next < exclusiveEnd ? next : exclusiveEnd;
          entry.nextBlock = cursor;
        } catch (error) {
          rateLimited = isRateLimitError(error);
          failure = cleanError(error, apiToken);
          break;
        }
      }
    }

    const coveredThrough = entry.nextBlock > start ? (entry.nextBlock < exclusiveEnd ? entry.nextBlock - 1n : exclusiveEnd - 1n) : start - 1n;
    const coveredRanges = coveredThrough >= start ? [{ fromBlock: start.toString(), throughBlock: coveredThrough.toString() }] : [];
    const fresh = requests > 0 || isFreshHit;
    if (fresh) {
      entry.expiresAt = Date.now() + CACHE_TTL_MS;
      historyCache.set(key, entry);
      pruneCache(Date.now());
    }

    return {
      logs: entry.logs.filter((log) => log.blockNumber === undefined || BigInt(log.blockNumber) <= BigInt(toBlock)),
      coveredRanges,
      requests,
      cacheHit: isFreshHit,
      failure,
      rateLimited,
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
