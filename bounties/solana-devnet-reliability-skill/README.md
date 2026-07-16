# Solana Devnet Reliability Skill

A production-oriented AI skill for diagnosing and recovering Solana devnet environments without leaking keypairs, hammering public RPCs, or silently switching networks.

This skill targets a recurring builder problem: a project works locally, then CI or an autonomous agent gets stuck on `429 Too Many Requests`, an unfunded payer, a missing test wallet, an expired blockhash, or a secret accidentally written to logs.

## What it solves

- Distinguishes RPC health failures from faucet rate limits and transaction failures.
- Uses a strict recovery ladder instead of repeated blind `requestAirdrop` calls.
- Preserves one devnet identity across CI runs through protected artifacts or secret stores.
- Keeps private keys, JWTs and provider tokens out of browser bundles, patches and logs.
- Routes agents between public faucet, proof-of-work faucet, provider faucet and local validator workflows.
- Produces a small, inspectable diagnostic report before taking any state-changing action.
- Covers GitHub Actions, local development and autonomous-agent environments.

## Why this belongs in Solana AI Kit

Devnet reliability is cross-domain. It affects payments, DeFi, games, agents, hackathons, indexers and every CI pipeline that must sign a transaction before tests can run. Existing Solana skills explain how to build transactions; this addon explains how to keep the test environment alive safely when shared infrastructure fails.

The procedures were developed against real 2026 failure modes:

- public devnet RPC responses returning HTTP 429;
- airdrop size reduction not fixing an IP-level limit;
- proof-of-work clients requiring a fee-paying bootstrap balance;
- reruns generating a new wallet and losing the funded identity;
- protected artifacts restoring stale logs together with current state;
- browser demos exposing credentials when a server-side adapter was required.

## Installation

### Claude Code / compatible skill directory

```bash
git clone https://github.com/TerraTectra/autotools-hub
cd autotools-hub/bounties/solana-devnet-reliability-skill
./install.sh
```

Project-local install:

```bash
./install.sh --project
```

Windows PowerShell:

```powershell
./install.ps1 -Scope Project
```

The installer copies only the `skill/`, `commands/`, and `agents/` directories. It does not install executables, create wallets, request funds, or modify Solana configuration.

## Diagnostic CLI

The bundled doctor is read-only unless an explicit airdrop amount is supplied.

```bash
node scripts/devnet-doctor.mjs \
  --address Fz67aGkB8DiPWtp6zRLNX2QGzAFQybWAcLmo6kk98FrD
```

JSON output:

```bash
node scripts/devnet-doctor.mjs --address <PUBLIC_KEY> --json
```

Explicit tiny bootstrap request:

```bash
node scripts/devnet-doctor.mjs \
  --address <PUBLIC_KEY> \
  --airdrop-lamports 5000
```

The CLI never accepts a seed phrase or private key and never reads a keypair file.

## Recovery ladder

```text
1. Confirm cluster + genesis identity
2. Check RPC health/version/blockhash
3. Check public address balance
4. Classify 429 / 403 / timeout / transaction error
5. Stop repeated airdrops
6. Preserve the same wallet identity
7. Select one funded route:
   a. official web faucet (human + CAPTCHA when required)
   b. official proof-of-work faucet (agent path)
   c. authenticated RPC provider faucet
   d. community faucet with documented terms
   e. local validator for tests that do not require shared devnet state
8. Verify balance and rent/fee budget
9. Run the smallest signed transaction
10. Persist only non-secret diagnostics
```

## Repository structure

```text
solana-devnet-reliability-skill/
├── skill/
│   ├── SKILL.md
│   ├── rpc-diagnostics.md
│   ├── faucet-recovery.md
│   ├── key-management.md
│   ├── ci-workflows.md
│   ├── local-validator.md
│   └── resources.md
├── commands/
│   └── devnet-doctor.md
├── agents/
│   └── devnet-operator.md
├── scripts/
│   └── devnet-doctor.mjs
├── tests/
│   └── devnet-doctor.test.mjs
├── install.sh
├── install.ps1
├── package.json
└── LICENSE
```

## Testing

```bash
npm test
```

Tests use mocked JSON-RPC responses. They do not contact Solana or request an airdrop.

## Safety guarantees

- Read-only diagnosis is the default.
- State-changing requests require an explicit CLI flag or user instruction.
- The skill rejects seed phrases and private-key input as part of troubleshooting.
- It does not recommend committing keypair JSON, JWTs, API tokens or wallet artifacts.
- It never treats test SOL as real money.
- It does not suggest bypassing CAPTCHA or access controls; it routes agents to the official proof-of-work path where available.
- It does not loop on public faucets after a rate-limit classification.

## License

MIT
