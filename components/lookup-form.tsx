'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { isAddress } from 'viem'

declare global {
  interface Window { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }
}

export function LookupForm() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)

  function openWallet(address: string, chain: string) {
    router.push(`/${chain}/${address}`)
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setError('No injected wallet found. Paste a wallet address or install MetaMask.')
      return
    }
    setConnecting(true)
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      if (!accounts?.[0] || !isAddress(accounts[0], { strict: false })) throw new Error('The wallet did not return an address.')
      openWallet(accounts[0], 'testnet')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect to the wallet.')
    } finally {
      setConnecting(false)
    }
  }

  return <>
    <form className="lookup-form" onSubmit={event => {
      event.preventDefault()
      const values = new FormData(event.currentTarget)
      const address = String(values.get('address')).trim()
      const chain = String(values.get('chain'))
      if (!isAddress(address, { strict: false })) { setError('Enter a full wallet address beginning with 0x.'); return }
      if (chain !== 'testnet' && chain !== 'mainnet') { setError('Choose a Monad network.'); return }
      setError('')
      openWallet(address, chain)
    }}>
      <label htmlFor="chain">Network</label><select id="chain" name="chain"><option value="testnet">Monad Testnet</option><option value="mainnet">Monad Mainnet</option></select>
      <label htmlFor="address">Wallet address</label><input id="address" name="address" placeholder="0x…" required autoComplete="off" spellCheck={false} aria-describedby={error ? 'address-error' : undefined} />
      {error && <p id="address-error" role="alert">{error}</p>}
      <button className="btn btn-cut" type="submit">Check approvals</button>
      <button className="btn btn-line" type="button" disabled={connecting} onClick={connectWallet}>{connecting ? <><span className="spin" aria-hidden="true" /> Connecting…</> : 'Connect wallet'}</button>
    </form>
    {!error && <p className="fine">Read any address without connecting. A wallet is only needed to revoke its approvals.</p>}
  </>
}
