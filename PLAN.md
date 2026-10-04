# PLAN.md — Build and deployment plan

Work through the phases in order. Each phase has tasks, exact commands where they matter, and a "Done when" list.
Rules, stack and gotchas are in `CLAUDE.md`. Screens and flows are in `docs/UI_SPEC.md`.

## How to drive this with Claude Code

Start Claude Code in the empty repo folder with these three files in place, then use one prompt per phase:

```
Read CLAUDE.md, PLAN.md and docs/UI_SPEC.md. Use plan mode first.
Execute Phase <N> only. List anything you need from me before starting.
When done, run the "Done when" checks and show me the results.
```

If a session gets long, start a fresh one with the same prompt; the files carry the context.

## Phase overview

| Phase | Result | Who |
| --- | --- | --- |
| 0 | All accounts, keys and test wallets ready | Human (Claude Code gives the checklist) |
| 1 | Monorepo scaffold, tooling, CI skeleton | Claude Code |
| 2 | `LostAndFound.sol` written | Claude Code |
| 3 | Contract tests, fuzzing, Slither, coverage | Claude Code |
| 4 | Local + Sepolia deployment, roles, verification | Claude Code + human confirms |
| 5 | Subgraph on The Graph Studio | Claude Code + human deploys key |
| 6 | Web foundation: tokens, layout, providers, read-only browsing | Claude Code |
| 7 | Clerk auth, onboarding, on-chain student verification | Claude Code + human dashboard setup |
| 8 | Core flows: post, claim, confirm, reject, dispute, timeout, withdraw | Claude Code |
| 9 | Admin console | Claude Code |
| 10 | E2E tests, CI/CD, monitoring | Claude Code |
| 11 | Production deployment and smoke test | Claude Code + human confirms |
| 12 | Docs, demo script, report material | Claude Code |

---

## Phase 0 — Accounts, keys and wallets (human)

All of these have free tiers. Claude Code: print this list as a checklist and wait until the human confirms each item.

- [ ] **Node.js 22 LTS+** and **pnpm** installed (`corepack enable && corepack prepare pnpm@latest --activate`)
- [ ] **Git + GitHub** repo created (empty)
- [ ] **MetaMask** installed, with **5 accounts** named: Deployer, Verifier, Arbiter, Student A, Student B
- [ ] **Sepolia ETH** in each account from a faucet (Alchemy, Google Cloud Web3, QuickNode). Deployer needs the most (≈0.1 ETH); others ≈0.05 each
- [ ] **Alchemy**: app on Ethereum Sepolia → copy the HTTPS RPC URL. Create a second key for the browser and restrict it to your site's domains
- [ ] **Etherscan**: account → API key
- [ ] **Clerk**: application created with Google + Email code enabled, MetaMask enabled under Web3. Copy publishable key + secret key
- [ ] **Neon**: project + database → copy the pooled connection string
- [ ] **Pinata**: API key (JWT) with pinning permissions + a dedicated gateway domain
- [ ] **The Graph Studio**: account (sign in with wallet) → create subgraph named `campus-lost-found` → copy deploy key
- [ ] **Vercel**: account linked to GitHub
- [ ] **Sentry** (optional): Next.js project → DSN
- [ ] **Tenderly** (optional): account for contract alerts
- [ ] Decide the **college email domain** (e.g. `yourcollege.edu.in`) and the **admin address** (a Safe multi-sig on Sepolia from app.safe.global, or the Deployer for a simple demo)

Never paste private keys into chat with Claude Code. Enter them only through `npx hardhat keystore set` and `vercel env add` prompts, or into `.env.local` yourself.

**Done when:** every box above is ticked.

---

## Phase 1 — Monorepo scaffold

- [x] `git init`, add `.gitignore` (node_modules, .next, .env*, !.env.example, coverage, artifacts, cache, typechain, subgraph/build, subgraph/generated, .vercel)
- [x] Root `package.json` with `"private": true`, `packageManager` pinned, scripts: `check`, `lint`, `typecheck`, `test`, `format`
- [x] `pnpm-workspace.yaml` listing `contracts`, `subgraph`, `apps/*`, `packages/*`
- [x] `.nvmrc` = `22`, `.editorconfig`, Prettier config (+ `prettier-plugin-solidity`, `prettier-plugin-tailwindcss`)
- [x] Contracts project: `mkdir contracts && cd contracts && npx hardhat --init` → choose the TypeScript + viem + node:test template. Make sure `"type": "module"`
- [x] Web app: `pnpm create next-app@latest apps/web --ts --tailwind --eslint --app --src-dir --import-alias "@/*"`
- [x] `packages/shared` with `package.json` (`name: @clf/shared`), `src/index.ts`, `tsconfig.json`
- [x] `subgraph/` placeholder (filled in Phase 5)
- [x] `docs/` with `DECISIONS.md`, `RUNBOOK.md`, `UI_SPEC.md`
- [x] `.env.example` with every variable from the "Environment variables" table at the end of this file
- [x] `.github/workflows/ci.yml` skeleton: checkout → pnpm setup → Node 22 → `pnpm install --frozen-lockfile` → `pnpm check`
- [x] Husky + lint-staged: format and lint staged files on commit

