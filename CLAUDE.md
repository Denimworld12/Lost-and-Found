# CLAUDE.md — MilGaya dApp

This file is loaded by Claude Code at the start of every session. Read it fully before doing anything.
The build plan is in `PLAN.md`. The page designs and flows are in `docs/UI_SPEC.md`.

## What we are building

A campus lost-and-found where a smart contract holds each reward in escrow.

- An **owner** (student who lost something) posts an item and locks a reward in ETH.
- A **finder** (another student) claims the item by locking a small stake.
- When the owner confirms the item came back, the finder can withdraw reward + stake.
- If the owner does nothing within the confirm window, the finder can collect after the timeout.
- Either side can raise a dispute; an **arbiter** (campus security wallet) resolves it.
- Only **verified students** (college email via Clerk + linked MetaMask wallet + on-chain whitelist) can post or claim.
- Everyone, signed in or not, can browse items and audit every transaction.

Network: **Ethereum Sepolia testnet** (chain ID `11155111`). All money is free test ETH.

## Tech stack (do not swap without asking)

| Area | Choice |
| --- | --- |
| Package manager | pnpm workspaces (monorepo) |
| Runtime | Node.js 22 LTS or newer (Hardhat 3 requires a recent Node) |
| Contracts | Solidity `^0.8.28`, OpenZeppelin Contracts v5, Hardhat 3 (viem toolbox, `node:test`), Hardhat Ignition for deploys |
| Contract analysis | Slither, Hardhat 3 Solidity tests for fuzzing |
| Frontend | Next.js 16 App Router, React, TypeScript strict, Tailwind CSS v4 |
| Wallet / chain | wagmi + viem + TanStack Query, injected (MetaMask) connector |
| Auth | Clerk (`@clerk/nextjs`): Google sign-in + email code, MetaMask web3 wallet linked to the Clerk user |
| Database | Neon Postgres (free) + Drizzle ORM |
| File storage | Pinata IPFS (`pinata` SDK), images processed with `sharp` |
| Indexing | The Graph (Subgraph Studio), with direct-contract fallback |
| Validation | zod everywhere data crosses a boundary |
| UI primitives | shadcn/ui (Radix) restyled with our tokens, lucide-react icons |
| Visual style | Dark Axelar-style system in `docs/UI_SPEC.md`: Abyss canvas, tonal surfaces, Signal Orange actions, node-dot statuses, Clash Grotesk + Inter + DM Mono |
| Testing | node:test (contracts), Vitest (web unit/API), Playwright (E2E) |
| Hosting | Vercel |
| Monitoring | Sentry (web), Tenderly (contract alerts) |

Before installing anything, check the current major version on npm and the official docs. If an API in this file or `PLAN.md` differs from the current docs, **follow the docs and note the difference in `docs/DECISIONS.md`.**

## Repository layout

```
campus-lost-found/
  CLAUDE.md
  PLAN.md
  package.json              root scripts, pnpm workspaces
  pnpm-workspace.yaml
  .nvmrc                    22
  .env.example              every variable name, no values
  contracts/                Hardhat 3 project
    contracts/LostAndFound.sol
    test/                   TypeScript tests (node:test + viem)
    test-sol/               Solidity tests incl. fuzz
    ignition/modules/LostAndFound.ts
    ignition/parameters/{localhost,sepolia}.json
    scripts/                setup-roles.ts, export-abi.ts, set-config.ts
  subgraph/                 schema.graphql, subgraph.yaml, src/mapping.ts
  apps/web/                 Next.js app
    src/app/                routes (see docs/UI_SPEC.md)
    src/app/api/            route handlers
    src/components/         ui/ (primitives), item/, tx/, layout/, admin/
    src/hooks/              useItem, useItems, useRole, useTxFlow, useLinkedWallet
    src/lib/                chain.ts, wagmi.ts, contract.ts, graph.ts, ipfs.ts, db/, auth.ts, errors.ts, format.ts
    src/proxy.ts            Clerk middleware (Next.js 16 name)
  packages/shared/          abi.ts, addresses.ts, types.ts, constants.ts (generated + shared)
  docs/                     UI_SPEC.md, DECISIONS.md, RUNBOOK.md, report/
  .github/workflows/        ci.yml
```

