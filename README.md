# Keycut Monad

Keycut is being built as an SDK and reference dashboard for discovering existing token approvals and revoking unwanted spend access on Monad.

## Gate 0 proof

These Foundry deployments and approvals are live on Monad Testnet, chain ID 10143. The demo spender labels are user-facing labels only. They do not claim that an address is an AI agent.

- KUSD: [contract](https://testnet.monadscan.com/address/0xA6533b67365CE20F1Bf340dc6eEa7aEf9df1C430), [deployment transaction](https://testnet.monadscan.com/tx/0x1bd4c9dd48abc2a879bec68519476c6cd77e63569e1a6944acc0e3ecd926511f)
- KEUR: [contract](https://testnet.monadscan.com/address/0x1B5A6FfEEC742f47Baf08327cFfEd7a80C5DAcf0), [deployment transaction](https://testnet.monadscan.com/tx/0x3c6afd12ac220dce28c53801468fbd5b701dc4c0f37f14c4b8e517ab596b7fed)
- KUSD → Demo spender Alpha: 1,000 KUSD, [approval transaction](https://testnet.monadscan.com/tx/0x73468e076903db2ab8ed5b344545bfe11ae9baae357a83ab3ca41cac6633689e)
- KUSD → Demo spender Bravo: 350 KUSD, [approval transaction](https://testnet.monadscan.com/tx/0x5decf6d199871276930cb9a4bf7ecd82a0a1f0e4bd18a9e9a8b03895cc8a0cf9)
- KEUR → Demo spender Charlie: 75 KEUR, [approval transaction](https://testnet.monadscan.com/tx/0x64ec075485eb531cce8c7a43112c0e060b7021137d1647f7d1feb7316ce3a3cc)
- KEUR → Demo spender Charlie revoked: [revoke transaction](https://testnet.monadscan.com/tx/0x678f2d4c9e20e9d83f5912e6340da88c482d6254a39c3bc9e7f8d6810f528bde)

The initial seed scan found exactly three nonzero allowances, with complete coverage from block `70696466` through `70698581`. After the revoke, `verify()` read KEUR → Charlie as zero. The latest `discover()` scan returned the two remaining approvals, with complete coverage through block `70700604`. These ranges start at the first demo token deployment and do not claim full wallet history.

The KEUR → Demo spender Charlie approval is the revoke demonstration. `npm run revoke:seed` sends `approve(spender, 0)` from the key in `.env.local`, waits for the receipt, verifies the live allowance is zero, and confirms discovery returns the two remaining approvals. The SDK `revoke()` accepts an injected viem wallet client, so a future browser wallet can provide its own signer. The seed runner exits without broadcasting if the allowance is already zero.

## Run locally

Install Node.js, Foundry, and npm dependencies. Create `.env.local` from `.env.example`, then add a throwaway Monad Testnet key and an Envio API token. `ENVIO_API_TOKEN` is read only by the Node SDK and server-side scripts. Never expose it in a browser or name it `NEXT_PUBLIC_*`.

```sh
cp .env.example .env.local
npm install
npm run build:contracts
npm run simulate:testnet
npm run deploy:testnet
npm run record:deployments
npm run simulate:approvals
npm run approve:testnet
npm run record:approvals
npm run discover:seed
npm run revoke:seed
npm run verify
npm test
npm run explorer-links
```

The deploy command creates new contracts every time it runs. The approval command broadcasts three testnet transactions. The private key and Envio token stay in `.env.local`, which Git ignores.
`npm test` includes read-only Monad Testnet and HyperSync checks. `npm run verify` is the public PASS/FAIL audit. It uses no private key, checks the seeded approval set and both public revoke receipts, and times an empty-wallet scan.

## Hosting

Deploy the Next.js app with Vercel after logging in. Set `ENVIO_API_TOKEN` as a server runtime environment variable. Never use a `NEXT_PUBLIC_` name for it. The `/api/discover` route reads the token server-side.

## Network and dependencies

The Node SDK uses Envio HyperSync on Monad Testnet and Mainnet to scan Approval logs from block 0 by default, then reads current allowances through one RPC multicall. Each scan uses up to two parallel bounded HyperSync ranges, caches the result by chain and wallet for three minutes, and returns an honest partial-coverage report when HyperSync caps a long history. If HyperSync is unavailable or rate-limited, it scans the latest 1,000 blocks through 100-block RPC `eth_getLogs` chunks and reports the exact ranges plus any unchecked history. Use `discover({ owner, source: "rpc", fromBlock })` for a bounded RPC-only scan, or pass `rpcFromBlock` to choose the fallback start. The browser-safe SDK entry point uses RPC and requires `fromBlock`.

The project uses [viem](https://viem.sh/) for EVM clients and Foundry for Solidity builds and broadcasts. No OpenZeppelin code is included in the demo token.

Run `npm run dev` and open `http://localhost:3000`. Paste an address or connect a wallet to open its approval view. Server-side discovery and chain selection are live; user labels and wallet revocation are the next milestone.

The `/api/discover` route keeps HyperSync credentials server-side and limits each IP to 10 scans per minute. The browser receives token and spender data, live allowances, and the SDK coverage report, never the Envio token. Mainnet discovery uses chain ID 143 and `https://rpc.monad.xyz`; the testnet uses chain ID 10143.

## Dashboard source

The Next.js app shell, fonts, CSS design system, and adapted permission-card structure are reused from Keycut for Tempo. Tempo keychain actions, demo-bank material, and TIP-1049 content are excluded. The Monad dashboard uses this SDK for ERC-20 allowance data and revocation.

## AI coding tools

OpenAI Codex assisted with this implementation.
