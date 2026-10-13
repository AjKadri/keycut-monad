import { readFile, writeFile } from "node:fs/promises";
import { getAddress } from "viem";
import { demoSpenders } from "../src/demo-spenders.mjs";

const chainId = 10143;
const manifest = JSON.parse(await readFile("deployments/monad-testnet.json", "utf8"));
const broadcast = JSON.parse(await readFile("broadcast/Approve.s.sol/10143/run-latest.json", "utf8"));
if (Number(broadcast.chain) !== chainId || manifest.chainId !== chainId) {
  throw new Error("Approval broadcast is for the wrong chain");
}

const expected = [
  { token: manifest.tokens[0], spender: demoSpenders[0], amount: 1_000n * 10n ** 18n },
  { token: manifest.tokens[0], spender: demoSpenders[1], amount: 350n * 10n ** 18n },
  { token: manifest.tokens[1], spender: demoSpenders[2], amount: 75n * 10n ** 18n },
];
const receipts = new Map((broadcast.receipts ?? []).map((receipt) => [receipt.transactionHash.toLowerCase(), receipt]));
const transactions = broadcast.transactions ?? [];
if (transactions.length !== expected.length) {
  throw new Error(`Expected ${expected.length} approval transactions, found ${transactions.length}`);
}

manifest.approvals = transactions.map((transaction, index) => {
  const receipt = receipts.get(transaction.hash.toLowerCase());
  const seed = expected[index];
  if (!receipt || receipt.status !== "0x1") {
    throw new Error(`Approval transaction ${index + 1} has no successful receipt`);
  }
  if (
    transaction.transactionType !== "CALL" ||
    transaction.function !== "approve(address,uint256)" ||
    getAddress(transaction.contractAddress) !== seed.token.address ||
    !transaction.transaction?.to ||
    !transaction.transaction?.from ||
    !receipt.from ||
    !receipt.to ||
    getAddress(transaction.transaction?.to) !== seed.token.address ||
    getAddress(transaction.transaction?.from) !== manifest.owner ||
    getAddress(receipt?.from) !== manifest.owner ||
    getAddress(receipt?.to) !== seed.token.address ||
    !Array.isArray(transaction.arguments) ||
    transaction.arguments.length !== 2 ||
    getAddress(transaction.arguments[0]) !== seed.spender.address ||
    BigInt(transaction.arguments[1]) !== seed.amount
  ) {
    throw new Error(`Approval transaction ${index + 1} did not match its expected token or receipt`);
  }
  return {
    token: seed.token.address,
    tokenSymbol: seed.token.symbol,
    spender: seed.spender.address,
    label: seed.spender.label,
    allowance: seed.amount.toString(),
    transactionHash: transaction.hash,
    blockNumber: BigInt(receipt.blockNumber).toString(),
  };
});

await writeFile("deployments/monad-testnet.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ chainId, owner: manifest.owner, approvals: manifest.approvals }, null, 2));
