import { readFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../src/chain.mjs";
import { discover } from "../src/discover.mjs";
import { revoke, verify } from "../src/permissions.mjs";

const env = new Map(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
const manifest = JSON.parse(await readFile("deployments/monad-testnet.json", "utf8"));
const token = manifest.tokens.find(({ symbol }) => symbol === "KEUR");
const spender = manifest.approvals.find(({ label }) => label === "Demo spender Charlie");
if (!token || !spender) throw new Error("KEUR and Demo spender Charlie must exist in the seed manifest");

const privateKey = env.get("MONAD_TESTNET_PRIVATE_KEY");
if (!privateKey) throw new Error("MONAD_TESTNET_PRIVATE_KEY is missing from .env.local");
const account = privateKeyToAccount(privateKey);
if (getAddress(account.address) !== getAddress(manifest.owner)) {
  throw new Error("The local key does not belong to the seeded approval owner");
}

const transport = http(env.get("MONAD_TESTNET_RPC_URL") ?? undefined);
const publicClient = createPublicClient({ chain: monadTestnet, transport });
const walletClient = createWalletClient({ account, chain: monadTestnet, transport });
if (await publicClient.getChainId() !== monadTestnet.id) throw new Error("RPC is not Monad Testnet");

const before = await verify(manifest.owner, token.address, spender.spender, { publicClient });
if (before.isRevoked) throw new Error("KEUR → Charlie is already revoked; no transaction was sent");

const hash = await revoke(token.address, spender.spender, { walletClient });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`Revoke transaction failed: ${hash}`);

const after = await verify(manifest.owner, token.address, spender.spender, { publicClient });
if (!after.isRevoked || after.allowance !== "0") throw new Error("Live allowance verification did not return zero");

const result = await discover({ owner: manifest.owner, fromBlock: BigInt(manifest.scanFromBlock), client: publicClient });
const expectedRemaining = manifest.approvals
  .filter((approval) => !(approval.token.toLowerCase() === token.address.toLowerCase() && approval.spender.toLowerCase() === spender.spender.toLowerCase()))
  .map(({ token: approvalToken, spender: approvalSpender }) => `${approvalToken.toLowerCase()}:${approvalSpender.toLowerCase()}`)
  .sort();
const actualRemaining = result.approvals
  .map(({ token: approvalToken, spender: approvalSpender }) => `${approvalToken.toLowerCase()}:${approvalSpender.toLowerCase()}`)
  .sort();
if (!result.complete || expectedRemaining.join("\n") !== actualRemaining.join("\n")) {
  throw new Error("Post-revoke discovery did not match the two remaining seeded approvals");
}

console.log(JSON.stringify({
  chainId: result.chainId,
  revokeTransaction: hash,
  explorerLink: `${monadTestnet.blockExplorers.default.url}/tx/${hash}`,
  verification: after,
  coveredRange: result.coveredRange,
  approvals: result.approvals,
}, null, 2));
