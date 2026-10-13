import "./load-env-local.mjs";
import { readFile } from "node:fs/promises";
import { createPublicClient, encodeFunctionData, getAddress, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../src/chain.mjs";

const [rawAmount, rawVendor] = process.argv.slice(2);
if (!rawAmount || !/^\d+(\.\d+)?$/.test(rawAmount) || Number(rawAmount) <= 0) {
  throw new Error("Usage: npm run agent:pay -- <amount> [vendor-address]");
}

const seed = JSON.parse(await readFile(new URL("../deployments/monad-testnet-grant-seed.json", import.meta.url), "utf8"));
const grantsDeployment = JSON.parse(await readFile(new URL("../deployments/monad-testnet-grants.json", import.meta.url), "utf8"));
const privateKey = process.env.MONAD_AGENT_PRIVATE_KEY;
if (!privateKey) throw new Error("MONAD_AGENT_PRIVATE_KEY is missing from .env.local");

const account = privateKeyToAccount(privateKey);
const agent = getAddress(account.address);
if (agent !== getAddress(seed.agent)) throw new Error("MONAD_AGENT_PRIVATE_KEY does not match the seeded grant agent");
const owner = getAddress(seed.owner);
const token = getAddress(seed.token);
const grantAddress = getAddress(grantsDeployment.address);
const vendor = getAddress(rawVendor ?? process.env.AGENT_VENDOR_ADDRESS ?? agent);
const amount = parseUnits(rawAmount, 18);
const payAbi = [{
  type: "function",
  name: "pay",
  stateMutability: "nonpayable",
  inputs: [
    { name: "owner", type: "address" },
    { name: "token", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [],
}];

const rpcUrl = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });
const data = encodeFunctionData({ abi: payAbi, functionName: "pay", args: [owner, token, vendor, amount] });
const hash = await publicClient.sendTransaction({ account, to: grantAddress, data, gas: 180_000n });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
const explorerLink = `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;
const status = receipt.status === "success" ? "SUCCESS" : "REVERT";
console.log(`${status} agent pay ${rawAmount} KUSD to ${vendor}`);
console.log(`Monadscan: ${explorerLink}`);
if (receipt.status !== "success") process.exitCode = 1;
