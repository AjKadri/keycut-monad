import { readFile } from "node:fs/promises";
import { discover } from "../src/discover.mjs";

const deployment = JSON.parse(await readFile("deployments/monad-testnet.json", "utf8"));
const result = await discover({
  owner: deployment.owner,
  fromBlock: BigInt(deployment.scanFromBlock),
});

const expected = new Map(
  deployment.approvals.map((approval) => [
    `${approval.token.toLowerCase()}:${approval.spender.toLowerCase()}`,
    approval.allowance,
  ]),
);
const actual = new Map(
  result.approvals.map((approval) => [
    `${approval.token.toLowerCase()}:${approval.spender.toLowerCase()}`,
    approval.allowance,
  ]),
);
const exactMatch =
  result.logCount === deployment.approvals.length &&
  actual.size === expected.size &&
  [...expected].every(([key, allowance]) => actual.get(key) === allowance);

console.log(JSON.stringify(result, null, 2));
if (!result.complete || !exactMatch) process.exitCode = 1;
