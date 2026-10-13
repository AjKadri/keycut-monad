import "../scripts/load-env-local.mjs";
import { readFile } from "node:fs/promises";
import { discover } from "../src/server/index.mjs";
import { verify } from "../src/permissions.mjs";

const scanStarted = performance.now();
const deployment = JSON.parse(await readFile("deployments/monad-testnet.json", "utf8"));
const result = await discover({
  owner: deployment.owner,
});
const scanDurationMs = Math.round(performance.now() - scanStarted);

const revokedSeed = deployment.approvals.find(({ label }) => label === "Demo spender Charlie");
if (!revokedSeed) throw new Error("The seed manifest has no Demo spender Charlie approval");
const revokedState = await verify(deployment.owner, revokedSeed.token, revokedSeed.spender);
const expected = new Map(
  deployment.approvals
    .filter(({ token, spender }) => token.toLowerCase() !== revokedSeed.token.toLowerCase() || spender.toLowerCase() !== revokedSeed.spender.toLowerCase())
    .map((approval) => [
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
  result.logCount >= deployment.approvals.length + 1 &&
  revokedState.isRevoked &&
  actual.size === expected.size &&
  [...expected].every(([key, allowance]) => actual.get(key) === allowance);

console.log(JSON.stringify({ discovery: result, revokedAllowance: revokedState, scanDurationMs }, null, 2));
if (!result.complete || !exactMatch) process.exitCode = 1;
