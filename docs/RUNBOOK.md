# Runbook

Operational notes for Campus Lost & Found. Filled in as each phase lands (deploy, rotate keys, pause,
redeploy, faucet refills, incident response).

## Contract deployments

| Network           | Deployment id        | Address          | Deploy tx | Block |
| ----------------- | -------------------- | ---------------- | --------- | ----- |
| Sepolia           | `sepolia-v1`         | not deployed yet |           |       |
| Sepolia (staging) | `sepolia-staging-v1` | not deployed yet |           |       |

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
