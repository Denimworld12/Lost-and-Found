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

| Role     | Address                                      | Key                                                                |
| -------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Deployer | `0xc8f5ac25786c12be9b2ab05afee522c359801829` | `SEPOLIA_PRIVATE_KEY` (captain's MetaMask Deployer); holds no role |
| Admin    | `0x0217C435A8C4a104E641CFA438E582716c862d9B` | `ADMIN_PRIVATE_KEY`                                                |
| Verifier | `0x45933417B883B3ecb5eDB185c2a73823F3313016` | `VERIFIER_PRIVATE_KEY` (server wallet for `verifyStudent`)         |
| Arbiter  | `0x9FF4CD7D8DaF39334b469D7C009e5BC4830B6947` | `ARBITER_PRIVATE_KEY`                                              |

Admin, verifier and arbiter were generated for this project; their keys exist only in the Hardhat
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
