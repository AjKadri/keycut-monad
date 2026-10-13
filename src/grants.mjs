import { decodeAbiParameters, getAddress, parseAbiItem, toEventSelector } from "viem";

export const grantCreatedTopic = toEventSelector(parseAbiItem("event GrantCreated(address indexed owner, address indexed agent, address indexed token, uint256 cap, uint256 expiry)"));
export const grantSpentTopic = toEventSelector(parseAbiItem("event GrantSpent(address indexed owner, address indexed agent, address indexed token, address to, uint256 amount, uint256 spent)"));
export const grantRevokedTopic = toEventSelector(parseAbiItem("event GrantRevoked(address indexed owner, address indexed agent, address indexed token)"));
export const grantEventTopics = [grantCreatedTopic, grantSpentTopic, grantRevokedTopic];

export const grantReadAbi = [{
  type: "function",
  name: "getGrant",
  stateMutability: "view",
  inputs: [
    { name: "owner", type: "address" },
    { name: "agent", type: "address" },
    { name: "token", type: "address" },
  ],
  outputs: [{
    name: "grant",
    type: "tuple",
    components: [
      { name: "cap", type: "uint256" },
      { name: "spent", type: "uint256" },
      { name: "expiry", type: "uint64" },
      { name: "active", type: "bool" },
    ],
  }],
}];

const grantAddressOf = (topic) => getAddress(`0x${topic.slice(-40)}`);
const topicMatches = (topic, expected) => topic?.toLowerCase() === expected.toLowerCase();

function decodeGrantState(result) {
  if (Array.isArray(result)) return { cap: result[0], spent: result[1], expiry: result[2], active: result[3] };
  return result;
}

export function parseGrantLogs(logs = [], owner, grantAddress) {
  const account = getAddress(owner);
  const target = getAddress(grantAddress).toLowerCase();
  const ownerTopic = `0x${account.slice(2).toLowerCase().padStart(64, "0")}`;
  const grants = new Map();
  const ordered = [...logs]
    .filter((log) => log.address?.toLowerCase() === target && topicMatches(log.topics?.[1], ownerTopic))
    .sort((left, right) => Number(left.blockNumber ?? 0) - Number(right.blockNumber ?? 0) || Number(left.logIndex ?? 0) - Number(right.logIndex ?? 0));

  for (const log of ordered) {
    const topics = log.topics ?? [];
    if (topics.length < 4) continue;
    const agent = grantAddressOf(topics[2]);
    const token = grantAddressOf(topics[3]);
    const key = `${agent.toLowerCase()}:${token.toLowerCase()}`;
    if (topicMatches(topics[0], grantCreatedTopic)) {
      const [cap, expiry] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], log.data ?? "0x");
      grants.set(key, { agent, token, cap: cap.toString(), spent: "0", expiry: expiry.toString(), active: true });
    } else if (topicMatches(topics[0], grantSpentTopic)) {
      const [,, spent] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint256" }], log.data ?? "0x");
      const current = grants.get(key);
      if (current) current.spent = spent.toString();
    } else if (topicMatches(topics[0], grantRevokedTopic)) {
      const current = grants.get(key);
      if (current) current.active = false;
    }
  }
  return [...grants.values()];
}

export async function readGrantStates({ client, owner, grantAddress, grants, blockNumber }) {
  if (!grants.length) return { grants: [], errors: [] };
  try {
    const reads = await client.multicall({
      contracts: grants.map(({ agent, token }) => ({ address: grantAddress, abi: grantReadAbi, functionName: "getGrant", args: [owner, agent, token] })),
      allowFailure: true,
      blockNumber: BigInt(blockNumber),
    });
    const errors = [];
    const live = grants.map((grant, index) => {
      const read = reads[index];
      if (read?.status !== "success") {
        errors.push({ stage: "grant", agent: grant.agent, token: grant.token, message: read?.error?.shortMessage ?? "Grant state read failed" });
        return grant;
      }
      const state = decodeGrantState(read.result);
      return { ...grant, cap: state.cap.toString(), spent: state.spent.toString(), expiry: state.expiry.toString(), active: Boolean(state.active) };
    });
    return { grants: live, errors };
  } catch (error) {
    return { grants, errors: [{ stage: "grant-multicall", message: error.shortMessage ?? error.message }] };
  }
}
