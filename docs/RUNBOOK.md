# Runbook

Operational notes for Campus Lost & Found. Filled in as each phase lands (deploy, rotate keys, pause,
redeploy, faucet refills, incident response).

## Contract deployments

| Network           | Deployment id        | Address                                                                                                                              | Deploy tx                                                                                                                 | Block    |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| Sepolia           | `sepolia-v1`         | [`0x15C6A0d31Cd71a157b8ed0ff46f4F9CA84A0c1dD`](https://sepolia.etherscan.io/address/0x15C6A0d31Cd71a157b8ed0ff46f4F9CA84A0c1dD#code) | [`0x99f58eb8…f6243f`](https://sepolia.etherscan.io/tx/0x99f58eb8f835becdcf630ad438d817812153f42d446dc7991a35d657c2f6243f) | 11836334 |
| Sepolia (staging) | `sepolia-staging-v1` | [`0x37542E00914F3758b6E60b86eF8076207bDCa1F6`](https://sepolia.etherscan.io/address/0x37542E00914F3758b6E60b86eF8076207bDCa1F6#code) | [`0x4e608a34…5a3a59`](https://sepolia.etherscan.io/tx/0x4e608a34723d265337eb2931e8236e1f7ed23f636ab41e7684e6387aec5a3a59) | 11836342 |

Both contracts are verified on Etherscan, Blockscout and Sourcify, with config 0.001 ETH minimum reward,
0.0005 ETH claim stake and a 3-day confirm window. Full deploy tx hashes are in `packages/shared/src/addresses.ts`.

### Sepolia accounts

| Role      | Address                                      | Key                                                                |
| --------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Deployer  | `0xc8f5ac25786c12be9b2ab05afee522c359801829` | `SEPOLIA_PRIVATE_KEY` (captain's MetaMask Deployer); holds no role |
| Admin     | `0x0217C435A8C4a104E641CFA438E582716c862d9B` | `ADMIN_PRIVATE_KEY`                                                |
| Verifier  | `0x45933417B883B3ecb5eDB185c2a73823F3313016` | `VERIFIER_PRIVATE_KEY` (server wallet for `verifyStudent`)         |
| Arbiter   | `0x9FF4CD7D8DaF39334b469D7C009e5BC4830B6947` | `ARBITER_PRIVATE_KEY`                                              |
| Student A | `0xc3094e09bb56e350bcdd9039ae2ce3e73d3900cf` | `STUDENT_A_PRIVATE_KEY` (test student, verified on `sepolia-v1`)   |
| Student B | `0x3ba2113c559f36040366477d26e286ffae8928a1` | `STUDENT_B_PRIVATE_KEY` (test student, verified on `sepolia-v1`)   |

Admin, verifier, arbiter and the two test students were generated for this project; their keys exist only in the Hardhat
**development** keystore on the machine that deployed (`pnpm hardhat keystore path --dev`). Back that
file and its password file up. Losing `ADMIN_PRIVATE_KEY` loses pause, config and role management for
both contracts. Each of these wallets needs Sepolia ETH before it can send transactions.

## Local development

```bash
pnpm install
pnpm check                         # lint + typecheck + tests in every package
pnpm --filter contracts build      # compile LostAndFound.sol
pnpm --filter contracts test       # TypeScript + Solidity tests
pnpm --filter contracts coverage   # coverage report; fails below 100% lines on LostAndFound.sol
pnpm --filter contracts gas        # gas table; regenerates docs/report/gas.md
pnpm --filter contracts export-abi # writes packages/shared/src/abi.ts
pnpm --filter web dev              # Next.js dev server
```

## Static analysis (Slither)

Needs Python 3.10+.

```bash
pip install slither-analyzer solc-select
solc-select install 0.8.34 && solc-select use 0.8.34
pnpm --filter contracts slither    # settings in contracts/slither.config.json
```

CI runs the same with `--fail-high`. Accepted Low/Informational findings are listed in `docs/DECISIONS.md`.

## Local deployment

```bash
cd contracts
pnpm node             # terminal 1, keep running (chain 31337, http://127.0.0.1:8545)
pnpm deploy:local     # terminal 2: Ignition deploy with ignition/parameters/localhost.json
pnpm seed:local       # verifies accounts #3 and #4, posts 3 demo items (refuses on any other chain)
pnpm export-abi       # packages/shared/src/abi.ts + addresses.ts
```

| Local account | Address                                      | Role               |
| ------------- | -------------------------------------------- | ------------------ |
| #0            | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Deployer, admin    |
| #1            | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Verifier           |
| #2            | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Arbiter            |
| #3            | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | Student A (seeded) |
| #4            | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | Student B (seeded) |

The first deployment on a fresh node is always at `0x5FbDB2315678afecb367f032d93F642f64180aa3`, block 1.
The local confirm window is 5 minutes so the timeout path can be shown.

Restarting the node wipes the chain but not `contracts/ignition/deployments/chain-31337/` (git-ignored).
Redeploy with `pnpm deploy:local --reset`, then seed again. In MetaMask, clear activity
(Settings → Advanced → Clear activity) or nonces break.

## Sepolia deployment

Secrets live in the Hardhat keystore (`pnpm hardhat keystore set NAME` inside `contracts/`), never in files or chat:
`SEPOLIA_RPC_URL`, `SEPOLIA_PRIVATE_KEY` (Deployer account), `ETHERSCAN_API_KEY`.
`pnpm hardhat keystore list` shows which names are set without revealing values.

```bash
cd contracts
# 1. Put the real admin, verifier and arbiter addresses in ignition/parameters/sepolia.json
pnpm deploy:sepolia                    # deployment id sepolia-v1, verifies on Etherscan
pnpm setup-roles:sepolia               # checks roles; moves admin off the deployer if needed
pnpm deploy:staging                    # second contract, deployment id sepolia-staging-v1
IGNITION_DEPLOYMENT_ID=sepolia-staging-v1 pnpm setup-roles:sepolia
pnpm export-abi                        # commit packages/shared and ignition/deployments/
```

- Verification failed (Etherscan lags)? `pnpm hardhat ignition verify sepolia-v1`.
- Contract changed? Use a new deployment id (`sepolia-v2`), pause the old contract, update addresses and the subgraph.
- Record the address, deploy transaction and block in the table at the top.

### Smoke test (post → claim → confirm → withdraw)

```bash
cd contracts
pnpm smoke:sepolia    # IGNITION_DEPLOYMENT_ID=sepolia-staging-v1 for staging
```

Tops up the verifier and Student A/B from the Deployer, verifies both students, then Student A posts an
item with the minimum reward, Student B claims it, Student A confirms and Student B withdraws reward + stake.
Each call is simulated before it is sent. Every run posts a new item.

First run on `sepolia-v1` (item #1, blocks 11836911–11836918):

| Step                                  | Transaction                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Fund verifier 0.002 ETH               | [`0x71fe976f…018806`](https://sepolia.etherscan.io/tx/0x71fe976f8da623e594752b4385b6e916f29200a09a53b8ed870bf3056e018806) |
| Fund Student A 0.004 ETH              | [`0xf20254ae…b8e9fd`](https://sepolia.etherscan.io/tx/0xf20254ae42673ac4ed3e4a798653d9a53b0b6e2043a8f5b7dd89bcb5abb8e9fd) |
| Fund Student B 0.003 ETH              | [`0xb72d31ac…f5264a`](https://sepolia.etherscan.io/tx/0xb72d31acc4a4f911ce178a13d6e9739f2c5460b1d5e685900a9bd20d76f5264a) |
| Verifier `verifyStudents([A, B])`     | [`0x0a2436d5…165397`](https://sepolia.etherscan.io/tx/0x0a2436d5da81a3de4f6a56a9e06b7b7707330acdefa2c10fe74f338048165397) |
| Student A `postItem` (0.001 ETH)      | [`0x8b145b39…fdec61`](https://sepolia.etherscan.io/tx/0x8b145b39d914fa55e0261d5f0ee3322bbe02f9b4a50ed60ac629b7d6f7fdec61) |
| Student B `claimItem(1)` (0.0005 ETH) | [`0x21231b73…bb0ad7`](https://sepolia.etherscan.io/tx/0x21231b73da76e79b633fa302ab8d1e86e5a6b1beff24fcb9635ccec9e9bb0ad7) |
| Student A `confirmReturn(1)`          | [`0xe050981b…eff8a0`](https://sepolia.etherscan.io/tx/0xe050981b61061209563a9747dbf0dde59c1b0b30f8816ff9267a45bf67eff8a0) |
| Student B `withdraw` (0.0015 ETH)     | [`0x42eda536…02a6a4`](https://sepolia.etherscan.io/tx/0x42eda5364b699faf2a699d3fbbde5858ade30bcbdb4a3551e5849ca1ac02a6a4) |

## Authentication and student verification

Values for `apps/web/.env.local` (git-ignored; Vercel env vars in production). Never paste them into chat.

| Variable                                                | Source                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk dashboard → API keys                                                                               |
| `CLERK_WEBHOOK_SIGNING_SECRET`                          | Clerk dashboard → Webhooks, after registering `https://<domain>/api/webhooks/clerk` (needs a public URL) |
| `VERIFIER_PRIVATE_KEY`                                  | `pnpm --filter contracts exec hardhat keystore get --dev VERIFIER_PRIVATE_KEY`                           |
| `DATABASE_URL`                                          | Neon pooled connection string                                                                            |
| `PINATA_JWT`, `NEXT_PUBLIC_PINATA_GATEWAY`              | Pinata API key (JWT) and dedicated gateway host                                                          |
| `NEXT_PUBLIC_PINATA_GATEWAY_KEY`                        | Pinata → Gateways → Access Controls → Gateway Keys (read key for the dedicated gateway)                  |
| `ALLOWED_EMAIL_DOMAIN`                                  | College email domain, e.g. `yourcollege.edu.in` (comma-separate extra domains)                           |

Clerk dashboard settings the code relies on:

1. Google and Email (verification code) sign-in on, password off, email required.
2. Web3 → MetaMask on.
3. Sessions → Customize session token: `{ "metadata": "{{user.public_metadata}}", "email": "{{user.primary_email_address}}" }`.
4. Webhooks: `user.created`, `user.updated`, `user.deleted` to `/api/webhooks/clerk`.
5. Paths: sign-in `/sign-in`, sign-up `/sign-up`, after sign-up `/onboarding`.
6. Users → set `publicMetadata.role` to `"admin"` or `"arbiter"` for staff.

Database:

```bash
pnpm --filter web db:generate # after editing src/lib/db/schema.ts; commit apps/web/drizzle/
pnpm --filter web db:migrate  # applies migrations to DATABASE_URL
```

The verifier wallet pays gas for every `verifyStudent` and `revokeStudent` (about 50,000 gas each). Keep at
least 0.01 Sepolia ETH on it. A verification that failed (out of gas, RPC down) shows as `failed` in
`students`; once the wallet is funded the student can press "Try again" in onboarding, or an admin can call
`POST /api/admin/students/<clerk user id>/retry`. Verifier sends are serialised across server instances by
Postgres advisory lock 42.

## Core flows (Phase 8)

Every write in the app goes through `useTxFlow` (`src/hooks/useTxFlow.ts`, logic in `src/lib/tx-flow.ts`):
wallet connected → Sepolia → connected wallet equals the Clerk-linked wallet → (post only: upload) → gas +
value ≤ balance → `simulateContract` → MetaMask → receipt. A revert is shown with the copy from
`src/lib/errors.ts` before MetaMask opens. A student whose wallet isn't whitelisted sees "Finish activating
your account before posting or claiming."

Disputes are resolved, and the confirm window changed, from the admin console (`/admin`, see below).
Phase 8's live check below did both from scripts because the console didn't exist yet.

### Timeout demo

1. Admin sets the response window to 5 minutes (the minimum) in `/admin/settings` **before** the claim.
2. The finder claims; the 5-minute window is locked into that item.
3. Admin sets it back to 3 days straight away. The claimed item keeps 5 minutes.
4. After 5 minutes of chain time the finder's item page and `/me` show "Collect reward".

### Live check on `sepolia-v1` (4 Oct 2026, blocks 11841054–11841148)

Run through the web UI (dev server) as two Clerk test users, `p8-student-a+clerk_test@gmail.com` (Student A
wallet) and `p8-student-b+clerk_test@gmail.com` (Student B wallet), with a test EIP-1193 wallet injected into
the browser that signs with each student's keystore key. Disputes were resolved and the window changed by
script as above. Deployer funded A 0.004, B 0.001, admin 0.0005 and arbiter 0.0005 ETH first.

| Step                                              | Transaction                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Student A posts #2 with a photo (0.001 ETH)       | [`0x7e886ab7…7c2817`](https://sepolia.etherscan.io/tx/0x7e886ab720090d409a08a247692acb1e063e47d0e4e701862078e1270d7c2817) |
| Student B claims #2 (0.0005 ETH deposit)          | [`0xdc85313f…cb2e48`](https://sepolia.etherscan.io/tx/0xdc85313f671844b7344f0c21062c3c9cb0cec7aa7a395447783987702dcb2e48) |
| Student A rejects the claim (deposit to A)        | [`0x665c6e1a…7ff58e`](https://sepolia.etherscan.io/tx/0x665c6e1a04761683160c74ae19b1ecc2295a6888461ffc2f1fa799eae97ff58e) |
| Student B claims #2 again                         | [`0xa81cdd64…5dd60b`](https://sepolia.etherscan.io/tx/0xa81cdd64d967eed456886925a5249c7c9c5eaf42ceb6ad7f9ca90c80305dd60b) |
| Student A confirms the return (0.0015 ETH to B)   | [`0xdc5e2279…ae0c07`](https://sepolia.etherscan.io/tx/0xdc5e22793257250776ccdcaae171f3caff6775b3729dc233c507c6b3abae0c07) |
| Student B withdraws 0.0015 ETH (item page)        | [`0xeac804f8…deac2b`](https://sepolia.etherscan.io/tx/0xeac804f8568345c1216c53541c1410585c161cf930c9c1bd05ebf47adbdeac2b) |
| Student A posts #3 without a photo                | [`0xb063ef60…448236`](https://sepolia.etherscan.io/tx/0xb063ef6087029558c310aeccd298a5d6a79b85b42a15e9d8395e05a5e7448236) |
| Student B claims #3                               | [`0x0aa07fe1…ec8c2d`](https://sepolia.etherscan.io/tx/0x0aa07fe150771a51a1d0dfc260ac96ea120cf121bd4dae7fd5db54aa81ec8c2d) |
| Student B (finder) opens a dispute                | [`0x217ad3db…0ec314`](https://sepolia.etherscan.io/tx/0x217ad3db0801a0f8d88859652536d698025202872801ff052e096118b50ec314) |
| Arbiter `resolveDispute(3, true)`: finder paid    | [`0x82d1f80d…d503ac`](https://sepolia.etherscan.io/tx/0x82d1f80d10d2c2333b0f7034e0f1c0ffd0c70b700589c0a56c47d9f5d1d503ac) |
| Student A posts #4 (0.002 ETH)                    | [`0xdd9daa28…c9146a`](https://sepolia.etherscan.io/tx/0xdd9daa28405d70f4e34f3e3f0c7306c2f6b744698fceedf8862d61d689c9146a) |
| Student B claims #4                               | [`0x73ebc3d9…e1cd07`](https://sepolia.etherscan.io/tx/0x73ebc3d928eac64689e64afdd60754c56c747ce26374fba611b8773187e1cd07) |
| Student A (owner) opens a dispute                 | [`0x0dd50b6b…8c33e0`](https://sepolia.etherscan.io/tx/0x0dd50b6bde63f8ceec4c3785b4601067e32d54c1afebe25520e2c844878c33e0) |
| Arbiter `resolveDispute(4, false)`: item reopened | [`0xca8a1a03…15a48f`](https://sepolia.etherscan.io/tx/0xca8a1a03611468be38f6b26aa07b7a05a24a4b8b506d0a6b5db80f9b8e15a48f) |
| Student A cancels #4                              | [`0xeb881f59…acefe3`](https://sepolia.etherscan.io/tx/0xeb881f59c61e6b606a4b3386246ebe503a4982d94d812a974f7297ef78acefe3) |
| Student A withdraws 0.003 ETH (`/me`)             | [`0xc828647d…42ea2e`](https://sepolia.etherscan.io/tx/0xc828647d62f621f2aae242750f5911e79c1c6db5acb3fab54c0410f8b542ea2e) |
| Admin `setConfig(…, 300)`: 5-minute window        | [`0x5e3c0438…1f2a6b`](https://sepolia.etherscan.io/tx/0x5e3c04383e485dc215ccb3e2e65d4c62291daab78286631e98814719b41f2a6b) |
| Student A posts #5                                | [`0xa7e9ac56…aec62e`](https://sepolia.etherscan.io/tx/0xa7e9ac560c8ea45d8f1a396c8b9f6364695e467356ce5e6216c06b3927aec62e) |
| Student B claims #5 (window locked at 300 s)      | [`0x27c26917…50ea5e`](https://sepolia.etherscan.io/tx/0x27c2691763d771d5dd5023f4ead98fbd43abc633a10301ad5e3a9366f150ea5e) |
| Admin `setConfig(…, 259200)`: 3 days restored     | [`0x62bd2e50…ae50c7`](https://sepolia.etherscan.io/tx/0x62bd2e50c5a3fc4864103098822c9f9d85a7c60d4f3c7e41cdfbb60cadae50c7) |
| Student B collects after the window (`/me`)       | [`0x91aed83d…eab430`](https://sepolia.etherscan.io/tx/0x91aed83d9673561928158d949b9f1d4ca4ddef4a3fab54668e2e863ae0eab430) |
| Student B withdraws 0.003 ETH (header chip)       | [`0x19716a80…83d16b`](https://sepolia.etherscan.io/tx/0x19716a802d2221b59cf028d910e318560ccbe6251ab33356dffabeb98e83d16b) |

Also checked: MetaMask rejection shows "Cancelled in MetaMask." and keeps the form; retrying reuses the
pinned CID (one upload); owner and finder each see the other's college email after a claim; each side's
open item page updates within seconds of the other's transaction, with a toast; the ActionBar switches from
the dispute buttons to "Collect reward" on chain time; no console errors; 360 px layout.

### Dedicated Pinata gateway needs its Gateway Key

The gateway in `NEXT_PUBLIC_PINATA_GATEWAY` restricts reads: without a key it answers 401 `ERR_ID:00024`
("This content cannot be requested through the gateway you are using"). Create or copy the key under
Pinata → Gateways → (gateway) → Access Controls → Gateway Keys and set it as `NEXT_PUBLIC_PINATA_GATEWAY_KEY`
(`.env.local` and Vercel). The app appends it as `?pinataGatewayToken=` to every dedicated-gateway URL. It is a
read-only key and safe in the browser. With no dedicated gateway set, the app uses `gateway.pinata.cloud`.

Checked live on 4 Oct 2026: Student A posted #6 with a photo through the UI
([`0xba2558c3…29ed45`](https://sepolia.etherscan.io/tx/0xba2558c36dafecd7eba46f2ed55363e9a590532254150739a80a4dc66929ed45));
its metadata and photo both loaded from the dedicated gateway (200).

## Admin console (Phase 9)

`/admin` is for Clerk users whose `publicMetadata.role` is `admin` or `arbiter` (set in the Clerk dashboard →
Users). Arbiters see Disputes only; admins see every tab. Each page re-checks the role from Clerk on the
server, and every `/api/admin/*` route checks it again.

| Tab       | Who            | Does                                                                                         |
| --------- | -------------- | -------------------------------------------------------------------------------------------- |
| Overview  | admin          | Contract, pause state, rules, totals, verifier wallet balance (warns below 0.02 ETH), queues |
| Students  | admin          | Search by email or wallet, filter by status, Remove (revoke) and Retry failed activations    |
| Disputes  | admin, arbiter | Every Disputed item with both emails, details and history; Pay the finder / Return to owner  |
| Settings  | admin          | Minimum reward, deposit and response window (`setConfig`); Pause / Resume (type PAUSE)       |
| Audit log | admin          | `admin_actions`, newest first, with notes and transaction links                              |

Contract writes (dispute decisions, settings, pause) are sent from the staff member's own MetaMask through
`useTxFlow`, so a staff account needs:

1. The role in Clerk `publicMetadata.role`.
2. A linked MetaMask wallet (onboarding step 3, or added in the Clerk dashboard) that holds the matching
   on-chain role: `ARBITER_ROLE` for dispute decisions, `DEFAULT_ADMIN_ROLE` for settings and pause. On
   `sepolia-v1` those are the Arbiter and Admin wallets from the accounts table. The console says which
   wallet holds the role when the connected one doesn't.

Once the transaction is mined, the browser posts it to `POST /api/admin/actions`. The server saves the audit
entry only if the receipt is a successful call to the contract, sent from the caller's linked wallet, with
the matching event (`DisputeResolved`, `ConfigUpdated`, `Paused`, `Unpaused`). If that save fails, the
console keeps the dispute and its note on screen with "Save again" until the entry is saved. Each
transaction is recorded once (unique index on `admin_actions.tx_hash`); apply that migration with
`pnpm --filter web db:migrate` before deploying this version. Remove and Retry on the Students tab are sent by the
server's verifier wallet (the contract gives `revokeStudent` to `VERIFIER_ROLE`), and the API writes their
audit entries.

If a role is moved to a Safe multi-sig (a role holder with contract code), the console shows "Propose in
Safe" with the contract address, value 0 and the encoded calldata instead of sending a transaction. On
4 Oct 2026 the Admin and Arbiter role holders on `sepolia-v1` were plain wallets (no code), so the console
writes directly.

### Pausing

Settings → "Pause posting and claiming", type `PAUSE`. While paused, a banner runs across the admin area,
`/post` disables "Post and lock reward", item pages replace "I found this" with a note, `/api/upload` answers
409, and the contract reverts `postItem` and `claimItem` with `EnforcedPause`. Returns, disputes,
collecting and withdrawals keep working. Resume from the same section.

### Live check on `sepolia-v1` (4 Oct 2026, blocks 11841447–11841534)

Run through the web UI (dev server) as Clerk test users `p9-arbiter+clerk_test@gmail.com` (role arbiter,
Arbiter wallet linked) and `p9-admin+clerk_test@gmail.com` (role admin, Admin wallet linked), with the
test-only injected wallet from Phase 8 signing with the keystore keys. The disputed items were set up by
script with Student A and B.

| Step                                                        | Transaction                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Student A posts #7, Student B claims it and opens a dispute | [`0x3cf460c2…50ec92`](https://sepolia.etherscan.io/tx/0x3cf460c21fa300b1bca2e50571b41760cbf74d5027b7db265c4fe17907a0ee92) |
| Student B posts #8, Student A claims it and opens a dispute | [`0x88e3118a…1b8210`](https://sepolia.etherscan.io/tx/0x88e3118a2dccf9a1ac9c1247fff59edbf2a4b07ec0ba2cfbb7be4b5b031b8210) |
| Arbiter: Pay the finder on #7 (with note)                   | [`0x75b2a0e6…cf646a`](https://sepolia.etherscan.io/tx/0x75b2a0e6a46b3581466a5c60556f5b39522ee6a59d330c27aca5a38ed4cf646a) |
| Arbiter: Return to owner on #8 (with note)                  | [`0x4cb404d9…131016`](https://sepolia.etherscan.io/tx/0x4cb404d964ec0adda7cdfb4783be3736c678c3d615a4cee5cf321dfb94131016) |
| Admin: Pause (typed PAUSE)                                  | [`0xf5a5fe7a…00c95a`](https://sepolia.etherscan.io/tx/0xf5a5fe7a591aa07da5de14996252025a8539c569a803dba6adb44c262500c95a) |
| Admin: Resume                                               | [`0xb5e0017c…cedc63`](https://sepolia.etherscan.io/tx/0xb5e0017cd055bf76d59ad64334a75eaf571448d3bdd722ed596c1974e0cedc63) |
| Admin: response window 3 days → 1 day                       | [`0x7715e25f…9bb3b3`](https://sepolia.etherscan.io/tx/0x7715e25ff70a3da6925545095fc754bc3559aff0dbf94ed7c6db46403a9bb3b3) |
| Admin: response window back to 3 days                       | [`0x5025350b…854a95`](https://sepolia.etherscan.io/tx/0x5025350bdfc21b148a15b50e85c4bba4188d289eb41c09e318dde03d44854a95) |
| Student B posts #9, Student A claims it and opens a dispute | [`0x94af4142…ad3852`](https://sepolia.etherscan.io/tx/0x94af414220116b1a1d5de813f9f7c9e135a627a7b3fb40cac14c387bc3ad3852) |
| Arbiter: Pay the finder on #9 (with note)                   | [`0x49db76ce…5f5866`](https://sepolia.etherscan.io/tx/0x49db76ce7cf0ab514069bcede6e6f205e9a3f43328a1f0fe7c9cfefdef5f5866) |

Also checked: a decision without a 10-character note is refused before MetaMask opens; a MetaMask
rejection shows "Cancelled in MetaMask."; while paused, `/post` showed the paused note with "Post and
lock reward" disabled, item #6 showed the note instead of "I found this", `/api/upload` answered 409, and
simulating `postItem` and `claimItem` reverted with `EnforcedPause`; the Admin wallet on Disputes is told
it doesn't hold the arbiter role and which wallet does; the confirm button stays disabled until `PAUSE` is
typed exactly; a window of 4 minutes is refused with the 5 minutes to 14 days bound; all seven actions
appear in the audit log with their notes; Overview warned that the verifier wallet (0.0018 ETH) is below
0.02 ETH; no console errors; no horizontal scroll at 360 px.
