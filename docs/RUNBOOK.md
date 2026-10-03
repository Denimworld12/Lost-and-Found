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
pnpm --filter contracts coverage   # coverage report
pnpm --filter web dev              # Next.js dev server
```
