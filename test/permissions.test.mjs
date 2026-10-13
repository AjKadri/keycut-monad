import "../scripts/load-env-local.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPublicClient, http } from "viem";
import { discover } from "../src/server/index.mjs";
import { revoke, verify } from "../src/permissions.mjs";
import { monadTestnet } from "../src/chain.mjs";
import { allowanceAbi } from "../src/discovery-core.mjs";

const deployment = JSON.parse(await readFile(new URL("../deployments/monad-testnet.json", import.meta.url), "utf8"));
const grantDeployment = JSON.parse(await readFile(new URL("../deployments/monad-testnet-grants.json", import.meta.url), "utf8"));
const grantSeed = JSON.parse(await readFile(new URL("../deployments/monad-testnet-grant-seed.json", import.meta.url), "utf8"));
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
  const revokeReceipt = await client.getTransactionReceipt({ hash: "0x678f2d4c9e20e9d83f5912e6340da88c482d6254a39c3bc9e7f8d6810f528bde" });
  assert.equal(revokeReceipt.status, "success");
  const revokedAllowance = await client.readContract({
    address: revokedSeed.token,
    abi: allowanceAbi,
    functionName: "allowance",
    args: [deployment.owner, revokedSeed.spender],
    blockNumber: revokeReceipt.blockNumber,
  });
  const revoked = { allowance: revokedAllowance.toString(), isRevoked: revokedAllowance === 0n };
  assert.deepEqual(revoked, { allowance: "0", isRevoked: true });

  const result = await discover({
    owner: deployment.owner,
    fromBlock: BigInt(deployment.scanFromBlock),
    rpcFromBlock: BigInt(deployment.scanFromBlock),
    client,
    grantAddress: grantDeployment.address,
  });
  const liveApprovals = await Promise.all(deployment.approvals.map(async (approval) => ({
    ...approval,
    state: await verify(deployment.owner, approval.token, approval.spender, { publicClient: client }),
  })));
  const grantAllowance = await verify(deployment.owner, grantSeed.token, grantDeployment.address, { publicClient: client });
  const expected = liveApprovals
    .filter(({ state }) => BigInt(state.allowance) > 0n)
    .map(({ token, spender, state }) => [`${token.toLowerCase()}:${spender.toLowerCase()}`, state.allowance])
    .concat(grantAllowance.allowance === "0" ? [] : [[`${grantSeed.token.toLowerCase()}:${grantDeployment.address.toLowerCase()}`, grantAllowance.allowance]])
    .sort(([left], [right]) => left.localeCompare(right));
  const actual = result.approvals
    .map(({ token, spender, allowance }) => [`${token.toLowerCase()}:${spender.toLowerCase()}`, allowance])
    .sort(([left], [right]) => left.localeCompare(right));

  assert.ok(result.coveredRanges.length > 0, result.coverageReport);
  assert.ok(result.logCount >= deployment.approvals.length + 1);
  assert.deepEqual(actual, expected);
  assert.equal(actual.length, expected.length);
  for (const approval of liveApprovals.filter(({ state }) => BigInt(state.allowance) === 0n)) {
    assert.equal(actual.some(([key]) => key.endsWith(`:${approval.spender.toLowerCase()}`)), false);
  }
  assert.equal(result.grants.length, 1);
  assert.equal(result.grants[0].active, true);
});
