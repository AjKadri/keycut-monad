import "../scripts/load-env-local.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPublicClient, http } from "viem";
import { discover } from "../src/server/index.mjs";
import { revoke, verify } from "../src/permissions.mjs";
import { monadTestnet } from "../src/chain.mjs";

const deployment = JSON.parse(await readFile(new URL("../deployments/monad-testnet.json", import.meta.url), "utf8"));
const revokedSeed = deployment.approvals.find(({ label }) => label === "Demo spender Charlie");
assert.ok(revokedSeed, "seed manifest includes the Charlie approval");

test("revoke sends approve(spender, 0) through the injected wallet client", async () => {
  const owner = deployment.owner;
  const spender = revokedSeed.spender;
  const token = revokedSeed.token;
  const hash = `0x${"11".repeat(32)}`;
  let request;
  const walletClient = {
    writeContract: async (nextRequest) => {
      request = nextRequest;
      return hash;
    },
  };

  const result = await revoke(token, spender, { walletClient, account: owner });

  assert.equal(result, hash);
  assert.equal(request.address, token);
  assert.equal(request.functionName, "approve");
  assert.deepEqual(request.args, [spender, 0n]);
  assert.equal(request.account, owner);
});

test("live testnet verify and discover reflect the completed revoke", async () => {
  const client = createPublicClient({
    chain: monadTestnet,
    transport: http(globalThis.process?.env?.MONAD_TESTNET_RPC_URL ?? undefined),
  });
  const revoked = await verify(deployment.owner, revokedSeed.token, revokedSeed.spender, { publicClient: client });
  assert.deepEqual(revoked, { allowance: "0", isRevoked: true });

  const result = await discover({
    owner: deployment.owner,
    fromBlock: BigInt(deployment.scanFromBlock),
    rpcFromBlock: BigInt(deployment.scanFromBlock),
    client,
  });
  const expected = deployment.approvals
    .filter(({ token, spender }) => token.toLowerCase() !== revokedSeed.token.toLowerCase() || spender.toLowerCase() !== revokedSeed.spender.toLowerCase())
    .map(({ token, spender, allowance }) => [`${token.toLowerCase()}:${spender.toLowerCase()}`, allowance])
    .sort(([left], [right]) => left.localeCompare(right));
  const actual = result.approvals
    .map(({ token, spender, allowance }) => [`${token.toLowerCase()}:${spender.toLowerCase()}`, allowance])
    .sort(([left], [right]) => left.localeCompare(right));

  assert.ok(result.coveredRanges.length > 0, result.coverageReport);
  assert.ok(result.logCount >= deployment.approvals.length + 1);
  assert.deepEqual(actual, expected);
  assert.equal(actual.length, 2);
  assert.equal(actual.some(([key]) => key.endsWith(`:${revokedSeed.spender.toLowerCase()}`)), false);
});
