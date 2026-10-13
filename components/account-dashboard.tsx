'use client'

import { useCallback, useEffect, useState } from 'react'
import { ApprovalCard, type ApprovalCardData } from './approval-card'

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
  const [data, setData] = useState<DiscoveryResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

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

  return <main className="wrap acct">
    <p className="eyebrow">Monad {chain === 'testnet' ? 'Testnet' : 'Mainnet'} · Approval review</p>
    <h1>Who can spend?</h1>
    <p className="who">Wallet <span className="addr">{address}</span></p>
    {loading && <section className="ledger scan-state scanning" aria-live="polite"><div className="scanbar" /><div className="ledger-head"><span>Approval check</span><span>Scanning</span></div><p className="verdict">Reading approval history and live allowances.</p><div className="spin" aria-label="Scanning" /><p className="ledger-foot">The scan runs on the server. Envio credentials stay there.</p></section>}
    {error && <section className="state-panel partial" role="alert"><h2>Scan failed</h2><p>{error}</p><button className="btn btn-line" onClick={() => setAttempt(value => value + 1)}>Try again</button></section>}
    {data && !loading && <>
      <section className={`state-panel${data.complete ? '' : ' partial'}`} aria-live="polite">
        <div className="ledger-head"><span>{data.approvals.length} active {data.approvals.length === 1 ? 'approval' : 'approvals'}</span><span>{data.complete ? 'Covered' : 'Partial coverage'}</span></div>
        <p className="coverage">{data.coverageReport}</p>
        {data.errorCount > 0 && <p className="subtext">Some allowance reads failed. Results may be incomplete.</p>}
        <button className="btn btn-line" onClick={() => setAttempt(value => value + 1)}>Refresh scan</button>
      </section>
      {data.approvals.length > 0
        ? <div className="cards">{data.approvals.map(approval => <ApprovalCard key={`${approval.token}:${approval.spender}`} approval={approval} />)}</div>
        : <section className="empty" style={{ display: 'block' }}><h3>No active approvals found in the covered range.</h3><p>Current allowance reads were checked at block {Number(data.allowanceReadBlock).toLocaleString()}.</p></section>}
    </>}
  </main>
}
