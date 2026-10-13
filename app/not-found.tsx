import Link from 'next/link'

export default function NotFound() {
  return <main className="wrap not-found"><p className="eyebrow">Wallet address not found</p><h1>Check the address.</h1><p>Enter a full Monad wallet address to see its approvals.</p><Link className="btn btn-cut" href="/">Back to Keycut</Link></main>
}
