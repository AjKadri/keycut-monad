import { chmod, readFile, writeFile } from "node:fs/promises";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chainId = 10143;
const envPath = ".env.local";
const localEnv = new Map((await readFile(envPath, "utf8")).trim().split(/\r?\n/).map((line) => {
  const separator = line.indexOf("=");
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const broadcast = JSON.parse(await readFile("broadcast/DeployGrants.s.sol/10143/run-latest.json", "utf8"));
if (Number(broadcast.chain) !== chainId) throw new Error("Grant deployment broadcast is for the wrong chain");
const privateKey = localEnv.get("MONAD_TESTNET_PRIVATE_KEY");
if (!privateKey) throw new Error("MONAD_TESTNET_PRIVATE_KEY is missing from .env.local");
const owner = privateKeyToAccount(privateKey).address;
const transaction = (broadcast.transactions ?? []).find((entry) => entry.transactionType === "CREATE" && entry.contractName === "KeycutGrants");
const receipt = transaction && (broadcast.receipts ?? []).find((entry) => entry.transactionHash.toLowerCase() === transaction.hash.toLowerCase());
if (!transaction || !receipt || receipt.status !== "0x1" || !receipt.contractAddress) throw new Error("Grant deployment has no successful receipt");
if (!transaction.transaction?.from || getAddress(transaction.transaction.from) !== getAddress(owner) || getAddress(receipt.from) !== getAddress(owner)) throw new Error("Grant deployment was not sent by the configured testnet key");

const manifest = {
  chainId,
  owner: getAddress(owner),
  address: getAddress(receipt.contractAddress),
  transactionHash: transaction.hash,
  blockNumber: BigInt(receipt.blockNumber).toString(),
};
await writeFile("deployments/monad-testnet-grants.json", `${JSON.stringify(manifest, null, 2)}\n`);
localEnv.set("KEYCUT_GRANTS_ADDRESS", manifest.address);
await writeFile(envPath, [...localEnv].map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
await chmod(envPath, 0o600);
console.log(JSON.stringify(manifest, null, 2));
