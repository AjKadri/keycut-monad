import { createPublicClient, getAddress, http, parseAbiItem, toEventSelector, toHex } from "viem";
import { monadMainnet, monadTestnet } from "./chain.mjs";

export const approvalTopic = toEventSelector(
  parseAbiItem("event Approval(address indexed owner, address indexed spender, uint256 value)"),
);

export const allowanceAbi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
];

export const chainForId = (chainId) => {
  if (chainId === monadTestnet.id) return monadTestnet;
  if (chainId === monadMainnet.id) return monadMainnet;
  throw new RangeError(`Unsupported Monad chain id: ${chainId}`);
};

/** @param {import("viem").Chain} [chain] */
export const createDefaultPublicClient = (chain = monadTestnet) =>
  createPublicClient({
    chain,
    transport: http(globalThis.process?.env?.[chain.id === monadMainnet.id ? "MONAD_MAINNET_RPC_URL" : "MONAD_TESTNET_RPC_URL"] ?? undefined),
  });

export const toOwnerTopic = (owner) => `0x${getAddress(owner).slice(2).toLowerCase().padStart(64, "0")}`;

export function createApprovalAccumulator(owner) {
  const account = getAddress(owner);
  const ownerTopic = toOwnerTopic(account).toLowerCase();
  const pairs = new Map();
  const seenLogs = new Set();
  let logCount = 0;
  let ignoredApprovalLogCount = 0;

  return {
    add(log) {
      const topics = log.topics ?? [];
      const populatedTopics = topics.filter((topic) => topic !== undefined && topic !== null);
      if (populatedTopics[0]?.toLowerCase() !== approvalTopic.toLowerCase() || populatedTopics[1]?.toLowerCase() !== ownerTopic) return;
      if (populatedTopics.length !== 3 || !/^0x[\da-f]{64}$/i.test(log.data ?? "")) {
        ignoredApprovalLogCount += 1;
        return;
      }

      const identity = log.transactionHash && log.logIndex !== undefined
        ? `${log.transactionHash.toLowerCase()}:${log.logIndex}`
        : `${log.blockNumber ?? "?"}:${log.address?.toLowerCase()}:${populatedTopics[2]?.toLowerCase()}:${log.data.toLowerCase()}`;
      if (seenLogs.has(identity)) return;
      seenLogs.add(identity);

      const spender = getAddress(`0x${populatedTopics[2].slice(-40)}`);
      const token = getAddress(log.address);
      const key = `${token.toLowerCase()}:${spender.toLowerCase()}`;
      pairs.set(key, { token, spender });
      logCount += 1;
    },
    addMany(logs = []) {
      for (const log of logs) this.add(log);
    },
    get pairs() { return [...pairs.values()]; },
    get logCount() { return logCount; },
    get ignoredApprovalLogCount() { return ignoredApprovalLogCount; },
  };
}

export function mergeRanges(ranges) {
  const sorted = ranges
    .map(({ fromBlock, throughBlock }) => ({ fromBlock: BigInt(fromBlock), throughBlock: BigInt(throughBlock) }))
    .filter(({ fromBlock, throughBlock }) => throughBlock >= fromBlock)
    .sort((left, right) => left.fromBlock < right.fromBlock ? -1 : left.fromBlock > right.fromBlock ? 1 : 0);
  const merged = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.fromBlock <= previous.throughBlock + 1n) {
      if (range.throughBlock > previous.throughBlock) previous.throughBlock = range.throughBlock;
    } else {
      merged.push({ ...range });
    }
  }
  return merged.map(({ fromBlock, throughBlock }) => ({ fromBlock: fromBlock.toString(), throughBlock: throughBlock.toString() }));
}

function coverageText({ source, fallbackReason, requestedFromBlock, requestedToBlock, coveredRanges, rangeComplete }) {
  const label = source === "hypersync" ? "HyperSync" : source === "rpc-fallback" ? "RPC fallback" : "RPC";
  const prefix = fallbackReason ? `HyperSync ${fallbackReason}; ` : "";
  if (rangeComplete) return `${prefix}${label} scanned ${requestedFromBlock}–${requestedToBlock}; the requested range is fully covered.`;

  const ranges = coveredRanges.map(({ fromBlock, throughBlock }) => `${fromBlock}–${throughBlock}`);
  if (!ranges.length) return `${prefix}no blocks were covered; older history was not checked.`;

  let report = `${prefix}${label} scanned ${ranges.join(", ")}.`;
  const first = BigInt(coveredRanges[0].fromBlock);
  const last = BigInt(coveredRanges.at(-1).throughBlock);
  const requestedStart = BigInt(requestedFromBlock);
  const requestedEnd = BigInt(requestedToBlock);
  if (first > requestedStart) report += ` Blocks ${requestedStart}–${first - 1n} were not checked; older history was not checked.`;
  else if (last < requestedEnd) report += ` Blocks ${last + 1n}–${requestedEnd} were not checked.`;
  if (coveredRanges.length > 1) {
    const gaps = [];
    for (let index = 1; index < coveredRanges.length; index += 1) {
      const gapFrom = BigInt(coveredRanges[index - 1].throughBlock) + 1n;
      const gapTo = BigInt(coveredRanges[index].fromBlock) - 1n;
      if (gapTo >= gapFrom) gaps.push(`${gapFrom}–${gapTo}`);
    }
    if (gaps.length) report += ` Unchecked gaps: ${gaps.join(", ")}.`;
  }
  return report;
}

