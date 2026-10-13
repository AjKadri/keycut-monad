import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Keycut for developers',
  description: 'Discover and revoke Monad token approvals with the Keycut SDK.',
}

const install = 'npm install keycut-monad viem'
const discoverCode = `import { discover } from 'keycut-monad/server'

const result = await discover({
  owner: '0x5E9b…A748',
  chain: monadTestnet,
})`
const revokeCode = `import { revoke, verify } from 'keycut-monad'

const hash = await revoke(token, spender, {
  walletClient, account: owner,
})
await publicClient.waitForTransactionReceipt({ hash })
const state = await verify(owner, token, spender, { publicClient })`
const labelCode = [
  'const key = `keycut:user-labels:${owner}:${spender}`',
  "localStorage.setItem(key, 'Agent: trading bot')",
].join('\\n')
const responseCode = `{
  approvals: [{
    token: '0xA653…C430',
    spender: '0x7148…0EDCe',
    allowance: '350000000000000000000'
  }],
  source: 'hypersync',
  complete: true,
  coverageReport:
    'HyperSync scanned 0–70769018; the requested range is fully covered.'
}`

function CodeBlock({ children }: { children: string }) {
  return <pre className="code-block"><code>{children}</code></pre>
}

export default function DevelopersPage() {
  return <main className="wrap developers">
    <section className="dev-hero">
      <div>
        <p className="eyebrow">For builders</p>
        <h1>Make approvals<br />legible and cuttable.</h1>
        <p className="lede">Keycut gives wallets and agents a small, wallet-agnostic SDK for finding active token permissions, adding human context, and revoking access.</p>
      </div>
      <div className="dev-install">
        <span className="dev-label">Install</span>
        <CodeBlock>{install}</CodeBlock>
        <p>Use the server entry for full-history discovery. Use the browser entry with an injected wallet client for signing.</p>
      </div>
    </section>

    <section className="dev-section" aria-labelledby="discover-heading">
      <div className="dev-heading"><p className="eyebrow">01 · Discover</p><h2 id="discover-heading">See who can spend.</h2><p>Approval events identify token and spender pairs. Keycut then reads each live allowance before returning a result.</p></div>
      <div className="dev-grid">
        <CodeBlock>{discoverCode}</CodeBlock>
        <div className="dev-note"><span className="dev-label">Coverage is part of the result</span><CodeBlock>{responseCode}</CodeBlock></div>
      </div>
    </section>

    <section className="dev-section" aria-labelledby="revoke-heading">
      <div className="dev-heading"><p className="eyebrow">02 · Revoke and verify</p><h2 id="revoke-heading">Let the owner cut access.</h2><p><code>revoke()</code> only needs a wallet client. It sends <code>approve(spender, 0)</code>; <code>verify()</code> reads the allowance again.</p></div>
      <div className="dev-grid dev-grid-single"><CodeBlock>{revokeCode}</CodeBlock></div>
    </section>

    <section className="dev-section" aria-labelledby="label-heading">
      <div className="dev-heading"><p className="eyebrow">03 · Label</p><h2 id="label-heading">Keep your own context.</h2><p>Labels live in the dashboard user's local storage. They are annotations for that user and never proof that a spender is verified.</p></div>
      <div className="dev-grid dev-grid-single"><CodeBlock>{labelCode}</CodeBlock></div>
    </section>

    <section className="dev-section" aria-labelledby="source-heading">
      <div className="dev-heading"><p className="eyebrow">Data source</p><h2 id="source-heading">Fast history, honest fallback.</h2></div>
      <div className="source-list">
        <div><span className="source-number">A</span><div><h3>HyperSync first</h3><p>The server queries Monad Approval logs across bounded parallel ranges, caches each wallet for three minutes, and reads live allowances over RPC.</p></div></div>
        <div><span className="source-number">B</span><div><h3>RPC when needed</h3><p>If HyperSync is rate-limited or fails, discovery scans a bounded RPC range and says exactly which blocks were checked.</p></div></div>
        <div><span className="source-number">C</span><div><h3>Partial means partial</h3><p>A capped or fallback response includes <code>complete: false</code> and a coverage line. Older blocks are never presented as checked when they were not.</p></div></div>
      </div>
    </section>
  </main>
}
