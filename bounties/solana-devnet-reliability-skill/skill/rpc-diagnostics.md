# RPC Diagnostics

Diagnose the network path before modifying wallet state or application code.

## Minimum read-only probe

Run these JSON-RPC methods against the selected endpoint:

1. `getGenesisHash`
2. `getHealth`
3. `getVersion`
4. `getLatestBlockhash`
5. `getBalance` for the payer public key

The bundled doctor performs the same sequence and redacts credentials embedded in the RPC URL.

## Cluster identity

A hostname containing `devnet` is not sufficient proof of cluster identity. Compare `getGenesisHash` with the expected devnet genesis hash used by current Solana tooling. If the endpoint reports a different cluster, stop before signing.

Do not automatically rewrite program IDs, token mints, or account addresses to compensate for a wrong RPC endpoint.

## Error classification

### HTTP 429

Meaning: the gateway, RPC, or faucet is rate limiting the caller. The limit may be per IP, account, method, or time window.

Actions:

- stop immediate retries;
- record `Retry-After` when present;
- distinguish RPC `getBalance` rate limits from faucet `requestAirdrop` rate limits;
- preserve the same wallet;
- move to an authenticated provider or another approved funding route.

Reducing an airdrop from 1 SOL to 0.01 SOL does not necessarily help an IP-level limit.

### HTTP 401/403

Meaning: authentication, policy, CAPTCHA, allow-list, or plan restrictions.

Actions:

- inspect response text without logging tokens;
- do not spoof headers or defeat access controls;
- use the official human flow or documented agent flow;
- verify that the requested method is available on the selected provider plan.

### HTTP 5xx / connection timeout

Meaning: upstream outage, overloaded RPC, DNS/TLS path, or transient gateway failure.

Actions:

- retry once with bounded exponential backoff;
- test a read-only method on another documented devnet RPC;
- prefer an authenticated provider for CI;
- do not submit the same signed transaction blindly across multiple endpoints.

### JSON-RPC `Blockhash not found`

Meaning: the blockhash expired or belongs to another cluster/fork.

Actions:

- fetch a new blockhash;
- rebuild and re-sign the transaction;
- send promptly;
- confirm using `{ signature, blockhash, lastValidBlockHeight }`.

### Simulation error

Meaning: the network path is working and the transaction reached runtime checks.

Actions:

- read simulation logs;
- confirm payer balance and account ownership;
- inspect instruction data, account order, program ID, rent, and compute;
- move out of infrastructure recovery into application debugging.

## Recommended diagnostic record

```json
{
  "cluster": "devnet",
  "rpcHost": "api.devnet.solana.com",
  "genesisHash": "<hash>",
  "health": "ok",
  "solanaCore": "<version>",
  "address": "<public key>",
  "balanceLamports": 0,
  "latestBlockhashAvailable": true,
  "classification": "faucet_rate_limited",
  "httpStatus": 429,
  "timestamp": "<ISO-8601>"
}
```

Never include query-string API keys, bearer tokens, keypair arrays, seed phrases, or artifact URLs.

## Bounded retry policy

- Read-only RPC timeout: at most two attempts per endpoint.
- Faucet 429/403: no automatic repeated loop.
- Transaction submission: retry only after determining whether the original signature landed.
- Blockhash expiry: rebuild rather than resend old bytes.

## Provider rotation

Rotate endpoints only when:

- the target cluster is confirmed;
- the provider permits the method;
- credentials are available through a secret store;
- application state assumptions remain valid.

Do not maintain a giant unaudited list of free RPC URLs. A short project-approved list is safer and easier to observe.
