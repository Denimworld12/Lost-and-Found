# Subgraph

The Graph subgraph for `LostAndFound` on Sepolia (PLAN.md Phase 5).

| File                    | What it is                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `schema.graphql`        | `Item`, `ItemEvent` (an item's history), `Stats` (`id: "global"` totals), `Config` |
| `subgraph.yaml`         | `sepolia-v1` contract from its deploy block; ABI from the Ignition artifact        |
| `subgraph.staging.yaml` | Same, for `sepolia-staging-v1`                                                     |
| `src/mapping.ts`        | One handler per item event plus `ConfigUpdated`                                    |
| `tests/`                | Matchstick tests for every handler                                                 |

```bash
pnpm --filter subgraph codegen
pnpm --filter subgraph build
pnpm --filter subgraph test
```

Deploying to Subgraph Studio is in `docs/RUNBOOK.md`.
