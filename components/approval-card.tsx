'use client'

import { useEffect, useState } from 'react'
import { formatUnits } from 'viem'

export type ApprovalCardData = {
  token: `0x${string}`
  tokenSymbol: string
  tokenDecimals: number | null
  spender: `0x${string}`
  allowance: string
  unlimited: boolean
  demoLabel: string | null
  userLabel?: string | null
}

const shortAddress = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`
const formatTokenAmount = (value: string, decimals: number) => {
  const [whole, fraction] = formatUnits(BigInt(value), decimals).split('.')
  const grouped = BigInt(whole).toLocaleString('en-US')
  return fraction ? `${grouped}.${fraction}` : grouped
}

type RevokedTransaction = { hash: `0x${string}`; explorerUrl: string }

export function ApprovalCard({ approval, canRevoke, canEditLabel, busyText, revokedTransaction, onRevoke, onSaveLabel }: {
  approval: ApprovalCardData
  canRevoke: boolean
  canEditLabel: boolean
  busyText?: string
  revokedTransaction?: RevokedTransaction
  onRevoke: () => void
  onSaveLabel: (label: string) => void
}) {
  const [labelDraft, setLabelDraft] = useState(approval.userLabel ?? '')
  useEffect(() => setLabelDraft(approval.userLabel ?? ''), [approval.userLabel])
  const amount = approval.unlimited
    ? 'Unlimited'
    : approval.tokenDecimals === null ? `${BigInt(approval.allowance).toLocaleString('en-US')} raw units` : formatTokenAmount(approval.allowance, approval.tokenDecimals)
  const displayLabel = approval.userLabel?.trim() || approval.demoLabel?.trim() || ''
  const spenderName = displayLabel || shortAddress(approval.spender)
  const labelType = approval.userLabel?.trim() ? 'User label' : approval.demoLabel?.trim() ? 'Demo label' : null
  const sentence = revokedTransaction
    ? 'Revoked, allowance now 0.'
    : approval.unlimited
      ? `${spenderName} can spend an unlimited amount of ${approval.tokenSymbol} from this wallet.`
      : `${spenderName} can spend up to ${amount} ${approval.tokenSymbol} from this wallet.`
  return <article className={`card found approval-card${approval.unlimited && !revokedTransaction ? ' flag' : ''}${revokedTransaction ? ' off' : ''}`}>
    <div className="head">
      <span className="kind">Token approval</span>
      <details className="address"><summary>{shortAddress(approval.token)}</summary><code>{approval.token}</code></details>
      <div className="card-badges"><span className={`badge ${revokedTransaction ? 'ok' : 'live'}`}>{revokedTransaction ? 'Revoked' : 'Active'}</span>{approval.unlimited && !revokedTransaction && <span className="badge risk-high">High risk</span>}</div>
    </div>
    <p className="key-sentence">{sentence}</p>
    <dl className="permission-grid approval-details">
      <div><dt>Token</dt><dd>{approval.tokenSymbol}<small className="mono">{approval.token}</small></dd></div>
      <div><dt>Spender</dt><dd>{spenderName}{labelType && <small>{labelType}</small>}<small className="mono">{approval.spender}</small></dd></div>
      <div><dt>Allowance</dt><dd>{revokedTransaction ? <>0 {approval.tokenSymbol}<small>Allowance now 0</small></> : <>{amount}{!approval.unlimited && approval.tokenDecimals !== null && ` ${approval.tokenSymbol}`}{approval.unlimited && <small>Unlimited approvals are high risk.</small>}{approval.tokenDecimals === null && !approval.unlimited && <small>Token decimals could not be read.</small>}</>}</dd></div>
    </dl>
    {canEditLabel && !revokedTransaction && <form className="user-label-form" onSubmit={event => { event.preventDefault(); onSaveLabel(labelDraft) }}>
      <label htmlFor={`user-label-${approval.token}-${approval.spender}`}>User label</label>
      <input id={`user-label-${approval.token}-${approval.spender}`} value={labelDraft} maxLength={50} placeholder="e.g. Agent: trading bot" onChange={event => setLabelDraft(event.target.value)} />
      <button className="btn btn-small line" type="submit">Save label</button>
    </form>}
    {canRevoke && !revokedTransaction && <div className="acts"><button className="btn btn-cut" type="button" disabled={Boolean(busyText)} onClick={onRevoke}>{busyText || 'Revoke allowance'}</button>{busyText && <span className="subtext" aria-live="polite">Confirm in your wallet, then wait for the receipt and live allowance check.</span>}</div>}
    {revokedTransaction && <p className="revoke-confirmation"><a href={revokedTransaction.explorerUrl} target="_blank" rel="noreferrer">View revoke on Monadscan</a><small className="mono">{revokedTransaction.hash}</small></p>}
  </article>
}
