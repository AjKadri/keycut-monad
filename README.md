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

Install Node.js, Foundry, and npm dependencies. Create `.env.local` from `.env.example` and replace the placeholder with a throwaway Monad Testnet key.

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
npm run explorer-links
```

The deploy command creates new contracts every time it runs. The approval command broadcasts three testnet transactions. The private key stays in `.env.local`, which Git ignores.

## Network and dependencies

Monad Testnet's public RPC currently rejects `eth_getLogs` ranges over 100 blocks. `discover()` uses 100-block chunks and reports the range it actually covered. Full-history scans will need a higher-limit RPC provider or an indexer.

The project uses [viem](https://viem.sh/) for EVM clients and Foundry for Solidity builds and broadcasts. No OpenZeppelin code is included in the demo token.

## Pre-existing code

This first Gate 0 and `discover()` milestone does not copy application source from Keycut for Tempo. The Tempo edition is a separate Colosseum entry. Any reused UI or SDK pieces will be listed here when they are added.

## AI coding tools

OpenAI Codex assisted with this implementation.
