#!/usr/bin/env python3
"""Regression test for proposed mempool candidate pagination fix."""

from __future__ import annotations

import argparse
import hashlib
import sys
import tempfile
import time
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--max-count", type=int, default=2)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    node_dir = (args.repo / "node").resolve()
    sys.path.insert(0, str(node_dir))

    from utxo_db import (  # pylint: disable=import-error,import-outside-toplevel
        MAX_MEMPOOL_CANDIDATE_SCAN_FACTOR,
        UtxoDB,
        address_to_proposition,
        compute_box_id,
    )

    box_value = 1_000_000
    window = args.max_count * MAX_MEMPOOL_CANDIDATE_SCAN_FACTOR

    with tempfile.TemporaryDirectory() as temporary_directory:
        database = UtxoDB(str(Path(temporary_directory) / "node.db"))
        database.init_tables()

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
            database.add_box(
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
            assert database.mempool_add(transaction), label
            return transaction_id

        anchor_box = seed_box("anchor")
        anchor_transaction = add_transaction("anchor", anchor_box, 10_000)

        for index in range(window - 1):
            add_transaction(
                f"conflict-{index}",
                seed_box(f"conflict-{index}"),
                9_999 - index,
                data_inputs=[anchor_box],
            )

        compatible_transaction_ids = []
        for index in range(args.max_count):
            compatible_transaction_ids.append(
                add_transaction(
                    f"compatible-{index}",
                    seed_box(f"compatible-{index}"),
                    max(0, args.max_count - index - 1),
                )
            )

        candidates = database.mempool_get_block_candidates(args.max_count)
        candidate_ids = [transaction["tx_id"] for transaction in candidates]

        assert len(candidate_ids) == args.max_count, candidate_ids
        assert anchor_transaction in candidate_ids, candidate_ids
        assert any(
            transaction_id in candidate_ids
            for transaction_id in compatible_transaction_ids
        ), candidate_ids

        print("RustChain candidate pagination regression passed")
        print(f"max_count={args.max_count}")
        print(f"scan_window={window}")
        print(f"candidate_ids={candidate_ids}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
