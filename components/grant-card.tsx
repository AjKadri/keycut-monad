'use client'

import { useEffect, useState } from 'react'
import { formatUnits } from 'viem'

export type GrantCardData = {
  agent: `0x${string}`
  token: `0x${string}`
  tokenSymbol: string
  tokenDecimals: number | null
  cap: string
  spent: string
  expiry: string
  active: boolean
  userLabel?: string | null
}

const shortAddress = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`
const formatAmount = (value: string, decimals: number | null) => decimals === null
  ? `${BigInt(value).toLocaleString('en-US')} raw units`
  : formatUnits(BigInt(value), decimals).replace(/\.0+$/, '')

type RevokedTransaction = { hash: `0x${string}`; explorerUrl: string }

export function GrantCard({ grant, canRevoke, canEditLabel, busyText, revokedTransaction, onRevoke, onSaveLabel }: {
  grant: GrantCardData
  canRevoke: boolean
  canEditLabel: boolean
  busyText?: string
  revokedTransaction?: RevokedTransaction
  onRevoke: () => void
  onSaveLabel: (label: string) => void
}) {
  const [labelDraft, setLabelDraft] = useState(grant.userLabel ?? '')
  useEffect(() => setLabelDraft(grant.userLabel ?? ''), [grant.userLabel])
  const remaining = BigInt(grant.cap) > BigInt(grant.spent) ? (BigInt(grant.cap) - BigInt(grant.spent)).toString() : '0'
  const label = grant.userLabel?.trim()
  const agentName = label || shortAddress(grant.agent)
  const expiry = new Date(Number(grant.expiry) * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const sentence = revokedTransaction
    ? 'Grant revoked.'
    : `${agentName} can spend ${formatAmount(remaining, grant.tokenDecimals)} ${grant.tokenSymbol} more until ${expiry}.`
  return <article className={`card found approval-card grant-card${revokedTransaction ? ' off' : ''}`}>
    <div className="head">
      <span className="kind">Keycut grant</span>
      <details className="address"><summary>{shortAddress(grant.agent)}</summary><code>{grant.agent}</code></details>
      <div className="card-badges"><span className={`badge ${revokedTransaction ? 'ok' : 'live'}`}>{revokedTransaction ? 'Revoked' : 'Active'}</span></div>
    </div>
    <p className="key-sentence">{sentence}</p>
    <dl className="permission-grid approval-details">
      <div><dt>Agent</dt><dd>{agentName}{label && <small>User label</small>}<small className="mono">{grant.agent}</small></dd></div>
      <div><dt>Token</dt><dd>{grant.tokenSymbol}<small className="mono">{grant.token}</small></dd></div>
      <div><dt>Grant</dt><dd>{formatAmount(grant.spent, grant.tokenDecimals)} of {formatAmount(grant.cap, grant.tokenDecimals)} spent<small>Expires {expiry}</small></dd></div>
    </dl>
    {canEditLabel && !revokedTransaction && <form className="user-label-form" onSubmit={event => { event.preventDefault(); onSaveLabel(labelDraft) }}>
      <label htmlFor={`grant-label-${grant.agent}-${grant.token}`}>User label</label>
      <input id={`grant-label-${grant.agent}-${grant.token}`} value={labelDraft} maxLength={50} placeholder="e.g. Agent: trading bot" onChange={event => setLabelDraft(event.target.value)} />
      <button className="btn btn-small line" type="submit">Save label</button>
    </form>}
    {canRevoke && !revokedTransaction && <div className="acts"><button className="btn btn-cut" type="button" disabled={Boolean(busyText)} onClick={onRevoke}>{busyText || 'Revoke grant'}</button>{busyText && <span className="subtext" aria-live="polite">Confirm in your wallet, then wait for the receipt.</span>}</div>}
    {revokedTransaction && <p className="revoke-confirmation"><a href={revokedTransaction.explorerUrl} target="_blank" rel="noreferrer">View revoke on Monadscan</a><small className="mono">{revokedTransaction.hash}</small></p>}
  </article>
}
