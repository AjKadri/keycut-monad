import "./load-env-local.mjs";
import { chmod, writeFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, encodeFunctionData, getAddress, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../src/chain.mjs";

const rpcUrl = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const ownerAccount = privateKeyToAccount(process.env.MONAD_TESTNET_PRIVATE_KEY);
const agentAccount = privateKeyToAccount(process.env.MONAD_AGENT_PRIVATE_KEY);
const owner = getAddress(ownerAccount.address);
const agent = getAddress(agentAccount.address);
const token = getAddress(process.env.MONAD_TOKEN_A_ADDRESS);
const grants = getAddress(process.env.KEYCUT_GRANTS_ADDRESS);
const recipient = agent;
const explorer = monadTestnet.blockExplorers.default.url;
const publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });
const ownerWallet = createWalletClient({ account: ownerAccount, chain: monadTestnet, transport: http(rpcUrl) });
const agentWallet = createWalletClient({ account: agentAccount, chain: monadTestnet, transport: http(rpcUrl) });

const tokenAbi = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] }];
const grantAbi = [
  { type: "function", name: "grant", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }, { name: "token", type: "address" }, { name: "cap", type: "uint256" }, { name: "expiry", type: "uint256" }], outputs: [] },
  { type: "function", name: "pay", stateMutability: "nonpayable", inputs: [{ name: "owner", type: "address" }, { name: "token", type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
];

async function sendAndWait(hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}

const fundingHash = await ownerWallet.sendTransaction({ to: agent, value: parseEther("0.1") });
const fundingReceipt = await sendAndWait(fundingHash);
const approvalHash = await ownerWallet.writeContract({ address: token, abi: tokenAbi, functionName: "approve", args: [grants, parseEther("50")] });
const approvalReceipt = await sendAndWait(approvalHash);
const block = await publicClient.getBlock();
const expiry = Number(block.timestamp) + 24 * 60 * 60;
const grantHash = await ownerWallet.writeContract({ address: grants, abi: grantAbi, functionName: "grant", args: [agent, token, parseEther("50"), BigInt(expiry)] });
const grantReceipt = await sendAndWait(grantHash);
const payHash = await agentWallet.writeContract({ address: grants, abi: grantAbi, functionName: "pay", args: [owner, token, recipient, parseEther("10")] });
const payReceipt = await sendAndWait(payHash);

const overCapData = encodeFunctionData({ abi: grantAbi, functionName: "pay", args: [owner, token, recipient, parseEther("45")] });
const overCapHash = await agentWallet.sendTransaction({ to: grants, data: overCapData, gas: 180_000n });
const overCapReceipt = await sendAndWait(overCapHash);
if (overCapReceipt.status !== "reverted") throw new Error(`Expected over-cap transaction to revert, got ${overCapReceipt.status}`);

const manifest = {
  chainId: monadTestnet.id,
  owner,
  agent,
  token,
  grants,
  recipient,
  cap: parseEther("50").toString(),
  paid: parseEther("10").toString(),
  expiry: String(expiry),
  fundingTransactionHash: fundingHash,
  approvalTransactionHash: approvalHash,
  grantTransactionHash: grantHash,
  payTransactionHash: payHash,
  overCapTransactionHash: overCapHash,
  receipts: {
    funding: fundingReceipt.status,
    approval: approvalReceipt.status,
    grant: grantReceipt.status,
    pay: payReceipt.status,
    overCap: overCapReceipt.status,
  },
};
await writeFile("deployments/monad-testnet-grant-seed.json", `${JSON.stringify(manifest, null, 2)}\n`);
const envLines = Object.entries(process.env).filter(([key]) => key === "MONAD_AGENT_PRIVATE_KEY" || key === "MONAD_AGENT_ADDRESS");
void envLines;
await chmod(".env.local", 0o600);
for (const [label, hash] of Object.entries({ funding: fundingHash, approval: approvalHash, grant: grantHash, pay: payHash, overCap: overCapHash })) {
  console.log(`${label}: ${explorer}/tx/${hash}`);
}
console.log(`agent: ${agent}`);
console.log(`expiry: ${new Date(expiry * 1000).toISOString()}`);
