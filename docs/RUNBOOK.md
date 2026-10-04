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
