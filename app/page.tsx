import Link from 'next/link'
import { LookupForm } from '../components/lookup-form'

const demoWallet = '0x5E9bbd8Ba62bB50e82E9153A3999C6e358E7A748'

export default function HomePage() {
  return <main className="wrap">
    <section className="hero home-design">
      <div>
        <p className="eyebrow">Monad token approvals</p>
        <h1><span>See who can</span><span>spend from a</span><span>wallet.</span></h1>
        <p className="lede">Find active ERC-20 approvals, see how much each spender can use, and revoke access with your wallet.</p>
        <LookupForm />
        <div className="demo-cta">
          <Link className="btn btn-line" href={`/testnet/${demoWallet}`}>Try the demo wallet</Link>
          <p>See what can spend from a Monad wallet, and revoke it.</p>
        </div>
      </div>
      <aside className="ledger" aria-label="How Keycut works">
        <div className="ledger-head"><span>Approval check</span><span>Monad</span></div>
        <p className="verdict">Your wallet stays yours.</p>
        <div className="rows">
          <div className="row"><span className="id">01 · Find</span><span className="state">Read</span><span className="what">Check Approval events and current allowance values.</span></div>
          <div className="row"><span className="id">02 · Review</span><span className="state">Understand</span><span className="what">See the token, spender, and amount in plain words.</span></div>
          <div className="row"><span className="id">03 · Revoke</span><span className="state live">Your wallet</span><span className="what">Approve zero from your connected wallet, then verify it on-chain.</span></div>
        </div>
        <p className="ledger-foot">Approval history shows its covered block range.</p>
      </aside>
    </section>
    <div className="cutline" />
    <section className="how" id="how"><div><h2>Review access before it surprises you.</h2><p>ERC-20 approvals let another address spend tokens from a wallet. Keycut helps you inspect and cut that allowance.</p></div>
      <ol><li><h3>Read the history</h3><p>Approval events identify the token and spender pairs to check.</p></li><li><h3>Check the live amount</h3><p>Each card uses the current on-chain allowance, including zeroed approvals.</p></li><li><h3>Revoke with your wallet</h3><p>Your wallet signs approve(spender, 0). Keycut then reads the allowance again.</p></li></ol>
    </section>
  </main>
}
