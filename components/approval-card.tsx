import { formatUnits } from 'viem'

export type ApprovalCardData = {
  token: `0x${string}`
  tokenSymbol: string
  tokenDecimals: number
  spender: `0x${string}`
  allowance: string
  unlimited: boolean
  userLabel?: string
}

const shortAddress = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`

export function ApprovalCard({ approval }: { approval: ApprovalCardData }) {
  const amount = approval.unlimited ? 'Unlimited' : formatUnits(BigInt(approval.allowance), approval.tokenDecimals)
  const displayLabel = approval.userLabel?.trim()
  return <article className={`card found approval-card${approval.unlimited ? ' flag' : ''}`}>
    <div className="head">
      <span className="kind">Token approval</span>
      <details className="address"><summary>{shortAddress(approval.token)}</summary><code>{approval.token}</code></details>
      <div className="card-badges"><span className="badge live">Active</span>{approval.unlimited && <span className="badge risk-high">High risk</span>}</div>
    </div>
    <p className="key-sentence">{shortAddress(approval.spender)} can spend {amount.toLocaleString()} {approval.tokenSymbol} from this wallet.</p>
    <dl className="permission-grid approval-details">
      <div><dt>Token</dt><dd>{approval.tokenSymbol}<small className="mono">{approval.token}</small></dd></div>
      <div><dt>Spender</dt><dd>{displayLabel || shortAddress(approval.spender)}{displayLabel && <small>User label</small>}<small className="mono">{approval.spender}</small></dd></div>
      <div><dt>Allowance</dt><dd>{amount} {approval.tokenSymbol}{approval.unlimited && <small>Unlimited approvals are high risk.</small>}</dd></div>
    </dl>
  </article>
}
