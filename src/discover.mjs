import { createApprovalAccumulator, createDefaultPublicClient, scanRpcRange } from "./discovery-core.mjs";
import { grantEventTopics, readGrantStates, parseGrantLogs } from "./grants.mjs";

export async function discover({ owner, fromBlock, toBlock, chunkSize = 100n, client = createDefaultPublicClient(), grantAddress }) {
  if (fromBlock === undefined) throw new TypeError("fromBlock is required for browser-safe RPC discovery");
  const end = toBlock === undefined ? await client.getBlockNumber() : BigInt(toBlock);
  const result = await scanRpcRange({
    owner,
    fromBlock,
    toBlock: end,
    chunkSize,
    client,
    accumulator: createApprovalAccumulator(owner),
    requestedFromBlock: fromBlock,
    requestedToBlock: end,
    source: "rpc",
    extraLogTopics: grantAddress ? grantEventTopics : [],
  });
  if (!grantAddress) return { ...result, grants: [] };
  const found = parseGrantLogs(result.grantLogs, owner, grantAddress);
  const states = await readGrantStates({ client, owner, grantAddress, grants: found, blockNumber: end });
  return {
    ...result,
    grants: states.grants,
    errors: [...result.errors, ...states.errors],
    complete: result.complete && states.errors.length === 0,
  };
}
