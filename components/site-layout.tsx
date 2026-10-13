'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { WalletProvider } from './wallet-context'

export function Logo() {
  const id = useId().replaceAll(':', '')
  return <svg className="mark" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id={`l${id}`}><polygon points="0,0 40,0 34,64 0,64" /></clipPath><clipPath id={`r${id}`}><polygon points="45.5,0 64,0 64,64 39.5,64" /></clipPath></defs><rect width="64" height="64" rx="16" fill="#0F766E" /><g fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round"><g clipPath={`url(#l${id})`}><circle cx="18" cy="31" r="9" /><path d="M27 31H44" /></g><g className="rpiece" clipPath={`url(#r${id})`}><g transform="translate(2 5) rotate(5 42 31)"><path d="M32 31H54M47 31v8M53 31v6" /></g></g></g><path d="M43.6 15 38.4 49" stroke="#FF6B4A" strokeWidth="3.2" strokeLinecap="round" /></svg>
}

export function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const path = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [chain, setChain] = useState(path.startsWith('/mainnet/') ? 'mainnet' : 'testnet')
  const network = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => setChain(path.startsWith('/mainnet/') ? 'mainnet' : 'testnet'), [path])
  useEffect(() => {
    const placePill = () => {
      const button = network.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      const pill = network.current?.querySelector<HTMLElement>('.pill')
      if (button && pill) {
        pill.style.width = `${button.offsetWidth}px`
        pill.style.transform = `translateX(${button.offsetLeft - 3}px)`
      }
    }
    placePill()
    document.fonts.ready.then(placePill)
    window.addEventListener('resize', placePill)
    return () => window.removeEventListener('resize', placePill)
  }, [chain])
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])

  function chooseChain(value: string) {
    setChain(value)
    const [, current, address] = path.split('/')
    if ((current === 'testnet' || current === 'mainnet') && address) router.push(`/${value}/${address}`)
  }

  const nav = <><Link href="/" aria-current={path === '/' ? 'page' : undefined} onClick={() => setOpen(false)}>Check a wallet</Link><Link href="/developers" aria-current={path === '/developers' ? 'page' : undefined} onClick={() => setOpen(false)}>Developers</Link></>
  const accountPath = path.startsWith('/testnet/') || path.startsWith('/mainnet/')

  return <WalletProvider><>
    <header className="wrap top">
      <Link className="brand" href="/" aria-label="Keycut home"><Logo /><span className="word">Keycut</span></Link>
      <nav className="nav" aria-label="Main navigation">{nav}</nav>
      {accountPath && <div className="net" ref={network} role="group" aria-label="Network">
        <span className="pill" aria-hidden="true" />
        {['testnet', 'mainnet'].map(value => <button key={value} type="button" aria-pressed={chain === value} onClick={() => chooseChain(value)}>{value === 'testnet' ? 'Testnet' : 'Mainnet'}</button>)}
      </div>}
      <button className="menu-btn" aria-expanded={open} aria-controls="phone-menu" onClick={() => setOpen(true)}>Menu</button>
    </header>
    <dialog ref={dialog} id="phone-menu" className="phone-menu" aria-label="Menu" onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="drawer-panel"><div className="row-x"><Link className="brand" href="/" onClick={() => setOpen(false)}><Logo /><span>Keycut</span></Link><button className="menu-btn" onClick={() => setOpen(false)}>Close</button></div><nav>{nav}</nav></div>
    </dialog>
    {children}
    <footer><div className="wrap"><div className="foot">
      <div><Link className="brand" href="/"><Logo /><span>Keycut</span></Link><p>See who can spend from a Monad wallet. Cut approvals you don't want.</p></div>
      <div><h4>Product</h4><ul><li><Link href="/">Check a wallet</Link></li><li><a href="https://testnet.monadscan.com">Monad Testnet explorer</a></li></ul></div>
      <div><h4>Network</h4><ul><li>Monad Testnet · 10143</li><li>Monad Mainnet · 143</li></ul></div>
      <div><h4>About</h4><ul><li>Open SDK</li><li>Wallet-signed revocation</li></ul></div>
    </div><div className="legal"><span>Approval history is only as complete as the coverage line shown.</span><span>Built on Monad.</span></div></div></footer>
  </></WalletProvider>
}
