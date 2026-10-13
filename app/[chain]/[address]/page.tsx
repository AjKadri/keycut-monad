import { isAddress } from 'viem'
import { notFound } from 'next/navigation'
import { AccountDashboard } from '../../../components/account-dashboard'

export default async function AccountPage({ params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params
  if ((chain !== 'testnet' && chain !== 'mainnet') || !isAddress(address, { strict: false })) notFound()
  return <AccountDashboard chain={chain} address={address} />
}
