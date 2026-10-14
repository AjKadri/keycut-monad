# Keycut Monad

Keycut makes every address that can spend from a Monad wallet visible, bounded, and revocable.

Submission README for Metropolis rules v3.0.

## Pitch

See who can spend from a Monad wallet, understand the amount in plain words, and cut unwanted access with the owner’s wallet.

## Problem and intended user

ERC-20 approvals and agent permissions can remain active after a user forgets about them. Wallet owners need a quick way to inspect spend access before it surprises them. Wallet teams and agent builders need a small SDK that can discover permissions without taking custody of user keys.

## How it works

1. Paste an address or use the demo wallet at `/testnet/0x5E9bbd8Ba62bB50e82E9153A3999C6e358E7A748`.
2. Keycut finds Approval and KeycutGrants events, reads current allowance and grant state, and shows the covered block range.
3. The owner connects MetaMask on Monad and signs `approve(spender, 0)` or a grant revoke.
4. Keycut waits for the receipt, reads state again, and links to Monadscan.

User labels are stored in that browser’s local storage. They add personal context and do not verify an agent’s identity.

## Architecture

- SDK: wallet-agnostic `discover()`, `revoke()`, `verify()`, `revokeGrant()`, and RPC-safe grant discovery.
- API route: `/api/discover` runs discovery server-side, keeps the Envio token out of the browser, caches wallet scans for three minutes per instance, and rate-limits each IP.
- Dashboard: Next.js authority view with approval cards, grant cards, coverage states, local user labels, injected-wallet revocation, and Monadscan receipt links.
- KeycutGrants: `grant(agent, token, cap, expiry)`, agent-only `pay(owner, token, to, amount)`, and owner revoke, with GrantCreated, GrantSpent, and GrantRevoked events.
- Data source: Envio HyperSync is tried first. If it is rate-limited or unavailable, discovery uses a bounded RPC range and reports exactly what was checked.

## Tech stack

Next.js 16, React 19, TypeScript, JavaScript SDK modules, viem, Foundry Solidity, Monad Testnet, Monad Mainnet read support, Envio HyperSync, and Vercel.

## Setup and run

```sh
git clone https://github.com/AjKadri/keycut-monad.git && cd keycut-monad
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`, paste a wallet, or use the demo link. The `/developers` page has copyable SDK examples.

For the public read-only audit:

```sh
npm run verify
npm test
npm run typecheck
```

To compile the contract:

```sh
npm run build:contracts
forge test
```

The deployment and seed runners require a funded throwaway Monad Testnet key. They are not needed to inspect the deployed demo. The camera payment command uses the local agent key:

```sh
npm run agent:pay -- 5
npm run agent:pay -- 45
npm run agent:pay -- 5 0xYourVendorAddress
```

The second command should print a reverted transaction and Monadscan link once the demo grant has 40 KUSD remaining. The optional vendor argument overrides `AGENT_VENDOR_ADDRESS`; without one, the agent address is used.

### Environment variables

Copy `.env.example` to `.env.local`. `ENVIO_API_TOKEN` is server-side only. Do not expose it in the browser or rename it to `NEXT_PUBLIC_*`. Private keys are local broadcast inputs and must never be committed or deployed.

- `ENVIO_API_TOKEN`: Envio HyperSync token for the Node SDK and `/api/discover`.
- `MONAD_TESTNET_RPC_URL`, `MONAD_MAINNET_RPC_URL`: RPC endpoints.
- `MONAD_TESTNET_PRIVATE_KEY`: throwaway owner key for seed and revoke scripts.
- `MONAD_AGENT_PRIVATE_KEY`: throwaway agent key for the grant seed and `agent:pay`.
- `MONAD_AGENT_ADDRESS`: public agent address recorded after key generation.
- `AGENT_VENDOR_ADDRESS`: optional default recipient for `agent:pay`; the command also accepts a vendor argument.
- `MONAD_TOKEN_A_ADDRESS`, `MONAD_TOKEN_B_ADDRESS`: seeded KUSD and KEUR addresses.
- `KEYCUT_GRANTS_ADDRESS`: deployed KeycutGrants address.

Vercel needs `ENVIO_API_TOKEN` as a server runtime variable. The browser receives discovery results, never this token or a private key.

## Monad deployment and proof

Monad Testnet is chain ID 10143. Monad Mainnet is chain ID 143 and is enabled for read-only wallet scans. Monad is an EVM network, so the same viem wallet-client flow works for owner-signed revocation. The testnet demo uses fast, inexpensive transactions and tokens with no monetary value.

Demo owner: `0x5E9bbd8Ba62bB50e82E9153A3999C6e358E7A748`

