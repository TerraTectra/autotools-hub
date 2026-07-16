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
3. an attacker obtains the signed testnet request;
4. the mainnet address has enough UTXO balance.

The attacker does not need the private key and cannot alter recipient, amount,
fee, memo, or nonce. They replay the already valid signed request on the other
chain. Because nonce tables are chain-local, using the nonce on testnet does not
consume it on mainnet.

This can cause unauthorized loss of real RTC and fits the bounty's **High**
category.

## Validated fix

The included patch introduces the versioned domain
`rustchain-utxo-transfer-v2` and adds the configured chain ID to the canonical
signed payload:

```python
{
    "domain": "rustchain-utxo-transfer-v2",
    "chain_id": configured_chain_id,
    ...
}
```

`register_utxo_blueprint()` accepts an appended optional `chain_id` argument and
otherwise resolves `RC_CHAIN_ID`, retaining the existing mainnet identifier as
a deployment compatibility default.

Apply and verify:

```bash
cd Rustchain
git apply /path/to/rustchain-utxo-cross-network-replay/proposed_fix.patch
python -m py_compile node/utxo_endpoints.py
python /path/to/rustchain-utxo-cross-network-replay/test_proposed_fix.py --repo .
```

The defensive transformer can be used instead of `git apply` and aborts if the
expected upstream blocks have changed:

```bash
python apply_proposed_fix.py --repo ./Rustchain
```

Independent validation against current upstream `main` passed every stage:

```json
{
  "dependencies": "success",
  "apply_patch": "success",
  "module_compile": "success",
  "cross_network_regression": "success",
  "validated": true
}
```

The regression proves:

- a mainnet-v2 signature is accepted on mainnet-v2;
- the exact same signature returns HTTP `401` on testnet-v2;
- a separately signed testnet-v2 request is accepted on testnet-v2.

A stable genesis hash could additionally strengthen protection against an
accidentally duplicated human-readable chain ID.

## Evidence

- `poc_cross_network_replay.py` — local two-chain Ed25519 reproducer.
- `report.json` — sanitised vulnerability reproduction result.
- `proposed_fix.patch` — generated, directly applicable validated patch.
- `apply_proposed_fix.py` — defensive source transformer.
- `test_proposed_fix.py` — two-chain rejection regression.
- Official testnet docs state that testnet uses the same node code/signing but a
  distinct `chain_id` and genesis.

## Builder

- GitHub: `TerraTectra`
- Telegram: `@tahioff`
- Communication: written only
