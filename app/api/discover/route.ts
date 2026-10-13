import 'server-only'
import { getAddress, isAddress } from 'viem'
import seedManifest from '../../../deployments/monad-testnet.json'
import grantManifest from '../../../deployments/monad-testnet-grants.json'
import { createDefaultPublicClient } from '../../../src/discovery-core.mjs'
import { monadMainnet, monadTestnet } from '../../../src/chain.mjs'
import { discover } from '../../../src/server/index.mjs'
import { createIpRateLimiter, getClientIp } from '../../../src/server/rate-limit.mjs'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const requestsPerMinute = createIpRateLimiter({ limit: 10, windowMs: 60_000 })
const maxUint256 = (1n << 256n) - 1n
type DiscoveryApproval = { token: string; spender: string; allowance: string }
const symbolAbi = [{ type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }] as const
const decimalsAbi = [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }] as const

const seededTokens = new Map(seedManifest.tokens.map(token => [token.address.toLowerCase(), { symbol: token.symbol, decimals: 18 }]))
const seededLabels = new Map(seedManifest.approvals.map(approval => [`${approval.token.toLowerCase()}:${approval.spender.toLowerCase()}`, approval.label.replace(/^Demo spender\s*/, '')]))

async function tokenMetadata(client: ReturnType<typeof createDefaultPublicClient>, chainId: number, tokens: string[]) {
  const metadata = new Map<string, { symbol: string; decimals: number | null }>()
  const unknown = [...new Set(tokens.map(token => token.toLowerCase()))].filter(token => !(chainId === monadTestnet.id && seededTokens.has(token)))
  for (const token of tokens) {
    const seeded = chainId === monadTestnet.id ? seededTokens.get(token.toLowerCase()) : undefined
    if (seeded) metadata.set(token.toLowerCase(), seeded)
  }
  if (!unknown.length) return metadata

  try {
    const reads = await client.multicall({
      contracts: unknown.flatMap(address => [
        { address: address as `0x${string}`, abi: symbolAbi, functionName: 'symbol' },
        { address: address as `0x${string}`, abi: decimalsAbi, functionName: 'decimals' },
      ]),
      allowFailure: true,
    })
    unknown.forEach((address, index) => {
      const symbol = reads[index * 2]
      const decimals = reads[index * 2 + 1]
      metadata.set(address, {
        symbol: symbol?.status === 'success' && typeof symbol.result === 'string' && symbol.result.trim()
          ? symbol.result.trim().slice(0, 32)
          : `${address.slice(0, 6)}…${address.slice(-4)}`,
        decimals: decimals?.status === 'success' && Number.isInteger(Number(decimals.result)) && Number(decimals.result) >= 0 && Number(decimals.result) <= 255
          ? Number(decimals.result)
          : null,
      })
    })
  } catch {
    for (const address of unknown) metadata.set(address, { symbol: `${address.slice(0, 6)}…${address.slice(-4)}`, decimals: null })
  }
  return metadata
}

export async function GET(request: Request) {
  const rate = requestsPerMinute(getClientIp(request))
  if (!rate.allowed) {
    return Response.json({ error: 'Too many wallet scans. Try again shortly.' }, {
      status: 429,
      headers: { 'Retry-After': String(rate.retryAfterSeconds), 'Cache-Control': 'no-store' },
    })
  }

  const url = new URL(request.url)
  const chainName = url.searchParams.get('chain') ?? 'testnet'
  const rawOwner = url.searchParams.get('owner') ?? ''
  if (chainName !== 'testnet' && chainName !== 'mainnet') {
    return Response.json({ error: 'Choose Monad Testnet or Monad Mainnet.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!isAddress(rawOwner, { strict: false })) {
    return Response.json({ error: 'Enter a valid wallet address.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  const chain = chainName === 'mainnet' ? monadMainnet : monadTestnet
  const owner = getAddress(rawOwner)
  const client = createDefaultPublicClient(chain)
  try {
    const result = await discover({ owner, chain, client, grantAddress: chain.id === monadTestnet.id ? grantManifest.address as `0x${string}` : undefined })
    const metadata = await tokenMetadata(client, chain.id, result.approvals.map((approval: DiscoveryApproval) => approval.token))
    const approvals = result.approvals.map((approval: DiscoveryApproval) => {
      const token = metadata.get(approval.token.toLowerCase()) ?? { symbol: `${approval.token.slice(0, 6)}…${approval.token.slice(-4)}`, decimals: null }
      return {
        ...approval,
        tokenSymbol: token.symbol,
        tokenDecimals: token.decimals,
        unlimited: BigInt(approval.allowance) === maxUint256,
        demoLabel: chain.id === monadTestnet.id ? seededLabels.get(`${approval.token.toLowerCase()}:${approval.spender.toLowerCase()}`) ?? null : null,
      }
    })

    return Response.json({
      chain: chainName,
      chainId: chain.id,
      owner,
      approvals,
      grants: result.grants,
      coverageReport: result.coverageReport,
      complete: result.complete,
      source: result.source,
      hypersyncRequests: result.hypersyncRequests,
      cacheHit: result.cacheHit,
      allowanceReadBlock: result.allowanceReadBlock,
      errorCount: result.errors.length,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'The wallet scan failed. Try again in a moment.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
