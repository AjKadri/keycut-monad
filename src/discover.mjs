import { createApprovalAccumulator, createDefaultPublicClient, scanRpcRange } from "./discovery-core.mjs";

export async function discover({ owner, fromBlock, toBlock, chunkSize = 100n, client = createDefaultPublicClient() }) {
  if (fromBlock === undefined) throw new TypeError("fromBlock is required for browser-safe RPC discovery");
  const end = toBlock === undefined ? await client.getBlockNumber() : BigInt(toBlock);
  return scanRpcRange({
    owner,
    fromBlock,
    toBlock: end,
    chunkSize,
    client,
    accumulator: createApprovalAccumulator(owner),
    requestedFromBlock: fromBlock,
    requestedToBlock: end,
    source: "rpc",
  });
}
