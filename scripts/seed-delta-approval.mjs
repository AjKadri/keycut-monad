import "./load-env-local.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, getAddress, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../src/chain.mjs";
import { demoSpenders } from "../src/demo-spenders.mjs";

const manifestPath = new URL("../deployments/monad-testnet.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const delta = demoSpenders.find(({ label }) => label === "Demo spender Delta");
if (!delta) throw new Error("Demo spender Delta is not configured");
if (manifest.chainId !== monadTestnet.id) throw new Error("Seed manifest is for the wrong chain");
if (manifest.approvals.some(({ label, spender }) => label === delta.label || getAddress(spender) === getAddress(delta.address))) {
  throw new Error("Delta approval is already recorded in the seed manifest");
}

const privateKey = process.env.MONAD_TESTNET_PRIVATE_KEY;
if (!privateKey) throw new Error("MONAD_TESTNET_PRIVATE_KEY is missing from .env.local");
const ownerAccount = privateKeyToAccount(privateKey);
const owner = getAddress(ownerAccount.address);
if (owner !== getAddress(manifest.owner)) throw new Error("MONAD_TESTNET_PRIVATE_KEY does not match the seed owner");

const kusd = manifest.tokens.find(({ symbol }) => symbol === "KUSD");
if (!kusd) throw new Error("Seed manifest has no KUSD token");
const token = getAddress(kusd.address);
const spender = getAddress(delta.address);
const rpcUrl = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account: ownerAccount, chain: monadTestnet, transport: http(rpcUrl) });
const approvalAbi = [{
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }],
  outputs: [{ type: "bool" }],
}];
const allowanceAbi = [{
  type: "function",
  name: "allowance",
  stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
  outputs: [{ type: "uint256" }],
}];
const amount = parseEther("200");
const transactionHash = await walletClient.writeContract({ address: token, abi: approvalAbi, functionName: "approve", args: [spender, amount] });
const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
if (receipt.status !== "success") throw new Error(`Delta approval transaction ${transactionHash} reverted`);

const allowance = await publicClient.readContract({ address: token, abi: allowanceAbi, functionName: "allowance", args: [owner, spender] });
if (allowance !== amount) throw new Error(`Expected Delta allowance ${amount}, got ${allowance}`);

manifest.approvals.push({
  token,
  tokenSymbol: "KUSD",
  spender,
  label: delta.label,
  allowance: amount.toString(),
  transactionHash,
  blockNumber: receipt.blockNumber.toString(),
});
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Delta approval: ${monadTestnet.blockExplorers.default.url}/tx/${transactionHash}`);
