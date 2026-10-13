'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type ChainName = 'testnet' | 'mainnet'
type WalletError = Error & { code?: number }
type InjectedProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

declare global {
  interface Window { ethereum?: InjectedProvider }
}

const networkConfig = {
  testnet: {
    id: 10143,
    hexId: '0x279f',
    name: 'Monad Testnet',
    rpc: 'https://testnet-rpc.monad.xyz',
    explorer: 'https://testnet.monadscan.com',
  },
  mainnet: {
    id: 143,
    hexId: '0x8f',
    name: 'Monad',
    rpc: 'https://rpc.monad.xyz',
    explorer: 'https://monadscan.com',
  },
} as const

type WalletContextValue = {
  address: string | null
  chainId: number | null
  error: string
  clearError: () => void
  connect: (chain: ChainName) => Promise<string>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const provider = window.ethereum
    if (!provider) return
    const updateAccounts = (value: unknown) => setAddress(Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null)
    const updateChain = (value: unknown) => setChainId(typeof value === 'string' && value.startsWith('0x') ? Number.parseInt(value, 16) : null)
    void provider.request({ method: 'eth_accounts' }).then(updateAccounts).catch(() => {})
    void provider.request({ method: 'eth_chainId' }).then(updateChain).catch(() => {})
    provider.on?.('accountsChanged', updateAccounts)
    provider.on?.('chainChanged', updateChain)
    return () => {
      provider.removeListener?.('accountsChanged', updateAccounts)
      provider.removeListener?.('chainChanged', updateChain)
    }
  }, [])

  async function connect(chain: ChainName) {
    const provider = window.ethereum
    if (!provider) {
      const missing = new Error('No injected wallet found. Install MetaMask or another browser wallet.')
      setError(missing.message)
      throw missing
    }
    setError('')
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
      const owner = accounts?.[0]
      if (!owner) throw new Error('The wallet did not return an account.')

      const network = networkConfig[chain]
      const current = await provider.request({ method: 'eth_chainId' }) as string
      if (Number.parseInt(current, 16) !== network.id) {
        try {
          await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: network.hexId }] })
        } catch (switchError) {
          if ((switchError as WalletError)?.code !== 4902) throw switchError
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: network.hexId,
              chainName: network.name,
              nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
              rpcUrls: [network.rpc],
              blockExplorerUrls: [network.explorer],
            }],
          })
          await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: network.hexId }] })
        }
      }
      setAddress(owner)
      setChainId(network.id)
      return owner
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not connect the wallet.'
      setError(message)
      throw cause
    }
  }

  const value = useMemo(() => ({ address, chainId, error, clearError: () => setError(''), connect }), [address, chainId, error])
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const value = useContext(WalletContext)
  if (!value) throw new Error('useWallet must be used inside WalletProvider')
  return value
}