export async function finalizeDiscovery({
  owner,
  requestedFromBlock,
  requestedToBlock,
  coveredRanges,
  accumulator,
  client,
  allowanceReadBlock = requestedToBlock,
  source,
  fallbackReason,
  errors = [],
  hypersyncRequests = 0,
  cacheHit = false,
}) {
  const account = getAddress(owner);
  const mergedRanges = mergeRanges(coveredRanges);
  const rangeStartsAtRequest = mergedRanges[0]?.fromBlock === BigInt(requestedFromBlock).toString();
  const firstRange = rangeStartsAtRequest ? mergedRanges[0] : null;
  const coveredRange = firstRange
    ? { fromBlock: firstRange.fromBlock, throughBlock: firstRange.throughBlock }
    : null;
  const rangeComplete = coveredRange?.throughBlock === BigInt(requestedToBlock).toString();
  const normalizedErrors = [...errors];
  const pairs = accumulator.pairs;
  let reads = [];

  if (pairs.length) {
    try {
      reads = await client.multicall({
        contracts: pairs.map(({ token, spender }) => ({
          address: token,
          abi: allowanceAbi,
          functionName: "allowance",
          args: [account, spender],
        })),
        allowFailure: true,
        blockNumber: BigInt(allowanceReadBlock),
      });
    } catch (error) {
      normalizedErrors.push({ stage: "allowance-multicall", message: error.shortMessage ?? error.message });
    }
  }

  const approvals = [];
  if (pairs.length && reads.length) {
    pairs.forEach((pair, index) => {
      const read = reads[index];
      if (read?.status === "success") {
        if (read.result > 0n) approvals.push({ ...pair, allowance: read.result.toString() });
      } else {
        normalizedErrors.push({
          stage: "allowance",
          token: pair.token,
          spender: pair.spender,
          message: read?.error?.shortMessage ?? read?.error?.message ?? "Allowance multicall failed",
        });
      }
    });
  }

  const complete = rangeComplete && normalizedErrors.length === 0;
  return {
    chainId: client.chain?.id ?? monadTestnet.id,
    owner: account,
    source,
    requestedRange: { fromBlock: BigInt(requestedFromBlock).toString(), toBlock: BigInt(requestedToBlock).toString() },
    coveredRange,
    coveredRanges: mergedRanges,
    coverageReport: coverageText({
      source,
      fallbackReason,
      requestedFromBlock,
      requestedToBlock,
      coveredRanges: mergedRanges,
      rangeComplete,
    }),
    complete,
    allowanceReadBlock: BigInt(allowanceReadBlock).toString(),
    logCount: accumulator.logCount,
    ignoredApprovalLogCount: accumulator.ignoredApprovalLogCount,
    approvals,
    errors: normalizedErrors,
    hypersyncRequests,
    cacheHit,
  };
}

export async function scanRpcRange({
  owner,
  fromBlock,
  toBlock,
  chunkSize = 100n,
  client = createDefaultPublicClient(),
  accumulator = createApprovalAccumulator(owner),
  coveredRanges = [],
  errors = [],
  requestedFromBlock = fromBlock,
  requestedToBlock = toBlock,
  source = "rpc",
  fallbackReason,
  hypersyncRequests = 0,
  cacheHit = false,
}) {
  if (fromBlock === undefined) throw new TypeError("fromBlock is required when using the RPC log source");
  const account = getAddress(owner);
  const start = BigInt(fromBlock);
  const end = BigInt(toBlock);
  const size = BigInt(chunkSize);
  if (start < 0n || end < start) throw new RangeError("Invalid block range");
  if (size < 1n) throw new RangeError("chunkSize must be positive");

  const ownerTopic = toOwnerTopic(account);
  for (let from = start; from <= end; from += size) {
    const through = from + size - 1n > end ? end : from + size - 1n;
    try {
      const logs = await client.request({
        method: "eth_getLogs",
        params: [{ topics: [approvalTopic, ownerTopic], fromBlock: toHex(from), toBlock: toHex(through) }],
      });
      accumulator.addMany(logs);
      coveredRanges.push({ fromBlock: from, throughBlock: through });
    } catch (error) {
      errors.push({
        stage: "logs",
        fromBlock: from.toString(),
        toBlock: through.toString(),
        message: error.shortMessage ?? error.message,
      });
      break;
    }
  }

  return finalizeDiscovery({
    owner: account,
    requestedFromBlock,
    requestedToBlock,
    coveredRanges,
    accumulator,
    client,
    allowanceReadBlock: toBlock,
    source,
    fallbackReason,
    errors,
    hypersyncRequests,
    cacheHit,
  });
}