## Commands

| Task | Command (from repo root) |
| --- | --- |
| Install | `pnpm install` |
| All checks | `pnpm check` (lint + typecheck + tests in every package) |
| Contract compile | `pnpm --filter contracts build` |
| Contract tests | `pnpm --filter contracts test` |
| Coverage | `pnpm --filter contracts coverage` |
| Local chain | `pnpm --filter contracts node` |
| Local deploy | `pnpm --filter contracts deploy:local` |
| Sepolia deploy | `pnpm --filter contracts deploy:sepolia` |
| Export ABI | `pnpm --filter contracts export-abi` |
| Web dev | `pnpm --filter web dev` |
| Web tests | `pnpm --filter web test` |
| E2E | `pnpm --filter web e2e` |
| DB migrations | `pnpm --filter web db:generate` then `pnpm --filter web db:migrate` |
| Subgraph | `pnpm --filter subgraph codegen && pnpm --filter subgraph build` |

Create these scripts if they don't exist yet. Keep this table accurate when scripts change.

## How to work in this repo

1. Work **one phase of PLAN.md at a time**. Do not start the next phase until the current phase's "Done when" list passes.
2. Before coding a phase, re-read its section and the matching part of `docs/UI_SPEC.md`.
3. Tick checkboxes in `PLAN.md` as tasks finish. Record any deviation in `docs/DECISIONS.md` (date, decision, reason).
4. Run `pnpm check` before saying a phase is done. Never claim tests pass without running them.
5. When a step needs the human (creating accounts, pasting keys, funding wallets, clicking in dashboards), **stop and list exactly what they must do**, then wait.
6. Small commits with Conventional Commit messages (`feat(contracts): add dispute flow`).
7. Never run a command that deploys to Sepolia, spends test ETH, or writes to the production database without the human confirming first.

## Hard rules (never break these)

### Secrets and data
- Never commit secrets. `.env*` files (except `.env.example`) are git-ignored. Contract secrets live in the Hardhat keystore.
- Never print private keys or full API keys in logs, errors or chat.
- **Nothing personal goes on-chain or to IPFS**: no names, emails, phone numbers, roll numbers. On-chain = addresses, amounts, statuses, IPFS CIDs, timestamps.
- The email ↔ wallet link lives only in Postgres and Clerk; it is never sent to the client except a user's own data, or to admins.

### Smart contract
- Pull payments only: state changes credit `balances[addr]`; only `withdraw()` sends ETH.
- Checks → effects → interactions in every function. `withdraw()` is `nonReentrant`.
- Use custom errors (`error NotOwner();`), not revert strings.
- No function lets any role move escrowed funds. No `selfdestruct`, no upgrade proxy.
- `receive()` and `fallback()` revert so stray ETH can't be sent by mistake.
- Every state change emits an event.
- Store the stake amount **per item at claim time**; later config changes must not affect existing items.

### Frontend and API
- Every rule enforced in the UI is also enforced in the contract or on the server. Hidden buttons are UX only.
- Every API route: authenticate with Clerk `auth()`, validate input with zod, return typed JSON errors `{ error: { code, message } }`.
- Server re-checks roles from Clerk + on-chain state; never trust role info sent by the client.
- Wei amounts are `bigint` end to end. Never convert wei to `Number`.

## Gotchas you will otherwise miss

**Next.js / React**
- Next.js 16 renamed `middleware.ts` to `proxy.ts`. Clerk's `clerkMiddleware()` goes in `src/proxy.ts`.
- `ClerkProvider` wraps the whole app in `app/layout.tsx`. Wagmi + React Query providers live in a separate `'use client'` `Providers` component inside it.
- Wallet state differs between server and client. Configure wagmi with `ssr: true` and cookie storage, or render wallet-dependent UI only after mount, to avoid hydration errors.
- `JSON.stringify` throws on `bigint`. Serialize wei as decimal strings in API responses and parse back with `BigInt()`.
- Contract timestamps are **seconds**; JS `Date` uses **milliseconds**. Convert with `Number(ts) * 1000` only for display.
- IPFS images: add the Pinata gateway host to `images.remotePatterns` in `next.config.ts`, or `next/image` will fail.
- Vercel serverless request bodies are limited to about 4.5 MB. Compress images on the client before upload and enforce a 2 MB cap on the server.

