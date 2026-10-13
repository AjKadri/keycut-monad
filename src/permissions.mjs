import { createPublicClient, getAddress, http } from "viem";
import { monadTestnet } from "./chain.mjs";

const approveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

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

const grantRevokeAbi = [{
  type: "function",
  name: "revoke",
  stateMutability: "nonpayable",
  inputs: [{ name: "agent", type: "address" }, { name: "token", type: "address" }],
  outputs: [],
}];

const defaultPublicClient = () =>
  createPublicClient({
    chain: monadTestnet,
    transport: http(globalThis.process?.env?.MONAD_TESTNET_RPC_URL ?? undefined),
  });

export async function revoke(token, spender, { walletClient, account } = {}) {
  if (!walletClient || typeof walletClient.writeContract !== "function") {
    throw new TypeError("A walletClient is required to revoke an allowance");
  }
  const sender = account ?? walletClient.account;
  if (!sender) throw new TypeError("The walletClient or options must provide an account");

  return walletClient.writeContract({
    address: getAddress(token),
    abi: approveAbi,
    functionName: "approve",
    args: [getAddress(spender), 0n],
    account: typeof sender === "string" ? getAddress(sender) : sender,
  });
}

export async function revokeGrant(agent, token, { grantAddress, walletClient, account } = {}) {
  if (!grantAddress) throw new TypeError("A grantAddress is required to revoke a grant");
  if (!walletClient || typeof walletClient.writeContract !== "function") throw new TypeError("A walletClient is required to revoke a grant");
  const sender = account ?? walletClient.account;
  if (!sender) throw new TypeError("The walletClient or options must provide an account");
  return walletClient.writeContract({
    address: getAddress(grantAddress),
    abi: grantRevokeAbi,
    functionName: "revoke",
    args: [getAddress(agent), getAddress(token)],
    account: typeof sender === "string" ? getAddress(sender) : sender,
  });
}

/**
 * @param {string} owner
 * @param {string} token
 * @param {string} spender
 * @param {{ publicClient?: import("viem").PublicClient }} [options]
 */
export async function verify(owner, token, spender, { publicClient = defaultPublicClient() } = {}) {
  const allowance = await publicClient.readContract({
    address: getAddress(token),
    abi: allowanceAbi,
    functionName: "allowance",
    args: [getAddress(owner), getAddress(spender)],
  });
  return { allowance: allowance.toString(), isRevoked: allowance === 0n };
}
