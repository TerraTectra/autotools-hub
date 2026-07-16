---
description: Diagnose a Solana devnet RPC and public wallet address, classify infrastructure failures, and propose the next safe recovery action.
argument-hint: "--address <PUBLIC_KEY> [--rpc <URL>] [--json]"
---

# /devnet-doctor

Run a read-only Solana devnet infrastructure diagnosis before retrying a faucet or changing application code.

## Inputs

Required:

- public wallet address.

Optional:

- approved devnet RPC URL;
- JSON output;
- an explicit small `--airdrop-lamports` request when the user or existing automation has authorised a devnet state change.

Never accept a seed phrase, private key, or keypair JSON.

## Procedure

1. Load [../skill/SKILL.md](../skill/SKILL.md).
2. Run:

```bash
node scripts/devnet-doctor.mjs --address <PUBLIC_KEY> --json
```

3. Classify the result using [../skill/rpc-diagnostics.md](../skill/rpc-diagnostics.md).
4. When the payer is unfunded, select one route from [../skill/faucet-recovery.md](../skill/faucet-recovery.md).
5. Do not automatically retry a 429/403 response.
6. Return a compact report:

```text
cluster: devnet
rpc: healthy / unhealthy
address: <public key>
balance: <lamports>
classification: <class>
next action: <single safe action>
secret exposure: none
```

## Explicit airdrop mode

Only when authorised:

```bash
node scripts/devnet-doctor.mjs \
  --address <PUBLIC_KEY> \
  --airdrop-lamports 5000 \
  --json
```

After the request, the tool verifies balance. A returned signature alone is not reported as success.

## Stop conditions

Stop and ask for the human interactive step only when the remaining approved route requires login, CAPTCHA, identity verification, provider account creation, or organisation allow-listing.