**Design system**
- Follow `docs/UI_SPEC.md` tokens exactly; no colors, radii or fonts outside it. No `box-shadow` elevation and no gradients except the one hero lattice glow.
- Signal Orange is only for primary actions, the active nav item, focus rings and reward amounts. Node colors are only 8–10 px dots and thin error borders, never fills.
- Text on orange is Abyss `#04070a`, not white (white fails contrast). Small muted text uses Cloud, not Steel.
- Clash Grotesk is not on Google Fonts; load it with `next/font/local` from Fontshare files.
- Uppercase labels via CSS `uppercase` only; keep source strings in sentence case.

**Wallets and chain**
- Compare addresses with `isAddressEqual` (viem) or after `getAddress()`. Never compare raw strings.
- Before any write: check `chainId === 11155111`; otherwise show "Switch to Sepolia" using `switchChain`.
- The wallet connected in wagmi must equal the wallet linked in Clerk. If not, block writes and show "Switch MetaMask to your registered wallet 0x12…ab".
- Always `simulateContract` before `writeContract`, so reverts show as readable messages before MetaMask opens.
- After a write, wait for the receipt (`waitForTransactionReceipt`), then invalidate the affected React Query keys.
- Decode custom errors with the ABI and map each to plain English in `src/lib/errors.ts`. Also handle "User rejected the request" separately (not an error, just a cancelled action).
- On mobile, MetaMask works only inside the MetaMask app's browser. Show an "Open in MetaMask" deep link: `https://metamask.app.link/dapp/<host><path>`.

**Clerk**
- Clerk's **allowlist** (email domain restriction) is a paid feature. We enforce the college domain ourselves: in the `user.created` webhook, and in `proxy.ts` / server helpers as a second check. If the project is on a paid plan, also turn on the dashboard allowlist.
- Put roles in `publicMetadata` (`{ role, wallet, onchainVerified }`) and expose them in the session token via a custom claim (Dashboard → Sessions → customize session token: `{"metadata": "{{user.public_metadata}}"}`). Keep it small; session token custom claims have a size limit.
- Linking MetaMask: enable MetaMask under Web3 in the Clerk dashboard. A user links the wallet to their existing account (Clerk handles the signature nonce). A wallet can belong to only one Clerk user.
- Webhooks must be verified (`verifyWebhook` from `@clerk/nextjs/webhooks`). Local webhook testing needs a public URL (ngrok or similar).
- Clerk **production** instances require a domain you own; `*.vercel.app` only works with a development instance. Production Google sign-in also needs your own Google OAuth client ID/secret.

**Contracts and deployment**
- Hardhat 3 config is ESM (`hardhat.config.ts` with `defineConfig`, `configVariable`), secrets via `npx hardhat keystore set NAME`.
- Ignition remembers deployments in `ignition/deployments/`. Commit that folder (no secrets in it). Changing the contract and redeploying needs a new `--deployment-id` or `--reset`.
- After deployment: grant roles, then move `DEFAULT_ADMIN_ROLE` to the admin address, then renounce it from the deployer. Do it in a script, in that order.
- Etherscan uses one API key across chains (API v2).
- The verifier wallet sends many transactions; use viem's nonce manager and process registrations one at a time so nonces don't collide.
- For demos, the admin can shorten `confirmWindow` (minimum 5 minutes) so the timeout path can be shown live. Never shorten it below that.
- The subgraph can lag the chain by a few blocks. After a confirmed write, update the UI from the receipt and show "Syncing…" until the subgraph catches up.

## Definition of done (every task)

- Types pass, lint passes, tests for the new code exist and pass.
- Loading, empty, error and success states exist for any new UI (see UI_SPEC).
- Works at 360 px wide and on desktop; keyboard focus visible; no console errors.
- Copy follows the voice rules in `docs/UI_SPEC.md`.
- `PLAN.md` boxes ticked; deviations logged in `docs/DECISIONS.md`.
