import { createPublicClient, getAddress, http, parseAbiItem, toEventSelector, toHex } from "viem";
import { monadTestnet } from "./chain.mjs";

const approvalEvent = parseAbiItem(
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
);
const approvalTopic = toEventSelector(approvalEvent);

const allowanceAbi = [
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

export async function discover({
  owner,
  fromBlock,
  toBlock,
  chunkSize = 100n,
  client = createPublicClient({
    chain: monadTestnet,
    transport: http(globalThis.process?.env?.MONAD_TESTNET_RPC_URL ?? undefined),
  }),
}) {
  if (fromBlock === undefined) throw new TypeError("fromBlock is required to report scan coverage");

  const account = getAddress(owner);
  const ownerTopic = `0x${account.slice(2).toLowerCase().padStart(64, "0")}`;
  const start = BigInt(fromBlock);
  const end = toBlock === undefined ? await client.getBlockNumber() : BigInt(toBlock);
  const size = BigInt(chunkSize);
  if (start < 0n || end < start) throw new RangeError("Invalid block range");
  if (size < 1n) throw new RangeError("chunkSize must be positive");

  const pairs = new Map();
  const errors = [];
  let coveredThroughBlock = start - 1n;
  let logCount = 0;
  let ignoredApprovalLogCount = 0;

  for (let from = start; from <= end; from += size) {
    const to = from + size - 1n > end ? end : from + size - 1n;
    let logs;
    try {
      logs = await client.request({
        method: "eth_getLogs",
        params: [
          {
            topics: [approvalTopic, ownerTopic],
            fromBlock: toHex(from),
            toBlock: toHex(to),
          },
        ],
      });
    } catch (error) {
      errors.push({
        stage: "logs",
        fromBlock: from.toString(),
        toBlock: to.toString(),
        message: error.shortMessage ?? error.message,
      });
      break;
    }

    for (const log of logs) {
      // ERC-721 uses the same Approval signature but indexes tokenId as a
      // third topic. ERC-20 has exactly owner + spender topics and a 32-byte
      // allowance value in data.
      if (log.topics.length !== 3 || log.data.length !== 66) {
        ignoredApprovalLogCount += 1;
        continue;
      }
      const spenderTopic = log.topics[2];
      if (!spenderTopic) continue;
      const spender = getAddress(`0x${spenderTopic.slice(-40)}`);
      const token = getAddress(log.address);
      const key = `${token.toLowerCase()}:${spender.toLowerCase()}`;
      pairs.set(key, { token, spender: getAddress(spender) });
      logCount += 1;
    }
    coveredThroughBlock = to;
  }

  const approvals = [];
  for (const pair of pairs.values()) {
    try {
      const allowance = await client.readContract({
        address: pair.token,
        abi: allowanceAbi,
        functionName: "allowance",
        args: [account, pair.spender],
      });
      if (allowance > 0n) approvals.push({ ...pair, allowance: allowance.toString() });
    } catch (error) {
      errors.push({
        stage: "allowance",
        token: pair.token,
        spender: pair.spender,
        message: error.shortMessage ?? error.message,
      });
    }
  }

  return {
    chainId: monadTestnet.id,
    owner: account,
    requestedRange: { fromBlock: start.toString(), toBlock: end.toString() },
    coveredRange:
      coveredThroughBlock < start
        ? null
        : { fromBlock: start.toString(), throughBlock: coveredThroughBlock.toString() },
    complete: coveredThroughBlock === end && errors.length === 0,
    logCount,
    ignoredApprovalLogCount,
    approvals,
    errors,
  };
}
