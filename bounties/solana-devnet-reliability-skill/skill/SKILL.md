---
name: solana-devnet-reliability
description: Diagnose and recover Solana devnet RPC, faucet, wallet funding, blockhash, CI, and key-management failures. Use for HTTP 429/403 errors, unfunded test wallets, failed requestAirdrop calls, flaky shared devnet state, protected GitHub Actions wallets, proof-of-work faucet routing, or deciding between devnet and a local validator.
user-invocable: true
---

# Solana Devnet Reliability

Use this skill when a Solana development task is blocked by infrastructure rather than application logic.

## Triggers

Activate this skill for requests involving:

- `requestAirdrop` failures or HTTP 429/403 responses;
- an unfunded devnet payer;
- intermittent RPC timeouts, stale blockhashes, or unhealthy nodes;
- CI jobs that generate a fresh wallet on every run;
- test keypairs appearing in logs, patches, artifacts, or browser bundles;
- choosing between public devnet, an authenticated provider, Surfpool, or `solana-test-validator`;
- recovering an autonomous agent that must sign a devnet transaction;
- verifying whether a failure is RPC, faucet, balance, rent, blockhash, simulation, or program state.

Do not use this skill for mainnet funding, trading, token acquisition, or bypassing access controls.

## Non-negotiable safety rules

1. **Never request or accept a seed phrase or private key in chat.**
2. **Never commit a keypair JSON file.** Public addresses are safe to print; secret arrays are not.
3. **Read-only diagnosis is the default.** Airdrops and transactions require explicit user intent or an existing automation instruction that authorises devnet state changes.
4. **Stop repeated public-faucet requests after a classified rate limit.** Reducing the amount usually does not fix an IP/window limit.
5. **Never label a wallet funded until `getBalance` confirms it.** A returned signature alone is insufficient.
6. **Never switch to mainnet as a recovery step.** Confirm the cluster genesis identity before signing.
7. **Treat test SOL as valueless development material, not cryptocurrency income.**
8. **Do not suggest defeating CAPTCHA.** Use the official human faucet or an official agent-oriented proof-of-work route.
9. **Do not expose provider tokens, JWTs, RPC API keys, or artifact download URLs.**
10. **Preserve one wallet identity across retries.** Generate a new wallet only when rotation is intentional.

## Operating procedure

### 1. Establish the required environment

Determine whether the task truly requires shared devnet state.

- Needs a public explorer, third-party devnet program, shared oracle, or external service: stay on devnet.
- Needs only deterministic program/client tests: prefer LiteSVM, Mollusk, Surfpool, or `solana-test-validator`.
- Needs production behaviour: reproduce locally first, then use devnet for the smallest integration check.

Read [local-validator.md](local-validator.md) when this choice is unclear.

### 2. Run read-only diagnostics

Collect, without signing:

- RPC URL hostname with credentials redacted;
- `getGenesisHash`;
- `getHealth`;
- `getVersion`;
- `getLatestBlockhash`;
- payer public address;
- `getBalance`;
- recent error class and HTTP/RPC code.

Use the bundled doctor when possible:

```bash
node scripts/devnet-doctor.mjs --address <PUBLIC_KEY> --json
```

Read [rpc-diagnostics.md](rpc-diagnostics.md) for interpretation.

### 3. Classify before changing anything

| Classification | Typical evidence | Next action |
|---|---|---|
| RPC unavailable | timeout, DNS, 502/503 | rotate to another documented devnet RPC or authenticated provider |
| Faucet rate limit | HTTP 429, faucet-specific message | stop retry loop; use recovery ladder |
| Access control | HTTP 401/403, CAPTCHA/login requirement | human official faucet or authorised agent route |
| Unfunded payer | healthy RPC, balance below rent/fee budget | fund same address through one approved route |
| Stale blockhash | `Blockhash not found`, long delay before send | rebuild and re-sign immediately before send |
| Simulation/program error | healthy RPC and payer, simulation logs present | return to application/program debugging |
| Wrong cluster | unexpected genesis hash or program missing | correct RPC; never compensate by changing program IDs blindly |
| State drift | account exists with unexpected data | use fresh deterministic test accounts or local validator fixture |

### 4. Apply the recovery ladder

Use exactly one funding path at a time:

1. Existing funded devnet wallet restored from a protected store.
2. Authenticated RPC provider faucet already available to the project.
3. Official web faucet when a human can complete login/CAPTCHA.
4. Official proof-of-work faucet intended for agents.
5. Reputable community faucet with explicit devnet terms.
6. Local validator when shared devnet state is unnecessary.

After each path, verify balance. Do not cascade through multiple faucets without recording the result.

Read [faucet-recovery.md](faucet-recovery.md).

### 5. Validate the minimum viable transaction

Before running the full application:

- calculate rent and fee budget;
- fetch a fresh blockhash;
- simulate when supported;
- submit the smallest required transaction;
- confirm with the same blockhash context;
- record signature, cluster, public address, slot, and outcome;
- redact all credentials.

### 6. Persist state safely

For CI and agents:

- store the keypair only in an encrypted secret store or protected artifact;
- restore before wallet creation;
- use restrictive permissions;
- upload diagnostics separately from credentials when possible;
- set explicit artifact retention;
- prevent forked pull requests from receiving secrets;
- serialize workflows that mutate the same wallet.

Read [key-management.md](key-management.md) and [ci-workflows.md](ci-workflows.md).

## Deliverables

When resolving a devnet reliability issue, return:

- classification and evidence;
- cluster and public address;
- current confirmed balance;
- chosen recovery path and why alternatives were rejected;
- commands or workflow changes made;
- final confirmation result;
- remaining human-only blocker, if any;
- explicit statement that no secret material was exposed.

## Progressive disclosure

- [rpc-diagnostics.md](rpc-diagnostics.md) — RPC health, genesis, errors, blockhashes.
- [faucet-recovery.md](faucet-recovery.md) — 429/403 handling and funding routes.
- [key-management.md](key-management.md) — wallet persistence and secret hygiene.
- [ci-workflows.md](ci-workflows.md) — GitHub Actions and autonomous-agent patterns.
- [local-validator.md](local-validator.md) — when devnet should be replaced locally.
- [resources.md](resources.md) — primary documentation and current tools.

## Two-strike rule

If the same recovery action fails twice with materially identical evidence, stop repeating it. Reclassify the failure, preserve diagnostics, and choose a different documented route. Do not turn a rate limit into an abusive retry loop.
