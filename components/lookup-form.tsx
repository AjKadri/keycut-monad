'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { isAddress } from 'viem'
import { useWallet } from './wallet-context'

export function LookupForm() {
  const router = useRouter()
  const { connect, error: walletError, clearError } = useWallet()
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [selectedChain, setSelectedChain] = useState<'testnet' | 'mainnet'>('testnet')

  function openWallet(address: string, chain: string) {
    router.push(`/${chain}/${address}`)
  }

  async function connectWallet(chain: string) {
    setConnecting(true)
    setError('')
    clearError()
    try {
      const owner = await connect(chain === 'mainnet' ? 'mainnet' : 'testnet')
      if (!isAddress(owner, { strict: false })) throw new Error('The wallet did not return a valid address.')
      openWallet(owner, chain)
    } catch {
      // WalletProvider owns the connection error message.
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
      <label htmlFor="chain">Network</label><select id="chain" name="chain" value={selectedChain} onChange={event => setSelectedChain(event.target.value as 'testnet' | 'mainnet')}><option value="testnet">Monad Testnet</option><option value="mainnet">Monad Mainnet</option></select>
      <label htmlFor="address">Wallet address</label><input id="address" name="address" placeholder="0x…" required autoComplete="off" spellCheck={false} aria-describedby={error ? 'address-error' : undefined} />
      {error && <p id="address-error" role="alert">{error}</p>}
      <button className="btn btn-cut" type="submit">Check approvals</button>
      <button className="btn btn-line" type="button" disabled={connecting} onClick={() => void connectWallet(selectedChain)}>{connecting ? <><span className="spin" aria-hidden="true" /> Connecting…</> : 'Connect wallet'}</button>
    </form>
    {!error && !walletError && <p className="fine">Read any address without connecting. A wallet is only needed to revoke its approvals.</p>}
    {walletError && <p className="fine err" role="alert">{walletError}</p>}
  </>
}
