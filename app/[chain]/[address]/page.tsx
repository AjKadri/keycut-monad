import { isAddress } from 'viem'
import { notFound } from 'next/navigation'

export default async function AccountPage({ params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params
  if ((chain !== 'testnet' && chain !== 'mainnet') || !isAddress(address, { strict: false })) notFound()
  return <main className="wrap acct">
    <p className="eyebrow">Monad {chain === 'testnet' ? 'Testnet' : 'Mainnet'} · Approval review</p>
    <h1>Who can spend?</h1>
    <p className="who">Wallet <span className="addr">{address}</span></p>
    <section className="ledger scan-state" aria-live="polite">
      <div className="ledger-head"><span>Approval check</span><span>Preparing scan</span></div>
      <p className="verdict">The live allowance scan is being connected.</p>
      <p className="ledger-foot">This dashboard shell is ready. Scan results will appear here once the API route is wired.</p>
    </section>
  </main>
}