**Done when:** `pnpm install && pnpm check` passes on a clean clone; first commit pushed; CI green.

---

## Phase 2 — Smart contract

File: `contracts/contracts/LostAndFound.sol`. Inherit OpenZeppelin `AccessControl`, `ReentrancyGuard`, `Pausable`.

### Types and storage

```solidity
enum Status { None, Open, Claimed, Disputed, Completed, Cancelled }
// None = 0 so a missing item is detectable (items[id].status == Status.None)

struct Item {
    address owner;        // slot 1 (20 bytes) + status (1) + createdAt (8) pack together
    Status  status;
    uint64  createdAt;
    address finder;       // slot 2 + claimedAt (8) + claimWindow (4)
    uint64  claimedAt;
    uint32  claimWindow;  // confirmWindow locked at claim time
    uint128 reward;       // slot 3: reward + stake pack together
    uint128 stake;        // stake locked at claim time
    string  metadataCID;  // IPFS CID of the metadata JSON (max 100 bytes)
}
```

| Storage | Type | Notes |
| --- | --- | --- |
| `items` | `mapping(uint256 => Item)` | IDs start at 1 |
| `itemCount` | `uint256` | Last assigned ID |
| `balances` | `mapping(address => uint256)` | Withdrawable credit (pull payments) |
| `isVerified` | `mapping(address => bool)` | Student whitelist |
| `totalEscrowed` | `uint256` | Sum of rewards + stakes in non-final items |
| `totalCredited` | `uint256` | Sum of all `balances` |
| `minReward` | `uint256` | Default `0.001 ether` |
| `claimStake` | `uint256` | Default `0.0005 ether` |
| `confirmWindow` | `uint64` | Default `3 days`; allowed range 5 minutes to 14 days |

Roles: `DEFAULT_ADMIN_ROLE`, `VERIFIER_ROLE`, `ARBITER_ROLE` (bytes32 constants).

### Constructor

`constructor(address admin, address verifier, address arbiter, uint256 minReward_, uint256 claimStake_, uint64 confirmWindow_)` — grants the three roles, validates and sets config. Zero addresses revert.

### Functions

| Function | Access | Requires | Effects | Event |
| --- | --- | --- | --- | --- |
| `postItem(string cid) payable` | verified, not paused | `msg.value >= minReward`, `msg.value <= type(uint128).max`, `1 <= bytes(cid).length <= 100` | new item Open; `totalEscrowed += value` | `ItemPosted(id, owner, reward, cid)` |
| `claimItem(uint256 id) payable` | verified, not paused | status Open, caller ≠ owner, `msg.value == claimStake` | finder, stake, claimedAt, claimWindow set; status Claimed; `totalEscrowed += value` | `ItemClaimed(id, finder, stake)` |
| `confirmReturn(uint256 id)` | owner | status Claimed | status Completed; credit finder reward + stake | `ReturnConfirmed(id, finder, amount)` |
| `rejectClaim(uint256 id)` | owner | status Claimed, within window | credit owner the stake; clear finder/stake/claimedAt/claimWindow; status Open | `ClaimRejected(id, finder, stakeToOwner)` |
| `raiseDispute(uint256 id)` | owner or finder | status Claimed, within window | status Disputed | `DisputeRaised(id, by)` |
| `claimAfterTimeout(uint256 id)` | finder | status Claimed, window passed | status Completed; credit finder reward + stake | `TimeoutClaimed(id, finder, amount)` |
| `resolveDispute(uint256 id, bool finderWins)` | arbiter | status Disputed | finderWins: Completed, credit finder reward + stake. Else: credit owner stake, reopen item as Open | `DisputeResolved(id, finderWins, arbiter)` |
| `cancelItem(uint256 id)` | owner | status Open | status Cancelled; credit owner reward | `ItemCancelled(id)` |
| `withdraw()` | anyone | `balances[msg.sender] > 0` | zero balance, then send with `call`; revert if send fails | `Withdrawn(to, amount)` |
| `verifyStudent(address s)` / `verifyStudents(address[] s)` | verifier | `s != address(0)` | `isVerified = true` | `StudentVerified(s)` |
| `revokeStudent(address s)` | verifier | — | `isVerified = false` (existing items still finish) | `StudentRevoked(s)` |
| `setConfig(uint256 minReward, uint256 claimStake, uint64 confirmWindow)` | admin | bounds checked | updates config (new claims only) | `ConfigUpdated(...)` |
| `pause()` / `unpause()` | admin | — | blocks `postItem` and `claimItem` only | OZ `Paused` / `Unpaused` |
| `getItem(uint256 id) view returns (Item)` | anyone | item exists | — | — |
| `withinWindow(uint256 id) view returns (bool)` | anyone | — | `block.timestamp <= claimedAt + claimWindow` | — |

