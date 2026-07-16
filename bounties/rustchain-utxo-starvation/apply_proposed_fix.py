#!/usr/bin/env python3
"""Apply the proposed mempool candidate pagination fix to a RustChain checkout."""

from __future__ import annotations

import argparse
from pathlib import Path


NEW_FUNCTION = '''    def mempool_get_block_candidates(self, max_count: int = 100) -> List[dict]:
        """Get highest-fee compatible transactions for block inclusion.

        Candidate conflicts are resolved while paging through a deterministic
        fee order. This prevents a conflict-heavy first page from starving
        compatible transactions below a fixed pre-filter scan window, while the
        total work remains bounded by MAX_POOL_SIZE.
        """
        self.mempool_clear_expired()
        if max_count <= 0:
            return []
        conn = self._conn()
        try:
            now = int(time.time())
            page_size = min(
                MAX_POOL_SIZE,
                max_count * MAX_MEMPOOL_CANDIDATE_SCAN_FACTOR,
            )
            candidates = []
            stale_tx_ids = []
            selected_spend_inputs = set()
            selected_data_inputs = set()
            scanned = 0
            cursor = None

            while len(candidates) < max_count and scanned < MAX_POOL_SIZE:
                limit = min(page_size, MAX_POOL_SIZE - scanned)
                if cursor is None:
                    rows = conn.execute(
                        """SELECT tx_id, tx_data_json, fee_nrtc, submitted_at
                           FROM utxo_mempool
                           WHERE expires_at > ?
                           ORDER BY fee_nrtc DESC, submitted_at ASC, tx_id ASC
                           LIMIT ?
                        """,
                        (now, limit),
                    ).fetchall()
                else:
                    fee_nrtc, submitted_at, cursor_tx_id = cursor
                    rows = conn.execute(
                        """SELECT tx_id, tx_data_json, fee_nrtc, submitted_at
                           FROM utxo_mempool
                           WHERE expires_at > ?
                             AND (
                               fee_nrtc < ?
                               OR (
                                 fee_nrtc = ?
                                 AND (
                                   submitted_at > ?
                                   OR (submitted_at = ? AND tx_id > ?)
                                 )
                               )
                             )
                           ORDER BY fee_nrtc DESC, submitted_at ASC, tx_id ASC
                           LIMIT ?
                        """,
                        (
                            now,
                            fee_nrtc,
                            fee_nrtc,
                            submitted_at,
                            submitted_at,
                            cursor_tx_id,
                            limit,
                        ),
                    ).fetchall()

                if not rows:
                    break

                scanned += len(rows)
                last_row = rows[-1]
                cursor = (
                    last_row['fee_nrtc'],
                    last_row['submitted_at'],
                    last_row['tx_id'],
                )

                for row in rows:
                    tx_id = row['tx_id']
                    try:
                        tx = json.loads(row['tx_data_json'])
                        input_ids = [
                            inp['box_id'] for inp in tx.get('inputs', [])
                        ]
                        data_inputs = self._normalize_data_inputs(
                            tx.get('data_inputs', [])
                        )
                    except Exception:
                        stale_tx_ids.append(tx_id)
                        continue

                    if not input_ids or data_inputs is None:
                        stale_tx_ids.append(tx_id)
                        continue

                    stale = False
                    for box_ids in (input_ids, data_inputs):
                        if not box_ids:
                            continue
                        placeholders = ",".join("?" for _ in box_ids)
                        unspent_count = conn.execute(
                            f"""SELECT COUNT(*) AS n FROM utxo_boxes
                                WHERE box_id IN ({placeholders})
                                  AND spent_at IS NULL""",
                            box_ids,
                        ).fetchone()['n']
                        if unspent_count != len(set(box_ids)):
                            stale_tx_ids.append(tx_id)
                            stale = True
                            break
                    if stale:
                        continue

                    input_set = set(input_ids)
                    data_input_set = set(data_inputs)
                    # Data inputs are read-only witnesses: they may be reused by
                    # multiple candidates. Reject only spend/spend or
                    # spend/witness conflicts across the selected set.
                    if (
                        input_set & selected_spend_inputs
                        or input_set & selected_data_inputs
                        or data_input_set & selected_spend_inputs
                    ):
                        continue

                    candidates.append(tx)
                    selected_spend_inputs.update(input_set)
                    selected_data_inputs.update(data_input_set)
                    if len(candidates) >= max_count:
                        break

                if len(rows) < limit:
                    break

            for tx_id in stale_tx_ids:
                conn.execute(
                    "DELETE FROM utxo_mempool_inputs WHERE tx_id = ?", (tx_id,)
                )
                conn.execute(
                    "DELETE FROM utxo_mempool WHERE tx_id = ?", (tx_id,)
                )
            if stale_tx_ids:
                conn.commit()

            return candidates
        finally:
            conn.close()
'''


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    args = parser.parse_args()

    target = args.repo / "node" / "utxo_db.py"
    text = target.read_text(encoding="utf-8")
    start_marker = "    def mempool_get_block_candidates("
    end_marker = "\n    def mempool_clear_expired("
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit("mempool_get_block_candidates() not found")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit("mempool_clear_expired() boundary not found")

    current = text[start:end]
    if "scan_limit = min(" not in current:
        raise SystemExit(
            "upstream candidate selector no longer matches the vulnerable shape"
        )

    target.write_text(
        text[:start] + NEW_FUNCTION.rstrip() + "\n" + text[end:],
        encoding="utf-8",
    )
    print(f"Updated {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
