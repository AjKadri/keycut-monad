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

export function ApprovalCard({ approval }: { approval: ApprovalCardData }) {
  const amount = approval.unlimited
    ? 'Unlimited'
    : approval.tokenDecimals === null ? `${BigInt(approval.allowance).toLocaleString()} raw units` : formatUnits(BigInt(approval.allowance), approval.tokenDecimals)
  const displayLabel = approval.userLabel?.trim() || approval.demoLabel?.trim() || ''
  const spenderName = displayLabel || shortAddress(approval.spender)
  const labelType = approval.userLabel?.trim() ? 'User label' : approval.demoLabel?.trim() ? 'Demo label' : null
  const sentence = approval.unlimited
    ? `${spenderName} can spend an unlimited amount of ${approval.tokenSymbol} from this wallet.`
    : `${spenderName} can spend up to ${amount} ${approval.tokenSymbol} from this wallet.`
  return <article className={`card found approval-card${approval.unlimited ? ' flag' : ''}`}>
    <div className="head">
      <span className="kind">Token approval</span>
      <details className="address"><summary>{shortAddress(approval.token)}</summary><code>{approval.token}</code></details>
      <div className="card-badges"><span className="badge live">Active</span>{approval.unlimited && <span className="badge risk-high">High risk</span>}</div>
    </div>
    <p className="key-sentence">{sentence}</p>
    <dl className="permission-grid approval-details">
      <div><dt>Token</dt><dd>{approval.tokenSymbol}<small className="mono">{approval.token}</small></dd></div>
      <div><dt>Spender</dt><dd>{spenderName}{labelType && <small>{labelType}</small>}<small className="mono">{approval.spender}</small></dd></div>
      <div><dt>Allowance</dt><dd>{amount}{!approval.unlimited && approval.tokenDecimals !== null && ` ${approval.tokenSymbol}`}{approval.unlimited && <small>Unlimited approvals are high risk.</small>}{approval.tokenDecimals === null && !approval.unlimited && <small>Token decimals could not be read.</small>}</dd></div>
    </dl>
  </article>
}
