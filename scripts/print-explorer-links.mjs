import { readFile } from "node:fs/promises";

const deployment = JSON.parse(await readFile("deployments/monad-testnet.json", "utf8"));
const explorer = "https://testnet.monadscan.com";
console.log(`Owner: ${explorer}/address/${deployment.owner}`);
for (const token of deployment.tokens) {
  console.log(`${token.symbol} contract: ${explorer}/address/${token.address}`);
  console.log(`${token.symbol} deployment: ${explorer}/tx/${token.transactionHash}`);
}
for (const approval of deployment.approvals ?? []) {
  console.log(`${approval.label} approval: ${explorer}/tx/${approval.transactionHash}`);
}
