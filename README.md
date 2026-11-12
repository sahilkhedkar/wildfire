# Wildfire

Wildfire is a secure platform for running AI coding agents in isolated sandboxes.

## Batch 0.1

This repository currently contains the foundation monorepo: Bun workspaces, Turborepo, Biome, strict TypeScript configuration, CI, and a local PostgreSQL service.

### Commands

```sh
bun install
bun run turbo run test
bun run turbo run build typecheck lint test
docker compose up -d postgres
```

Docker and Lean are intentionally prerequisites for later batches; this batch only establishes their local integration points.
