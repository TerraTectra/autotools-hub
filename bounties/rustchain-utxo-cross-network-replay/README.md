# RustChain UTXO cross-network signature replay

Security finding for RustChain bounty `Scottcjn/rustchain-bounties#2819`.

## Summary

RustChain documents two independent chains:

- `rustchain-mainnet-v2`
- `rustchain-testnet-v2`

The testnet runs the same node code and Ed25519 signing rules as mainnet, with a
separate genesis and database. However, the UTXO transfer signature payload uses
only the fixed domain string:

```text
rustchain-utxo-transfer-v1
```

It does not include `RC_CHAIN_ID`, a genesis identifier, or any other network
binding. Replay nonces are also stored independently in each chain database.

A transfer signed for testnet can therefore be submitted unchanged to mainnet
when the same public key/address has funds and the nonce has not been used there
(or in the opposite direction).

## Reproduction

Tested against `Scottcjn/Rustchain` current `main` on 17 July 2026.

```bash
git clone https://github.com/Scottcjn/Rustchain
python poc_cross_network_replay.py --repo ./Rustchain
```

The PoC creates two temporary isolated SQLite databases representing mainnet and
testnet. It generates one Ed25519 keypair, signs one canonical UTXO transfer
payload once, and submits the exact same request body and signature to both
Flask applications.

Observed result:

```json
{
  "signed_payload_contains_chain_id": false,
  "same_nonce": 7,
  "mainnet": {
    "chain_id": "rustchain-mainnet-v2",
    "status_code": 200,
    "accepted": true
  },
  "testnet": {
    "chain_id": "rustchain-testnet-v2",
    "status_code": 200,
    "accepted": true
  },
  "classification": "cross_network_signature_replay",
  "reproduced": true
}
```

No live endpoint is contacted.

## Root cause

`node/utxo_endpoints.py` reconstructs this signed object:

```python
{
    "domain": "rustchain-utxo-transfer-v1",
    "from": from_address,
    "to": to_address,
    "amount": amount,
    "fee": fee,
    "memo": memo,
    "nonce": nonce,
}
```

`register_utxo_blueprint()` does not receive a chain ID, and the signature
verification path never reads `RC_CHAIN_ID`.

The testnet deployment explicitly configures `RC_CHAIN_ID=rustchain-testnet-v2`
and uses a separate DB, while mainnet is documented as
`rustchain-mainnet-v2`. That separation protects consensus/miner messages that
bind the chain ID, but not this UTXO transfer payload.

## Impact

A testnet signature can authorize a real mainnet transfer if:

1. the user reuses the same RustChain key/address on both networks;
2. the signed nonce is still unused on mainnet;
3. an attacker obtains the signed testnet request (for example from a malicious
   testnet service/operator, client logs, browser instrumentation, or another
   system receiving the signed payload);
4. the mainnet address has enough UTXO balance.

The attacker does not need the private key and cannot alter recipient, amount,
fee, memo, or nonce. They only replay the already valid signed request on the
other chain. Because nonce tables are chain-local, using the nonce on testnet
does not consume it on mainnet.

This can cause unauthorized loss of real RTC and fits the bounty's **High**
category.

## Suggested fix

Version the UTXO signature domain and bind the canonical chain identifier:

```python
{
    "domain": "rustchain-utxo-transfer-v2",
    "chain_id": configured_chain_id,
    ...
}
```

Recommended migration:

1. Pass the configured `RC_CHAIN_ID` into `register_utxo_blueprint()`.
2. Require it in the signed canonical payload.
3. Update wallet clients to fetch/confirm the chain ID before signing.
4. Use a new signature-domain version rather than silently changing v1 bytes.
5. Allow v1 only behind an explicit, short migration deadline if compatibility
   is necessary.
6. Add a regression test with two isolated apps and assert that a signature for
   one chain returns `401` on the other.

Including a stable genesis hash in addition to the human-readable chain ID can
provide stronger accidental-misconfiguration protection.

## Evidence

- `poc_cross_network_replay.py` — local two-chain Ed25519 reproducer.
- `report.json` — sanitised independent CI result.
- Official testnet docs state that testnet uses the same node code/signing but a
  distinct `chain_id` and genesis.

## Builder

- GitHub: `TerraTectra`
- Telegram: `@tahioff`
- Communication: written only
