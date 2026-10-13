import { readFile, writeFile, chmod } from "node:fs/promises";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chainId = 10143;
const localEnv = new Map(
  (await readFile(".env.local", "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
const broadcast = JSON.parse(await readFile("broadcast/Deploy.s.sol/10143/run-latest.json", "utf8"));
if (Number(broadcast.chain) !== chainId) throw new Error("Deployment broadcast is for the wrong chain");
const privateKey = localEnv.get("MONAD_TESTNET_PRIVATE_KEY");
if (!privateKey) throw new Error("MONAD_TESTNET_PRIVATE_KEY is missing from .env.local");
const keyOwner = privateKeyToAccount(privateKey).address;

const receipts = new Map((broadcast.receipts ?? []).map((receipt) => [receipt.transactionHash.toLowerCase(), receipt]));
const deploymentTransactions = (broadcast.transactions ?? [])
  .filter((transaction) => transaction.transactionType === "CREATE" && transaction.contractName === "DemoToken")
  .map((transaction) => {
    const receipt = receipts.get(transaction.hash.toLowerCase());
    if (!receipt || receipt.status !== "0x1" || !receipt.contractAddress) {
      throw new Error(`Token deployment ${transaction.hash} has no successful receipt`);
    }
    if (
      !transaction.transaction?.from ||
      !receipt.from ||
      getAddress(transaction.transaction.from) !== getAddress(keyOwner) ||
      getAddress(receipt.from) !== getAddress(keyOwner)
    ) {
      throw new Error(`Token deployment ${transaction.hash} was not sent by the configured testnet key`);
    }
    return {
      transaction,
      address: getAddress(receipt.contractAddress),
      transactionHash: transaction.hash,
      blockNumber: BigInt(receipt.blockNumber).toString(),
    };
  });
if (deploymentTransactions.length !== 2) throw new Error(`Expected two token deployments, found ${deploymentTransactions.length}`);

const [dollarDeployment, euroDeployment] = deploymentTransactions;
if (
  JSON.stringify(dollarDeployment.transaction.arguments) !== JSON.stringify(["Keycut Demo Dollar", "KUSD", "1000000000000000000000000"]) ||
  JSON.stringify(euroDeployment.transaction.arguments) !== JSON.stringify(["Keycut Demo Euro", "KEUR", "1000000000000000000000000"])
) {
  throw new Error("Deployment constructor arguments did not match the expected demo tokens");
}
const dollar = { address: dollarDeployment.address, transactionHash: dollarDeployment.transactionHash, blockNumber: dollarDeployment.blockNumber };
const euro = { address: euroDeployment.address, transactionHash: euroDeployment.transactionHash, blockNumber: euroDeployment.blockNumber };
const owner = getAddress(keyOwner);
const configuredOwner = localEnv.get("MONAD_TESTNET_ADDRESS");
if (configuredOwner && getAddress(configuredOwner) !== owner) {
  throw new Error("MONAD_TESTNET_ADDRESS does not match the key that deployed the tokens");
}
const manifest = {
  chainId,
  owner,
  scanFromBlock: [dollar, euro].map((token) => BigInt(token.blockNumber)).reduce((a, b) => a < b ? a : b).toString(),
  tokens: [
    { name: "Keycut Demo Dollar", symbol: "KUSD", ...dollar },
    { name: "Keycut Demo Euro", symbol: "KEUR", ...euro },
  ],
  approvals: [],
};
await writeFile("deployments/monad-testnet.json", `${JSON.stringify(manifest, null, 2)}\n`);
localEnv.set("MONAD_TOKEN_A_ADDRESS", dollar.address);
localEnv.set("MONAD_TOKEN_B_ADDRESS", euro.address);
localEnv.set("MONAD_TESTNET_ADDRESS", owner);
await writeFile(".env.local", [...localEnv].map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
await chmod(".env.local", 0o600);
console.log(JSON.stringify({ chainId, owner: manifest.owner, tokens: manifest.tokens, scanFromBlock: manifest.scanFromBlock }, null, 2));