Agent: `0x35303424057e36CfD21D5694EC34Ceeba312Edc4`

Contracts and spenders:

- KUSD: `0xA6533b67365CE20F1Bf340dc6eEa7aEf9df1C430`
- KEUR: `0x1B5A6FfEEC742f47Baf08327cFfEd7a80C5DAcf0`
- KeycutGrants: `0xF2F12BdAe4B0d5f22e281D9743aF398122f399Bf`
- Alpha: `0xa44450c1660A9600336E3581EBF489a3562748c6`
- Bravo: `0x7148acaE93F8CfB377E714FdE4139D4616f0EDCe`
- Charlie: `0x0f8598Dce6BA9ad5DEee6B2fbfbA5389d68C94A9`
- Delta: `0xD85CD56112B8ef8959D822237f63a86caCBd3872`

All links below are Monad Testnet links. The current recording seed is the active state judges should see:

- [KUSD deployment](https://testnet.monadscan.com/tx/0x1bd4c9dd48abc2a879bec68519476c6cd77e63569e1a6944acc0e3ecd926511f)
- [KEUR deployment](https://testnet.monadscan.com/tx/0x3c6afd12ac220dce28c53801468fbd5b701dc4c0f37f14c4b8e517ab596b7fed)
- [Fresh KUSD to Alpha approval](https://testnet.monadscan.com/tx/0xd3dfc53e1759003ac9cb97fbfc835d944ae69dfafa7a913070ad190918e75f44)
- [Recording-cycle KUSD to Bravo approval, later revoked](https://testnet.monadscan.com/tx/0x758396ee377efa679731cf29249129bffb3fefb85c1dc8013744f4f140ff36f9)
- [Active KEUR to Charlie approval](https://testnet.monadscan.com/tx/0x45b54959912520999e9aaaa513fc4f258e68ee659fff3b6681390b6e2943561a)
- [Fresh KUSD to Delta approval, 200 KUSD](https://testnet.monadscan.com/tx/0x9b5a374d62d5029312fed1cc39536ae1f1815e2091c6b79e422ada98e2201e00)
- [KeycutGrants deployment](https://testnet.monadscan.com/tx/0x85e0f389403b9bcef79f5bdadc23c5e7c2ce78d111e41a06008fb2669816f0f9)
- [Current agent funding](https://testnet.monadscan.com/tx/0xb820919e74a9ac682efa02d9fc01511b5abcfd96267b19904f7363168457f7ff)
- [Current owner approval to KeycutGrants](https://testnet.monadscan.com/tx/0xc1278e31586455061ad983f61546dc7d51389844910fba139599f0cdf1ea4d35)
- [Current grant creation, cap 50 KUSD](https://testnet.monadscan.com/tx/0x987521072fe505a8a09ed193d7f8000d64f4d93f25130e2da638755b25a739e9)
- [Current agent pay, 10 KUSD](https://testnet.monadscan.com/tx/0x4a9527f0d56b085225d7c2b825c843dfe491ae9d0511c460403d9a04c3561588)
- [Current agent over-cap pay, 45 KUSD reverted](https://testnet.monadscan.com/tx/0x45578faa1b8a314d6d7479fcb88d161d1b5f3dff04357d6875b826826a4bcda1)

The clean recording cycle used fresh approvals [Alpha](https://testnet.monadscan.com/tx/0xd3dfc53e1759003ac9cb97fbfc835d944ae69dfafa7a913070ad190918e75f44), [Bravo](https://testnet.monadscan.com/tx/0x758396ee377efa679731cf29249129bffb3fefb85c1dc8013744f4f140ff36f9), and [Charlie](https://testnet.monadscan.com/tx/0x45b54959912520999e9aaaa513fc4f258e68ee659fff3b6681390b6e2943561a), then recorded [grant revoke](https://testnet.monadscan.com/tx/0x25ddc22ac1d9b5e8d4595285282196fb14ffc0c644847334b4ed5cdefa73721a), [Bravo revoke](https://testnet.monadscan.com/tx/0x8d4e6657960ffd64f2bc2e07adab6ccf6d60b30f0011c6f4ab00922d797dc377), [agent pay 5](https://testnet.monadscan.com/tx/0xe26488aa84cc12864b9f975aa5f8490c516a39c8572064301b2ef83a9d14a9fe), [over-cap pay 45](https://testnet.monadscan.com/tx/0x24f90a9cacd49bffc5fc273bed51b90b740c2c773677a675bd7e1fc08c09a7c8), and [post-revoke pay 5](https://testnet.monadscan.com/tx/0x450e2665a2d1b55b3d9170e6235023d1eeb2b5a8077f107e1edab25aa4974a2d). The earlier recorded [Charlie revoke](https://testnet.monadscan.com/tx/0x678f2d4c9e20e9d83f5912e6340da88c482d6254a39c3bc9e7f8d6810f528bde) and [Alpha browser-wallet revoke](https://testnet.monadscan.com/tx/0xc29a3485a27cbf9f98131e7c3d082887c4de2e54026d49c63395c9a1b460cd6b) are also checked by receipt block.

Earlier grant-seed receipts remain linked for reproducibility: [initial funding](https://testnet.monadscan.com/tx/0x85a55901234e170cadc7bf12476700400c0e7aab276dcce79830e1999d6c0736), [initial approval](https://testnet.monadscan.com/tx/0x29af20ae86402038957eb96bad6e6427752cf828b65362da1035133f6c76dfe1), [initial grant](https://testnet.monadscan.com/tx/0xa61e0c80d32e0d3537f626cb94b288870894826ada92f1e3d3d32506da672174), [initial pay](https://testnet.monadscan.com/tx/0xb58a43ea3ccc2477683b98d6991b181fe250d819200e7cf5d5dee1f666857de0), [initial over-cap](https://testnet.monadscan.com/tx/0xbd1baa40ca9b9cbc3e77afe30626af20e706034b38c62cc3b3a85700f66199fb), [recording-cycle funding](https://testnet.monadscan.com/tx/0xf39bb7b3efaac74fadaa8d86c933c795fff17768111ebed8c8497e774c805dcf), [recording-cycle approval](https://testnet.monadscan.com/tx/0xb7b77dd6bd88264f93b246411db57c9358c51e663c5cf48576fb21dd5a4169f7), [recording-cycle grant](https://testnet.monadscan.com/tx/0x0977b8ebeb40140875d7eccfa3f7d00878da1fb172d05766fb1fb8e72ecc1ba8), [recording-cycle pay](https://testnet.monadscan.com/tx/0x92c103adea70a1920e7e744510bde2edd284885f46cafed4f9b6214fab35a812), and [recording-cycle over-cap](https://testnet.monadscan.com/tx/0xb9a551af00cec2c05d875544d1c1919d9c5b9ba72c3f9e94a3b9f80af2ff7560).

The current recording seed has active Alpha, Charlie, and Delta approvals plus an active demo grant. Bravo remains revoked. Delta is approved for 200 KUSD. The current grant is active at cap 50 KUSD with 10 KUSD spent. The verifier’s post-revoke payment check uses the isolated Foundry simulation `testPayAfterRevokeReverts`; it does not revoke the live grant.

### Verified source

Verified on Sourcify for Monad Testnet (chain 10143):

- [KUSD (DemoToken)](https://testnet.monadscan.com/address/0xA6533b67365CE20F1Bf340dc6eEa7aEf9df1C430#code)
- [KEUR (DemoToken)](https://testnet.monadscan.com/address/0x1B5A6FfEEC742f47Baf08327cFfEd7a80C5DAcf0#code)
- [KeycutGrants](https://testnet.monadscan.com/address/0xF2F12BdAe4B0d5f22e281D9743aF398122f399Bf#code)

## Links

- Live app: [keycut-monad.vercel.app](https://keycut-monad.vercel.app/)
- Developers: [/developers](https://keycut-monad.vercel.app/developers)
- Demo video: https://youtu.be/Gq7rdqy4yck (local render: `recordings/keycut-monad-demo.mp4`)
- Pitch video: https://youtu.be/X8plE4RPJgo

## Pre-existing code and provenance

The UI shell, design system, fonts, CSS, permission-card structure, and verify-script pattern came from Keycut for Tempo, which was also entered at Colosseum. Everything Monad-specific in this repository was built on 13 October: Monad discovery, HyperSync integration, grants, the API route, wallet revocation, deployment, and live proof.

## AI tools disclosure

Built with Codex and Claude.

## Attributions and license

This project uses [viem](https://viem.sh/), [Next.js](https://nextjs.org/), [Foundry](https://book.getfoundry.sh/), and [Envio HyperSync](https://docs.envio.dev/docs/HyperSync/overview). The repository is released under the [MIT License](./LICENSE).

## Honest limits

- User labels are local annotations, not verified agent identity.
- Revoking access cannot stop a payment that was ordered before the revoke transaction was confirmed.
- A grant expiry and cap constrain future `pay()` calls; earlier successful payments remain recorded in `spent`.
- Testnet tokens have no monetary value.
- A capped or RPC-fallback scan reports only the ranges it actually checked. Serverless cache and rate limits are per instance.