"Within window" means `block.timestamp <= claimedAt + claimWindow` (the item's window, locked at claim time); "window passed" means strictly greater.
Every credit updates `totalEscrowed -= x; totalCredited += x`. `withdraw` does `totalCredited -= amount`.

### Custom errors

`NotVerified()`, `NotOwner()`, `NotFinder()`, `NotParty()`, `ItemNotFound()`, `WrongStatus(Status expected, Status actual)`, `RewardTooLow()`, `WrongStake()`, `OwnerCannotClaim()`, `WindowOpen()`, `WindowClosed()`, `InvalidCID()`, `NothingToWithdraw()`, `TransferFailed()`, `InvalidConfig()`, `ZeroAddress()`, `DirectPaymentNotAllowed()`.

### Events (index the IDs and addresses)

`ItemPosted`, `ItemClaimed`, `ReturnConfirmed`, `ClaimRejected`, `DisputeRaised`, `DisputeResolved`, `TimeoutClaimed`, `ItemCancelled`, `Withdrawn`, `StudentVerified`, `StudentRevoked`, `ConfigUpdated`.

### Other requirements

- NatSpec (`@notice`, `@param`, `@dev`) on every external function; it shows on Etherscan and doubles as viva notes.
- `receive()` and `fallback()` revert with `DirectPaymentNotAllowed()`.
- Modifiers: `onlyVerified`, `itemExists(id)`; role checks via `onlyRole`.
- Compiler: optimizer on, 200 runs; `evmVersion` default for Hardhat 3.

**Done when:** contract compiles with zero warnings, `export-abi` script writes `packages/shared/src/abi.ts` (as a `const` array so viem infers types).

---

## Phase 3 — Contract tests and security

### TypeScript tests (`contracts/test/LostAndFound.test.ts`, node:test + viem)

Use Hardhat's network helpers to move time (`networkHelpers.time.increase`). Cover at least:

- [x] Deployment: roles assigned, config set, zero-address and bad-config reverts
- [x] Verification: only verifier can verify/revoke; batch verify; events
- [x] `postItem`: unverified reverts; paused reverts; reward too low; empty and 101-byte CID; ID increments; escrow totals; event args
- [x] `claimItem`: wrong status; owner claiming own item; wrong stake; paused; event
- [x] `confirmReturn`: only owner; only Claimed; finder credited reward + stake
- [x] `rejectClaim`: only owner; window closed reverts; stake to owner; item back to Open with finder cleared; a second finder can then claim
- [x] `raiseDispute`: owner and finder allowed, others revert; window closed reverts
- [x] `claimAfterTimeout`: before window reverts (`WindowOpen`); exactly at boundary still reverts; after passes
- [x] `resolveDispute`: only arbiter; both outcomes; owner-wins reopens item
- [x] `cancelItem`: only Open; reward credited to owner
- [x] `withdraw`: zero balance reverts; balance zeroed before send; reentrancy attempt via a malicious receiver contract (`test/mocks/Reenter.sol`) fails
- [x] Config change after a claim does not change that item's stake
- [x] `receive`/`fallback` revert
- [x] Invariant check helper run after every test: `contract balance >= totalEscrowed + totalCredited`

### Solidity tests (`contracts/test-sol/`)

- [x] Fuzz `postItem` reward amounts and `claimItem` stake values
- [x] Fuzz the time offset for `claimAfterTimeout` around the window edge
- [x] Invariant: sum of balances equals `totalCredited`

### Tooling

- [x] Coverage script; target **100% lines and branches** for `LostAndFound.sol`
- [x] Gas report enabled in CI output
- [x] Slither: `pip install slither-analyzer` then `slither contracts/ --hardhat-ignore-compile` (compile first). Fix all High/Medium, document accepted Low/Informational in `docs/DECISIONS.md`
- [x] Add a CI job that runs Slither with `--fail-high`

**Done when:** all tests pass, coverage 100% lines + branches, Slither has no High/Medium, gas report saved to `docs/report/gas.md`.

---

## Phase 4 — Deployment (local, then Sepolia)

### Files

- `ignition/modules/LostAndFound.ts`: deploys with parameters `admin`, `verifier`, `arbiter`, `minReward`, `claimStake`, `confirmWindow`
- `ignition/parameters/localhost.json` and `ignition/parameters/sepolia.json`
- `scripts/setup-roles.ts`: verifies role holders on the deployed contract; if `admin` differs from the deployer, grants `DEFAULT_ADMIN_ROLE` to `admin` then renounces it from the deployer (check before each step so the script is safe to re-run)
- `scripts/export-abi.ts`: writes ABI to `packages/shared/src/abi.ts`, and address + deploy block per chain to `packages/shared/src/addresses.ts`
- `scripts/seed-local.ts`: verifies 2 local accounts and posts 3 demo items (local only, refuses to run on Sepolia)

### `hardhat.config.ts` network section (Hardhat 3 style)

```ts
networks: {
  sepolia: {
    type: "http",
    chainType: "l1",
    url: configVariable("SEPOLIA_RPC_URL"),
    accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
  },
},
verify: { etherscan: { apiKey: configVariable("ETHERSCAN_API_KEY") } },
```

### Local run (Claude Code can do this alone)

```bash
cd contracts
pnpm hardhat node                                   # terminal 1, keep running
pnpm hardhat ignition deploy ignition/modules/LostAndFound.ts \
  --network localhost --parameters ignition/parameters/localhost.json   # terminal 2
pnpm hardhat run scripts/seed-local.ts --network localhost
pnpm export-abi
```

Import one of the printed Hardhat accounts into MetaMask, add network "Localhost 8545" (chain ID 31337) to test the UI locally. Reset MetaMask activity (Settings → Advanced → Clear activity) whenever the local node restarts, or nonces break.

### Sepolia run (human types secrets; Claude Code asks before running)

```bash
cd contracts
pnpm hardhat keystore set SEPOLIA_RPC_URL        # paste Alchemy URL when prompted
pnpm hardhat keystore set SEPOLIA_PRIVATE_KEY    # Deployer account private key
pnpm hardhat keystore set ETHERSCAN_API_KEY

# fill ignition/parameters/sepolia.json with real admin/verifier/arbiter addresses
pnpm hardhat ignition deploy ignition/modules/LostAndFound.ts \
  --network sepolia \
  --parameters ignition/parameters/sepolia.json \
  --deployment-id sepolia-v1 \
  --verify

pnpm hardhat run scripts/setup-roles.ts --network sepolia
pnpm export-abi
```

- Record the address, deploy transaction and block number in `docs/RUNBOOK.md`.
- If verification fails (Etherscan sometimes lags), rerun: `pnpm hardhat ignition verify sepolia-v1`.
- Contract changes later → new deployment id (`sepolia-v2`), pause the old contract, update addresses and subgraph.
- Deploy a **second, separate contract** with `--deployment-id sepolia-staging-v1` for the staging environment.

**Done when:** contract verified on Sepolia Etherscan (source readable), roles correct (check with `hasRole` on Etherscan's Read tab), `packages/shared` contains the addresses, a manual post → claim → confirm → withdraw on Etherscan's Write tab works with two test wallets.

---

## Phase 5 — Subgraph

```bash
pnpm add -g @graphprotocol/graph-cli
cd subgraph
graph init --studio campus-lost-found     # choose ethereum, network sepolia, paste contract address, use the ABI from contracts/artifacts
```

### `schema.graphql`

```graphql
enum ItemStatus { Open Claimed Disputed Completed Cancelled }

type Item @entity(immutable: false) {
  id: ID!                 # item id as string
  itemId: BigInt!
  owner: Bytes!
  finder: Bytes
  reward: BigInt!
  stake: BigInt!
  metadataCID: String!
  status: ItemStatus!
  createdAt: BigInt!
  claimedAt: BigInt
  updatedAt: BigInt!
  events: [ItemEvent!]! @derivedFrom(field: "item")
}

type ItemEvent @entity(immutable: true) {
  id: Bytes!              # txHash + logIndex
  item: Item!
  kind: String!           # Posted, Claimed, Confirmed, Rejected, Disputed, Resolved, TimeoutClaimed, Cancelled
  actor: Bytes!
  amount: BigInt
  txHash: Bytes!
  timestamp: BigInt!
}

type Stats @entity(immutable: false) {
  id: ID!                 # "global"
  itemsPosted: BigInt!
  itemsReturned: BigInt!
  totalRewardsPaid: BigInt!
  openItems: BigInt!
}
```

- [ ] Handler per event in `src/mapping.ts`, updating `Item`, adding an `ItemEvent`, updating `Stats`
- [ ] `startBlock` in `subgraph.yaml` = deploy block (otherwise indexing takes hours)
- [ ] Copy `subgraph.yaml` to a staging variant pointing at the staging contract
- [ ] Deploy: `graph codegen && graph build && graph auth <DEPLOY_KEY> && graph deploy campus-lost-found` (version label `v0.1.0`, bump each deploy)
- [ ] Copy the Studio query URL into `NEXT_PUBLIC_SUBGRAPH_URL`

**Done when:** querying `{ items(first: 5) { id status reward } }` in Studio returns the items created in Phase 4.

---

## Phase 6 — Web foundation (read-only app)

### Install

```bash
cd apps/web
pnpm add wagmi viem @tanstack/react-query zod @clf/shared@workspace:* graphql-request lucide-react clsx tailwind-merge sonner date-fns
pnpm dlx shadcn@latest init            # then add: button dialog sheet tabs badge input textarea select tooltip dropdown-menu skeleton alert-dialog
```

### Tasks

- [x] Design tokens in `src/app/globals.css` (Tailwind v4 `@theme`) exactly as `docs/UI_SPEC.md` → "Design tokens" (Axelar-style dark theme). Inter and DM Mono via `next/font/google`; Clash Grotesk woff2 files from Fontshare into `src/fonts/` via `next/font/local` (human downloads them if the network blocks it)
- [x] Hero lattice SVG component (`src/components/home/Lattice.tsx`): deterministic diamond grid, item dots placed by item id, hover/focus tooltips
- [x] `src/lib/chain.ts`: Sepolia (and Hardhat local when `NEXT_PUBLIC_CHAIN_ID=31337`), explorer URL builders `txUrl(hash)`, `addressUrl(addr)`
- [x] `src/lib/wagmi.ts`: `createConfig` with the selected chain, `injected()` connector, HTTP transport from `NEXT_PUBLIC_SEPOLIA_RPC_URL`, `ssr: true`, cookie storage
- [x] `src/components/providers.tsx` (`'use client'`): `WagmiProvider` + `QueryClientProvider` + `Toaster`
- [x] `src/lib/contract.ts`: `{ address, abi }` from `@clf/shared`, typed read helpers
- [x] `src/lib/graph.ts`: typed queries `getItems(filters, cursor)`, `getItem(id)`, `getItemsByUser(addr)`, `getStats()`
- [x] Fallback (today the only path; Phase 5 not built yet, see `docs/DECISIONS.md`): if the subgraph errors or is more than 50 blocks behind (`_meta { block { number } }`), read `itemCount` + `getItem` via viem `multicall` (latest 50 items)
- [x] `src/lib/ipfs.ts`: `ipfsUrl(cid)` using the Pinata gateway; `fetchMetadata(cid)` with zod schema + React Query cache (`staleTime: Infinity`, CIDs never change)
- [x] `src/lib/format.ts`: `formatEth(wei)` (max 4 decimals, "0.01 ETH"), `shortAddress`, relative time, countdown
- [x] Layout shell: header, mobile bottom nav, footer, skip link (UI_SPEC → "App shell")
- [x] Pages working **without login**: `/`, `/items`, `/items/[id]` (no action buttons yet), `/how-it-works`, `/transparency`, `not-found`, `error`
- [x] `next.config.ts`: `images.remotePatterns` for the Pinata gateway; security headers (CSP allowing Clerk, Alchemy, Pinata, subgraph; `X-Frame-Options: DENY`; `Referrer-Policy: strict-origin-when-cross-origin`)

**Done when:** a logged-out visitor can browse, filter and open items from the Sepolia contract on desktop and a 360 px phone; Lighthouse accessibility ≥ 95.

---

## Phase 7 — Authentication with Clerk + on-chain verification

### Identity model

| Layer | Proves | Source of truth |
| --- | --- | --- |
| Clerk account | Person controls a college Google account / email | Clerk |
| Linked MetaMask wallet | Same person controls this wallet | Clerk `web3Wallets` (signature verified by Clerk) |
| On-chain whitelist | Contract will accept this wallet's posts and claims | `isVerified[address]` |
| Role | student / arbiter / admin powers in the app | Clerk `publicMetadata.role`, mirrored by on-chain roles |

### Clerk dashboard setup (human; Claude Code prints these steps)

1. **User & authentication**: enable Google and Email (verification code). Disable password. Make email required.
2. **Web3**: enable MetaMask.
3. **Sessions → Customize session token**: `{ "metadata": "{{user.public_metadata}}" }`
4. **Webhooks**: endpoint `https://<your-domain>/api/webhooks/clerk`, events `user.created`, `user.updated`, `user.deleted`. Copy the signing secret.
5. **Paths**: sign-in `/sign-in`, sign-up `/sign-up`, after sign-up `/onboarding`.
6. **Customization**: paste the theme values from UI_SPEC → "Clerk theming" (or pass them via `appearance` in code).
7. **Restrictions**: if on a paid plan, add the college domain to the allowlist. On the free plan our code enforces it.
8. Set `publicMetadata.role = "admin"` / `"arbiter"` on the team's own users from the Users page.

### Install

```bash
cd apps/web
pnpm add @clerk/nextjs @clerk/themes drizzle-orm @neondatabase/serverless pinata sharp
pnpm add -D drizzle-kit
```

### Database (Drizzle, `src/lib/db/schema.ts`)

| Table | Columns | Notes |
| --- | --- | --- |
| `students` | `clerk_user_id` PK, `email` unique, `wallet_address` unique (lowercase), `status` enum (`pending`, `verified`, `failed`, `revoked`), `verify_tx_hash`, `error`, `created_at`, `verified_at`, `revoked_at` | One wallet per student |
| `uploads` | `id` PK, `clerk_user_id`, `cid`, `bytes`, `created_at` | Rate limiting + abuse tracing |
| `admin_actions` | `id` PK, `actor_clerk_id`, `action`, `target`, `tx_hash`, `note`, `created_at` | Audit log |
| `contact_reveals` | `id` PK, `item_id`, `viewer_clerk_id`, `created_at` | Logs who saw whose contact |

```bash
pnpm db:generate     # drizzle-kit generate
pnpm db:migrate      # drizzle-kit migrate (uses DATABASE_URL)
```

### Route protection (`src/proxy.ts`)

| Route | Rule |
| --- | --- |
| `/`, `/items`, `/items/[id]`, `/how-it-works`, `/transparency`, `/sign-in/*`, `/sign-up/*`, `/not-eligible` | Public |
| `/onboarding` | Signed in |
| `/post`, `/me` | Signed in + college domain + `metadata.onchainVerified === true`; otherwise redirect to `/onboarding` |
| `/admin/*` | `metadata.role` is `admin` or `arbiter` (arbiter sees Disputes only) |
| `/api/webhooks/*` | Public, verified by signature |
| other `/api/*` | Signed in; each handler re-checks its own rules |

Signed-in users whose primary email domain ≠ `ALLOWED_EMAIL_DOMAIN` → redirect to `/not-eligible` (page offers sign-out).

### Server helpers (`src/lib/auth.ts`)

- `requireUser()` → Clerk user or 401
- `requireCollegeUser()` → also checks the **verified** primary email ends with `@${ALLOWED_EMAIL_DOMAIN}` (exact suffix match, lowercase; reject subdomains unless configured)
- `requireVerifiedStudent()` → also checks `students.status = 'verified'` **and** `isVerified(wallet)` on-chain
- `requireRole('admin' | 'arbiter')`
- `getLinkedWallet(user)` → the single verified Clerk web3 wallet, checksummed

### Verifier service (`src/lib/verifier.ts`, server only)

- viem `walletClient` from `VERIFIER_PRIVATE_KEY` with `nonceManager`
- `verifyOnChain(address)`: skip if already verified; simulate → write `verifyStudent` → wait for receipt (timeout 90 s) → return tx hash
- Run requests one at a time (a Postgres advisory lock `pg_advisory_lock(42)` around the send)
- `revokeOnChain(address)` for admin use
- Never import this file from client code (add `import 'server-only'`)

### API routes

| Route | Method | Auth | Does |
| --- | --- | --- | --- |
| `/api/webhooks/clerk` | POST | Clerk signature | `user.created`: if email domain not allowed → `clerkClient.users.deleteUser` (or set `metadata.ineligible = true` if you prefer a friendly page); `user.deleted`: mark student revoked and call `revokeOnChain` |
| `/api/onboarding/status` | GET | signed in | Returns `{ emailOk, walletLinked, wallet, studentStatus, onchainVerified, hasGas }` |
| `/api/onboarding/verify` | POST | college user + linked wallet | Upserts `students` (pending) → `verifyOnChain` → status verified → sets Clerk `publicMetadata { role: 'student', wallet, onchainVerified: true }`. Idempotent: calling twice is safe |
| `/api/upload` | POST multipart | verified student | Validates (JPEG/PNG/WebP/HEIC, ≤ 2 MB, ≤ 5 uploads/hour), `sharp` → rotate, resize max 1600 px, WebP q80, strip metadata → pin image → pin metadata JSON → returns `{ cid, imageCid }` |
| `/api/items/[id]/contact` | GET | verified student | Allowed only if caller's wallet is the item's owner or finder and status is Claimed/Disputed/Completed; returns the other party's college email; logs to `contact_reveals` |
| `/api/admin/students` | GET | admin | Paginated list with search by email/wallet |
| `/api/admin/students/[id]/revoke` | POST | admin | `revokeOnChain`, update DB + Clerk metadata, log action |
| `/api/admin/students/[id]/retry` | POST | admin | Retry a failed verification |

Every route: zod-validate input, return `{ error: { code, message } }` on failure with correct HTTP status, never leak stack traces.

### Onboarding page (`/onboarding`) — see UI_SPEC "Onboarding"

Stepper driven by `/api/onboarding/status`:

1. **College account** — done automatically if the email domain is right
2. **Connect MetaMask** — wagmi connect (installs prompt if no `window.ethereum`)
3. **Link wallet to your account** — Clerk `user.createWeb3Wallet({ web3Wallet: address })` then `prepareVerification({ strategy: 'web3_metamask_signature' })` → MetaMask signature → `attemptVerification`. (Or use `<UserProfile />`'s Web3 section; the custom flow gives better UX.) If the wallet is already linked to another account, show that error plainly
4. **Get test ETH** — show balance; if < 0.002 ETH, link to faucets and a "Check again" button
5. **Activate on the blockchain** — POST `/api/onboarding/verify`, show pending with Etherscan link, then success → "Report a lost item" / "Browse items"

**Done when:** a new user with a college Google account reaches "verified" end to end on Sepolia; a non-college email lands on `/not-eligible`; a second account cannot link an already-linked wallet; refreshing mid-onboarding resumes at the right step.

---

## Phase 8 — Core flows

### `useTxFlow` hook (one path for every write)

States: `idle → checking → awaitingWallet → pending → confirmed | failed | cancelled`

1. `checking`: wallet connected? chain is Sepolia (else `switchChain`)? connected wallet equals Clerk-linked wallet? enough ETH for value + gas (`estimateContractGas` × gas price + value)?
2. `simulateContract` → on revert, map the custom error to copy (table below), state `failed`, no MetaMask popup
3. `awaitingWallet`: `writeContract`; user rejection → `cancelled` (neutral toast, not red)
4. `pending`: show hash + Etherscan link; `waitForTransactionReceipt`
5. `confirmed`: success toast with the action's past-tense name; invalidate query keys `['item', id]`, `['items']`, `['me', address]`, `['balance', address]`
6. Receipt `status: 'reverted'` → `failed` with generic copy + Etherscan link

### Error copy (`src/lib/errors.ts`)

| Error | Message shown |
| --- | --- |
| `NotVerified` | Finish activating your account before posting or claiming. |
| `NotOwner` | Only the person who posted this item can do that. |
| `NotFinder` | Only the student who claimed this item can do that. |
| `NotParty` | Only the owner or finder can raise a dispute. |
| `WrongStatus` | This item changed status. Refresh to see the latest. |
| `RewardTooLow` | The reward must be at least {minReward} ETH. |
| `WrongStake` | The claim deposit changed. Refresh and try again. |
| `OwnerCannotClaim` | You can't claim your own item. |
| `WindowOpen` | You can collect after {time} if the owner hasn't responded. |
| `WindowClosed` | The response window has ended for this claim. |
| `NothingToWithdraw` | You have no funds to withdraw. |
| `EnforcedPause` | Posting and claiming are paused by the admins right now. |
| insufficient funds | Not enough Sepolia ETH. Get free test ETH from a faucet. |
| user rejected | Cancelled in MetaMask. |

### Flows to build (screens in UI_SPEC)

- [ ] **Post** (`/post`): 4-step form (details → photo → reward → review). Upload on step 4 submit, then `postItem(cid)` with `value = parseEther(reward)`. Keep the form in memory if the transaction fails so nothing is retyped. Redirect to the new item page using the `ItemPosted` event's `id` from the receipt logs (`parseEventLogs`)
- [ ] **Claim** (item page): confirmation dialog explaining the stake and that it's lost if the claim is rejected → `claimItem(id)` with `value = claimStake` read from the contract at that moment
- [ ] **Confirm return** (owner): dialog "Did you get it back?" → `confirmReturn`
- [ ] **Reject claim** (owner, within window): dialog warns the finder loses the deposit → `rejectClaim`
- [ ] **Dispute** (owner or finder, within window): dialog with what happens next → `raiseDispute`
- [ ] **Collect after timeout** (finder, window passed): `claimAfterTimeout`
- [ ] **Cancel** (owner, Open): `cancelItem`
- [ ] **Withdraw** (`/me` and header balance chip): `withdraw`
- [ ] **Contact reveal**: after a claim, owner and finder see "Contact {email}" via `/api/items/[id]/contact`
- [ ] **Countdown** on Claimed items: time left in the confirm window, computed from `claimedAt + claimWindow` vs the latest block timestamp (not the device clock)
- [ ] **Live updates**: `useWatchContractEvent` on the item page for that item's events → invalidate queries
- [ ] **/me dashboard**: tabs "Needs your action", "Items I lost", "Items I found", "History"; withdrawable balance card

**Done when:** all flows pass manually on Sepolia with Student A and Student B, including reject → reclaim, dispute both outcomes, and timeout (admin sets `confirmWindow` to 5 minutes before the claim is made, then restores it).

---

## Phase 9 — Admin console (`/admin`)

- [ ] **Overview**: contract address, paused state, config values, totals from `Stats`, verifier wallet balance (warn below 0.02 ETH)
- [ ] **Students**: table (email, wallet, status, verified date), search, revoke, retry failed
- [ ] **Disputes** (admin + arbiter): list of Disputed items with both parties' emails, item metadata, event history; buttons "Pay the finder" / "Return to owner" → `resolveDispute`, each with a required note saved to `admin_actions`
- [ ] **Settings** (admin): edit `minReward`, `claimStake`, `confirmWindow` with bounds shown → `setConfig`; Pause / Unpause with a typed confirmation ("PAUSE")
- [ ] **Audit log**: `admin_actions` newest first
- [ ] Every admin write goes through `useTxFlow`; the connected wallet must hold the needed on-chain role (check `hasRole` and explain if not)
- [ ] If the admin role is a Safe multi-sig, show "Propose in Safe" with the encoded calldata instead of a direct write

**Done when:** an arbiter resolves a dispute end to end, admin pause blocks posting in the UI and on-chain, all actions appear in the audit log.

---

## Phase 10 — Testing, CI/CD, monitoring

### Web tests

- [ ] Vitest unit tests: `format.ts`, `errors.ts`, zod schemas, `auth.ts` domain check (edge cases: uppercase, subdomain, `+` addresses), upload validation
- [ ] API route tests with Clerk and viem mocked: onboarding verify is idempotent; contact reveal refuses strangers; upload rejects oversize/wrong type/rate limit
- [ ] Playwright E2E against local Hardhat node + seeded data: browse logged out; post → claim → confirm → withdraw. Use a test-only injected wallet (Synpress or a mock EIP-1193 provider backed by a Hardhat account) and Clerk testing tokens (`@clerk/testing`)

### CI (`.github/workflows/ci.yml`)

Jobs on every pull request: `lint-typecheck`, `contracts` (tests, coverage, gas), `slither`, `web` (unit + API tests, `next build`), `e2e` (starts Hardhat node, deploys, seeds, runs Playwright). Cache pnpm store. Fail on any warning in contract compile.

### CD

- Vercel Git integration: every PR → preview deployment on **staging** env vars; merge to `main` → production
- Contracts never deploy from CI; deployments are manual (Phase 4/11)

### Monitoring

- [ ] Sentry: `npx @sentry/wizard@latest -i nextjs`; scrub wallet addresses and emails from events (`beforeSend`)
- [ ] Tenderly: add the contract; alerts on `DisputeRaised`, `Paused`, and any failed transaction to the contract
- [ ] GitHub Action (daily cron): check verifier wallet balance via RPC, open an issue if below 0.02 ETH

**Done when:** CI green on main; a PR shows a working preview link; Sentry receives a test error.

---

## Phase 11 — Production deployment (CLI)

### 1. Contract

Already deployed in Phase 4 (`sepolia-v1`). Confirm with `pnpm hardhat ignition status sepolia-v1`.

### 2. Domain and Clerk production (choose one)

- **Option A (simplest, fine for college):** keep Clerk's **development** instance and use the `*.vercel.app` URL. Shows a small dev banner and has development-instance limits.
- **Option B (real production):** use a domain you own (the GitHub Student Developer Pack has included a free domain offer). Create a Clerk production instance, add the DNS records Clerk lists, create your own Google OAuth client in Google Cloud Console and paste its ID/secret into Clerk, re-enable MetaMask and re-create the webhook for the production URL.

### 3. Vercel

```bash
pnpm add -g vercel
cd apps/web
vercel login
vercel link                                     # create project, root directory apps/web
# for each variable in the table below:
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS preview     # staging contract here
# ...repeat for all variables
vercel env pull .env.local                      # local copy for development
pnpm --filter web db:migrate                    # run against production DATABASE_URL once
vercel --prod                                   # first production deploy
```

In Vercel project settings: Node 22, install command `pnpm install --frozen-lockfile`, build command `pnpm --filter web build`, root directory `apps/web` with "Include files outside root directory" on (monorepo).

### 4. Post-deploy wiring

- [ ] Clerk webhook URL → production domain; send a test event
- [ ] Alchemy browser key: allowlist the production domain
- [ ] Pinata gateway: allowlist the production domain if the gateway is restricted
- [ ] Subgraph: production version published, URL in env vars

### 5. Smoke test (scripted checklist in `docs/RUNBOOK.md`)

1. Logged-out browse loads items and images
2. New college account onboards to verified
3. Student A posts an item with a photo
4. Student B claims it; both see each other's contact
5. Student A confirms; Student B withdraws; balances on Etherscan match
6. `/transparency` totals updated

**Done when:** all smoke steps pass on the production URL; RUNBOOK has addresses, URLs, owners of each account and the incident steps.

---

## Phase 12 — Docs, demo and report

- [ ] `README.md`: what it is, live link, contract link, architecture image, local setup in under 10 commands
- [ ] `docs/RUNBOOK.md`: deploy, rotate keys, pause, redeploy, faucet refills, incident response
- [ ] `docs/report/`: architecture diagram, state machine, sequence of each flow, threat model table, gas report, test coverage screenshot, screenshots of each page (desktop + mobile)
- [ ] `docs/DEMO.md`: a 7-minute demo script using two browsers (Student A in Chrome, Student B in a second Chrome profile), with the confirm window set to 5 minutes beforehand to show the timeout path
- [ ] Viva notes: why escrow, why pull payments, why roles are separated, why nothing personal is on-chain, what changes for mainnet

---

## Environment variables

| Name | Where | Example / notes |
| --- | --- | --- |
| `SEPOLIA_RPC_URL` | Hardhat keystore, Vercel (server) | Alchemy HTTPS URL (server key) |
| `SEPOLIA_PRIVATE_KEY` | Hardhat keystore only | Deployer key |
| `ETHERSCAN_API_KEY` | Hardhat keystore | |
| `NEXT_PUBLIC_CHAIN_ID` | Vercel | `11155111` (local: `31337`) |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | Vercel | Alchemy URL with the domain-restricted browser key |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Vercel | Production vs preview = different contracts |
| `NEXT_PUBLIC_CONTRACT_DEPLOY_BLOCK` | Vercel | For event queries |
| `NEXT_PUBLIC_SUBGRAPH_URL` | Vercel | Studio query URL |
| `NEXT_PUBLIC_PINATA_GATEWAY` | Vercel | `your-gateway.mypinata.cloud` |
| `PINATA_JWT` | Vercel (server) | |
| `VERIFIER_PRIVATE_KEY` | Vercel (server) | Verifier wallet only, never the deployer |
| `DATABASE_URL` | Vercel (server) | Neon pooled connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel | |
| `CLERK_SECRET_KEY` | Vercel (server) | |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Vercel (server) | |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Vercel | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Vercel | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` | Vercel | `/onboarding` |
| `ALLOWED_EMAIL_DOMAIN` | Vercel (server) | `yourcollege.edu.in` |
| `NEXT_PUBLIC_SITE_URL` | Vercel | Used for metadata and MetaMask deep links |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Vercel | Optional |

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "nonce too low" locally | Hardhat node restarted | MetaMask → Clear activity |
| Items missing right after a post | Subgraph lag | Show receipt-based optimistic state; wait a few blocks |
| Hydration mismatch warning | Wallet UI rendered on server | Render after mount or wagmi `ssr: true` + cookies |
| Clerk redirect loop | `proxy.ts` matcher catches sign-in routes | Mark `/sign-in(.*)`, `/sign-up(.*)` public |
| Webhook 400 | Wrong signing secret or body parsed before verify | Use `verifyWebhook(req)` on the raw request |
| Images broken | Gateway host missing in `remotePatterns` | Add host to `next.config.ts` |
| Verification stuck "pending" | Verifier wallet out of ETH or nonce clash | Fund it; check advisory lock; retry from admin |
| Etherscan verify fails | Indexing lag or constructor args | Wait, then `hardhat ignition verify <id>` |
