'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPublicClient, createWalletClient, custom, getAddress, http } from 'viem'
import { ApprovalCard, type ApprovalCardData } from './approval-card'
import { useWallet } from './wallet-context'
import { monadMainnet, monadTestnet } from '../src/chain.mjs'
import { revoke, verify } from '../src/permissions.mjs'

type DiscoveryResponse = {
  chain: 'testnet' | 'mainnet'
  chainId: number
  owner: string
  approvals: ApprovalCardData[]
  coverageReport: string
  complete: boolean
  source: string
  hypersyncRequests: number
  cacheHit: boolean
  allowanceReadBlock: string
  errorCount: number
  error?: string
}

export function AccountDashboard({ chain, address }: { chain: 'testnet' | 'mainnet'; address: string }) {
  const wallet = useWallet()
  const [data, setData] = useState<DiscoveryResponse | null>(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [busyKey, setBusyKey] = useState('')
  const [busyText, setBusyText] = useState('')
  const [revokedCards, setRevokedCards] = useState<Record<string, { approval: ApprovalCardData; hash: `0x${string}`; explorerUrl: string }>>({})
  const isOwnerConnected = Boolean(data && wallet.address && wallet.address.toLowerCase() === data.owner.toLowerCase())
  const isOnSelectedChain = Boolean(data && wallet.chainId === data.chainId)
  const canRevoke = isOwnerConnected && isOnSelectedChain
  const chainConfig = chain === 'testnet' ? monadTestnet : monadMainnet
  const labelStorageKey = `keycut:user-labels:${chain}:${address.toLowerCase()}`

  const scan = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ chain, owner: address })
      const response = await fetch(`/api/discover?${query}`, { cache: 'no-store', signal })
      const body = await response.json() as DiscoveryResponse
      if (!response.ok) throw new Error(body.error || 'The wallet scan failed.')
      setData(body)
    } catch (cause) {
      if (signal.aborted) return
      setError(cause instanceof Error ? cause.message : 'The wallet scan failed.')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [address, chain])

  useEffect(() => {
    const controller = new AbortController()
    void scan(controller.signal)
    return () => controller.abort()
  }, [scan, attempt])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(labelStorageKey)
      setLabels(stored ? JSON.parse(stored) as Record<string, string> : {})
    } catch {
      setLabels({})
    }
  }, [labelStorageKey])

  function saveLabel(spender: string, value: string) {
    const normalized = value.trim().slice(0, 50)
    setLabels(current => {
      const next = { ...current }
      if (normalized) next[spender.toLowerCase()] = normalized
      else delete next[spender.toLowerCase()]
      try { localStorage.setItem(labelStorageKey, JSON.stringify(next)) } catch { setActionError('Could not save this user label in local storage.') }
      return next
    })
  }

  async function revokeApproval(approval: ApprovalCardData) {
    const owner = wallet.address
    const provider = window.ethereum
    const identity = `${approval.token.toLowerCase()}:${approval.spender.toLowerCase()}`
    if (!owner || !provider || !canRevoke) return
    setActionError('')
    setBusyKey(identity)
    setBusyText('Confirm in MetaMask…')
    try {
      const currentChain = await provider.request({ method: 'eth_chainId' }) as string
      if (Number.parseInt(currentChain, 16) !== chainConfig.id) throw new Error(`Switch MetaMask to Monad ${chain === 'testnet' ? 'Testnet' : 'Mainnet'} before revoking.`)
      const account = getAddress(owner)
      const publicClient = createPublicClient({ chain: chainConfig, transport: http() })
      const walletClient = createWalletClient({ account, chain: chainConfig, transport: custom(provider as never) })
      const hash = await revoke(approval.token, approval.spender, { walletClient, account })
      setBusyText('Waiting for receipt…')
      await publicClient.waitForTransactionReceipt({ hash })
      setBusyText('Verifying allowance…')
      const result = await verify(account, approval.token, approval.spender, { publicClient })
      if (!result.isRevoked) throw new Error(`Transaction confirmed, but allowance is still ${result.allowance}.`)
      setRevokedCards(current => ({
        ...current,
        [identity]: { approval, hash, explorerUrl: `${chainConfig.blockExplorers.default.url}/tx/${hash}` },
      }))
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The allowance could not be revoked and verified.')
    } finally {
      setBusyKey('')
      setBusyText('')
    }
  }

  const activeApprovals = data?.approvals ?? []
  const activeKeys = new Set(activeApprovals.map(approval => `${approval.token.toLowerCase()}:${approval.spender.toLowerCase()}`))
  const visibleApprovals = [
    ...activeApprovals.map(approval => ({ ...approval, userLabel: labels[approval.spender.toLowerCase()] ?? null })),
    ...Object.entries(revokedCards)
      .filter(([identity]) => !activeKeys.has(identity))
      .map(([identity, record]) => ({ ...record.approval, userLabel: labels[record.approval.spender.toLowerCase()] ?? null, identity })),
  ]
  const activeCount = activeApprovals.filter(approval => !revokedCards[`${approval.token.toLowerCase()}:${approval.spender.toLowerCase()}`]).length

  return <main className="wrap acct">
    <p className="eyebrow">Monad {chain === 'testnet' ? 'Testnet' : 'Mainnet'} · Approval review</p>
    <h1>Who can spend?</h1>
    <p className="who">Wallet <span className="addr">{address}</span></p>
    <section className="wallet-panel" aria-live="polite">
      {wallet.address
        ? <><p>Connected wallet <span className="mono">{wallet.address}</span></p><button className="btn btn-line" type="button" onClick={() => { wallet.clearError(); void wallet.connect(chain).catch(() => {}) }}>{isOwnerConnected && !isOnSelectedChain ? `Switch to Monad ${chain === 'testnet' ? 'Testnet' : 'Mainnet'}` : 'Change wallet'}</button></>
        : <><p>Connect the wallet that owns these approvals to reveal revoke controls.</p><button className="btn btn-line" type="button" onClick={() => { wallet.clearError(); void wallet.connect(chain).catch(() => {}) }}>Connect wallet</button></>}
      {wallet.error && <p className="fine err" role="alert">{wallet.error}</p>}
      {isOwnerConnected && !isOnSelectedChain && <p className="fine">Revoke controls stay hidden until MetaMask is on this network.</p>}
      {wallet.address && !isOwnerConnected && <p className="fine">This wallet does not own the approvals shown. Revoke controls are hidden.</p>}
    </section>
    {loading && <section className="ledger scan-state scanning" aria-live="polite"><div className="scanbar" /><div className="ledger-head"><span>Approval check</span><span>Scanning</span></div><p className="verdict">Reading approval history and live allowances.</p><div className="spin" aria-label="Scanning" /><p className="ledger-foot">The scan runs on the server. Envio credentials stay there.</p></section>}
    {error && <section className="state-panel partial" role="alert"><h2>Scan failed</h2><p>{error}</p><button className="btn btn-line" onClick={() => setAttempt(value => value + 1)}>Try again</button></section>}
    {actionError && <section className="state-panel partial" role="alert"><p>{actionError}</p></section>}
    {data && !loading && <>
      <section className={`state-panel${data.complete ? '' : ' partial'}`} aria-live="polite">
        <div className="ledger-head"><span>{activeCount} active {activeCount === 1 ? 'approval' : 'approvals'}</span><span>{data.complete ? 'Covered' : 'Partial coverage'}</span></div>
        <p className="coverage">{data.coverageReport}</p>
        {data.errorCount > 0 && <p className="subtext">Some allowance reads failed. Results may be incomplete.</p>}
        <button className="btn btn-line" onClick={() => setAttempt(value => value + 1)}>Refresh scan</button>
      </section>
      {visibleApprovals.length > 0
        ? <div className="cards">{visibleApprovals.map(approval => {
          const identity = `${approval.token.toLowerCase()}:${approval.spender.toLowerCase()}`
          const revoked = revokedCards[identity]
          return <ApprovalCard
            key={identity}
            approval={approval}
            canRevoke={canRevoke}
            canEditLabel={isOwnerConnected}
            busyText={busyKey === identity ? busyText : undefined}
            revokedTransaction={revoked ? { hash: revoked.hash, explorerUrl: revoked.explorerUrl } : undefined}
            onRevoke={() => void revokeApproval(approval)}
            onSaveLabel={label => saveLabel(approval.spender, label)}
          />
        })}</div>
        : <section className="empty" style={{ display: 'block' }}><h3>No active approvals found in the covered range.</h3><p>Current allowance reads were checked at block {Number(data.allowanceReadBlock).toLocaleString()}.</p></section>}
    </>}
  </main>
}
