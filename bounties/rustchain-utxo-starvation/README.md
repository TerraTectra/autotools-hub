# RustChain UTXO mempool candidate starvation

Security finding for RustChain bounty `Scottcjn/rustchain-bounties#2819`.

## Summary

`UtxoDB.mempool_get_block_candidates(max_count)` reads only
`max_count * MAX_MEMPOOL_CANDIDATE_SCAN_FACTOR` rows before resolving
cross-transaction spend/data-input conflicts.

An attacker can fill that bounded fee-ordered window with transactions that are
valid at admission time but become mutually incompatible during block-template
selection. The selector skips the conflicts and stops at the end of the fixed
window instead of continuing to lower-fee compatible transactions.

Result: valid transactions beyond the window are starved from the block
template even when the requested candidate count has not been reached.

## Reproduction

Tested against `Scottcjn/Rustchain` current `main` on 17 July 2026.

```bash
git clone https://github.com/Scottcjn/Rustchain
python poc_candidate_scan_starvation.py --repo ./Rustchain
```

The PoC uses a temporary SQLite database only. It never contacts or mutates the
live RustChain network.

Observed result with `max_count=2` and scan factor `4`:

```json
{
  "scan_window": 8,
  "candidate_count_before": 1,
  "candidate_count_after_control": 2,
  "classification": "bounded_candidate_scan_starvation",
  "reproduced": true
}
```

## Attack construction

1. Submit one highest-fee anchor transaction spending box `A`.
2. Fill the rest of the bounded scan window with individually valid
   transactions. Each spends a unique box but references `A` as a read-only
   `data_input`.
3. Put ordinary valid lower-fee transactions immediately after the window.
4. Candidate selection chooses the anchor.
5. Every remaining row in the window is skipped because its `data_input`
   intersects the anchor's selected spend.
6. The query is not continued, so ordinary transactions below the window are
   never considered.

The control phase removes only the conflicting mempool rows. Without changing
ledger state, candidate selection immediately fills the requested count,
proving that compatible transactions were available but hidden by the fixed
scan window.

## Impact

With the production defaults (`max_count=100`, scan factor `4`), 400
fee-ordered rows can reduce a nominal 100-transaction template to one selected
transaction. The relative fees can be tiny; only the anchor is included and
pays its fee. An attacker with a fragmented wallet can repeat the pattern with a
new anchor after each block.

This is a mempool throughput/censorship DoS and fits the bounty's **Medium**
category.

## Root cause

The selector applies a fixed SQL `LIMIT` before it knows how many rows will be
skipped by conflict resolution:

```python
scan_limit = min(
    MAX_POOL_SIZE,
    max_count * MAX_MEMPOOL_CANDIDATE_SCAN_FACTOR,
)
```

The subsequent loop never fetches another page after skipped rows exhaust that
window.

## Validated fix

The included fix continues deterministic keyset-paginated scanning until:

- `max_count` compatible candidates have been selected;
- the mempool is exhausted; or
- `MAX_POOL_SIZE` rows have been examined.

The ordering cursor is:

```text
fee_nrtc DESC, submitted_at ASC, tx_id ASC
```

This preserves the fee-first policy while preventing one conflict cluster from
monopolising the only scan window.

Apply the generated patch:

```bash
cd Rustchain
git apply /path/to/rustchain-utxo-starvation/proposed_fix.patch
python -m py_compile node/utxo_db.py
python node/test_utxo_db.py
python /path/to/rustchain-utxo-starvation/test_proposed_fix.py --repo .
```

Alternatively, the defensive transformer checks that the vulnerable function
still has the expected shape before editing:

```bash
python apply_proposed_fix.py --repo ./Rustchain
```

Independent validation against current upstream `main` passed all stages:

```json
{
  "apply_patch": "success",
  "module_compile": "success",
  "upstream_utxo_tests": "success",
  "starvation_regression": "success",
  "validated": true
}
```

## Evidence

- `poc_candidate_scan_starvation.py` — standalone local reproducer.
- `report.json` — sanitised vulnerability reproduction result.
- `proposed_fix.patch` — generated, directly applicable validated patch.
- `apply_proposed_fix.py` — defensive source transformer.
- `test_proposed_fix.py` — focused regression test.
- Independent CI checked out upstream `main`, compiled the patched module,
  passed the upstream UTXO DB tests, and passed the new regression.

## Builder

- GitHub: `TerraTectra`
- Telegram: `@tahioff`
- Communication: written only
