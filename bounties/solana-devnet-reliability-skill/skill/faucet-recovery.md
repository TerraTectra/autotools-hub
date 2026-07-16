# Faucet Recovery

Use this guide only for Solana test clusters. It does not apply to mainnet funds.

## First principle

A faucet is an infrastructure dependency, not part of the application. Classify the failure before changing transaction code or generating another wallet.

## Recovery decision tree

```text
Is the RPC healthy?
├─ no  → repair or rotate the RPC first
└─ yes
   └─ Is the wallet balance already sufficient?
      ├─ yes → skip the faucet
      └─ no
         └─ Did requestAirdrop return 429?
            ├─ yes → stop retrying; choose another approved route
            └─ no
               └─ Did it return 401/403/CAPTCHA?
                  ├─ yes → use human official flow or documented agent flow
                  └─ no → inspect signature, confirmation, and balance
```

## Route 1: restore an existing funded devnet wallet

This is the cheapest and most reliable path for CI.

- Restore before any wallet-generation step.
- Verify the public address matches the expected identity.
- Confirm the balance on the intended cluster.
- Rotate only after a documented decision.

A workflow that creates a fresh wallet on every retry discards any successful funding and makes rate-limit diagnosis harder.

## Route 2: authenticated RPC provider faucet

Use when the project already has a provider account and its terms permit devnet airdrops.

- Store the RPC API key as a secret.
- Redact query strings from logs.
- Use the provider's documented endpoint or dashboard.
- Keep a public-RPC fallback for read-only health checks, not for secret-bearing requests.

## Route 3: official web faucet

Use when the provider requires GitHub login, CAPTCHA, or another human verification step.

- Ask the human only for the interactive step.
- Provide the public devnet address, never a private key.
- After completion, verify balance through JSON-RPC.
- Do not ask the human to paste seed material back into chat.

## Route 4: official proof-of-work faucet for agents

Use when an official Solana resource directs automated agents to a proof-of-work faucet.

Typical procedure:

```bash
cargo install devnet-pow
devnet-pow get-all-faucets --url dev
devnet-pow \
  --keypair-path /protected/devnet-wallet.json \
  --url dev \
  mine \
  --target-lamports 20000000
```

Operational cautions:

- Inspect currently funded faucet specifications before hard-coding difficulty/reward.
- The client may require a small fee-paying balance before claiming; detect this bootstrap condition explicitly.
- Compilation can be slow in ephemeral CI. Cache Cargo safely or use a prebuilt, checksum-verified binary when the project policy permits it.
- Never upload the keypair as a public artifact.
- Verify the resulting wallet balance; do not infer success from console text.
- Bound CPU time and workflow concurrency.

## Route 5: reputable community faucet

Use only when:

- it explicitly supports Solana devnet;
- the operator and terms are identifiable;
- it does not request seed phrases or wallet imports;
- the address and amount are the only required wallet data;
- no payment or mainnet deposit is required.

Reject any faucet that asks for a recovery phrase, private key, browser extension import, mainnet transfer, or paid unlock.

## Route 6: local validator

Use instead of a faucet when the test does not require shared devnet state.

```bash
solana-test-validator --reset
solana airdrop 100 --url localhost
```

For richer deterministic environments, consider Surfpool, LiteSVM, or Mollusk according to the test layer.

## Handling returned signatures

A faucet response can fail after returning a signature or can return a signature that never confirms.

Always:

1. capture the signature without treating it as success;
2. fetch a fresh blockhash context when required by the client;
3. confirm or query signature status;
4. poll balance with a bounded timeout;
5. record the final result.

## Budgeting test SOL

Request the smallest amount that covers:

- transaction fees;
- associated token account rent;
- program-owned account rent;
- a small retry margin.

Do not repeatedly request large round amounts by default. Conversely, do not request an amount below the rent requirement and then misclassify the resulting transaction failure as an RPC problem.

## Stop conditions

Stop autonomous recovery and request human interaction when:

- the only approved faucet requires CAPTCHA or account login;
- provider credentials must be created or accepted under new terms;
- an organisation administrator must allow-list the wallet/IP;
- every approved agent route is exhausted;
- the service requires identity verification.

At that point provide exactly:

- the public devnet address;
- the official page/action required;
- the minimum test amount;
- how success will be verified.
