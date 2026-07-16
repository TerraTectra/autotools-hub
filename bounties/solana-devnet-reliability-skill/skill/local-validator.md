# Local Validator Decision Guide

Public devnet is an integration environment, not the default test runner for every Solana task.

## Use a local environment when

- tests require deterministic accounts and balances;
- the program under test is owned by the project;
- third-party shared state is not required;
- CI must run frequently without faucet dependencies;
- failures need reproducible logs and ledger state;
- a test suite creates many accounts or consumes substantial test SOL;
- public devnet latency and rate limits obscure application failures.

## Stay on devnet when

- the workflow depends on a third-party devnet program or oracle;
- an external backend verifies on-chain subscriptions or signatures;
- the result must be visible in a public explorer;
- multiple independent systems need the same shared state;
- provider-specific authentication must be tested end to end;
- deployment and upgrade behaviour is part of the test.

## Tool selection

### LiteSVM

Best for fast deterministic program tests inside Rust or supported client test harnesses.

Use for:

- instruction logic;
- account constraints;
- transaction construction;
- expected success and failure paths;
- high-volume unit/integration tests.

### Mollusk

Best for lightweight instruction-level program testing with explicit account state and compute observations.

Use for:

- isolated instruction execution;
- program security regression tests;
- controlled account fixtures;
- compute-sensitive paths.

### Surfpool

Best for local application development that benefits from a richer network simulation and mainnet/devnet-like data workflows.

Use for:

- frontend and backend integration;
- local RPC-compatible development;
- account/data mirroring where supported;
- realistic app iteration without public faucet dependence.

### `solana-test-validator`

Best for a straightforward local Solana cluster with CLI compatibility.

```bash
solana-test-validator --reset
solana config set --url localhost
solana airdrop 100
```

Use for:

- Anchor local integration tests;
- deploying local programs;
- transaction and RPC flows;
- deterministic funded wallets.

## Hybrid workflow

A strong pipeline uses layers:

```text
unit tests
  ↓
LiteSVM/Mollusk program tests
  ↓
local validator or Surfpool app integration
  ↓
one minimal public-devnet smoke test
```

This reduces public RPC load and makes the remaining devnet failure meaningful.

## State fixtures

For local environments:

- version account fixtures with the test code;
- document program binaries and IDs;
- reset the ledger between independent suites;
- avoid tests that depend on execution order;
- generate deterministic keypairs only for local, non-secret fixtures;
- never reuse a mainnet private key.

## Decision output

When recommending local instead of devnet, state:

- which shared dependency is absent;
- which local tool fits the test layer;
- how the public-devnet smoke test will remain represented;
- what behaviour cannot be validated locally.

Do not present local validation as proof that a third-party devnet integration works. It proves application behaviour under a controlled environment; the final minimal devnet check proves connectivity and external compatibility.
