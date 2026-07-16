# CI Workflows

A reliable Solana devnet workflow separates identity, funding, application work, diagnostics, and publication.

## Reference pipeline

```text
checkout
  ↓
restore protected wallet state
  ↓
validate public address and cluster
  ↓
read-only RPC doctor
  ↓
fund only when balance is below calculated budget
  ↓
perform smallest integration transaction
  ↓
run application workflow
  ↓
upload protected state
  ↓
publish sanitised diagnostics separately
```

## GitHub Actions security boundaries

### Pull requests from forks

Do not expose repository secrets or protected wallet artifacts to untrusted forked pull requests.

- Run read-only tests without credentials.
- Use `pull_request`, not `pull_request_target`, for untrusted code.
- Keep funding/signing jobs behind a trusted branch, environment approval, or manual workflow.
- Never check out attacker-controlled code after secrets become available.

### Permissions

Use the smallest `GITHUB_TOKEN` permissions:

```yaml
permissions:
  contents: read
  actions: read
```

Add write permissions only to the job that genuinely requires them.

### Concurrency

Serialize jobs sharing one wallet:

```yaml
concurrency:
  group: solana-devnet-wallet
  cancel-in-progress: false
```

Cancelling during a signed transaction or state upload can leave ambiguous state.

## Protected artifact pattern

```yaml
- name: Restore wallet state
  env:
    GH_TOKEN: ${{ github.token }}
  run: |
    mkdir -p private/devnet
    # Resolve the latest non-expired artifact by an exact trusted prefix.
    # Download and unzip only inside the private workspace.

- name: Create wallet only when absent
  run: |
    test -f private/devnet/wallet.json || node scripts/create-devnet-wallet.mjs

- name: Upload protected state
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: devnet-wallet-state-${{ github.run_id }}
    path: private/devnet
    retention-days: 30
    include-hidden-files: true
```

Additional controls:

- Validate the restored public address against a recorded non-secret value.
- Prefer repository/environment secrets over artifacts when available.
- Do not use broad wildcard extraction into the repository root.
- Avoid restoring old diagnostic logs as if they described the current run.
- Never echo artifact content.

## Funding gate

Do not invoke a faucet unconditionally.

Pseudo-code:

```text
required = fee_budget + rent_budget + retry_margin
balance = getBalance(address)
if balance >= required:
    skip funding
else:
    classify previous failure
    choose one authorised funding route
    verify balance after funding
```

A fixed threshold should be justified in comments. For account-heavy tests, calculate rent with current RPC methods rather than copying a stale constant.

## Retry discipline

Use bounded retries for read-only network operations:

```yaml
- name: RPC doctor
  run: node scripts/devnet-doctor.mjs --address "$DEVNET_ADDRESS" --json
```

Do not wrap a faucet command in an infinite shell loop. On 429/403, fail with a clear classification so a different route can be selected.

## Fresh blockhash discipline

Build and sign close to submission:

```text
prepare instructions
→ fetch latest blockhash
→ set fee payer and validity window
→ sign
→ send
→ confirm with the same validity context
```

Do not generate signed bytes in one job and submit them much later in another unless using durable nonce semantics intentionally.

## Public snapshot pattern

When a demo consumes external service data:

1. Fetch through a secret-bearing server-side job.
2. Validate and normalise the response.
3. Remove tokens, wallet secrets, internal IDs, and unnecessary personal data.
4. Write a small public JSON snapshot.
5. Publish only that snapshot to Pages or static hosting.

Never call a secret-bearing provider directly from static browser JavaScript.

## Diagnostics artifact

Include:

- public address;
- redacted RPC host;
- genesis hash;
- confirmed balance;
- funding route;
- transaction signature;
- status/classification;
- timestamps;
- application snapshot metadata.

Exclude:

- keypair bytes;
- JWT/API tokens;
- full secret-bearing URLs;
- HTTP authorization headers;
- raw environment dumps.

## Scheduled workflows

Scheduled public-RPC jobs can share egress IP pools and hit rate limits.

- Stagger cron minutes.
- Use authenticated RPC for recurring production-like checks.
- Skip work when no data/state refresh is needed.
- Preserve the wallet identity across runs.
- Notify only on actionable state changes.

## Failure reporting

A useful CI failure names the layer:

```text
classification=faucet_rate_limited
rpc_health=ok
balance_lamports=0
state_restored=true
next_route=official_pow_faucet
```

A generic `Process completed with exit code 1` is not enough for an autonomous recovery agent.
