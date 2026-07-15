from __future__ import annotations

import json
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from reconcile import ExceptionRecord, Order, Payment, reconcile, write_outputs  # noqa: E402


class ReconcileTests(unittest.TestCase):
    def test_exact_payment_matches(self) -> None:
        results, exceptions = reconcile(
            [Order("O-1", "Synthetic Customer", Decimal("120.00"), "new")],
            [Payment("P-1", "O-1", Decimal("120.00"), "paid")],
        )
        self.assertEqual(results[0].outcome, "MATCHED")
        self.assertEqual(exceptions, [])

    def test_missing_payment_is_routed_to_exception_queue(self) -> None:
        results, exceptions = reconcile(
            [Order("O-2", "Synthetic Customer", Decimal("50.00"), "new")],
            [],
        )
        self.assertEqual(results[0].outcome, "MISSING_PAYMENT")
        self.assertEqual(exceptions[0].code, "MISSING_PAYMENT")

    def test_amount_mismatch_is_detected(self) -> None:
        results, exceptions = reconcile(
            [Order("O-3", "Synthetic Customer", Decimal("80.00"), "new")],
            [Payment("P-3", "O-3", Decimal("79.00"), "captured")],
        )
        self.assertEqual(results[0].outcome, "AMOUNT_MISMATCH")
        self.assertIn("expected 80.00", exceptions[0].details)

    def test_duplicate_successful_payments_are_detected(self) -> None:
        results, exceptions = reconcile(
            [Order("O-4", "Synthetic Customer", Decimal("30.00"), "new")],
            [
                Payment("P-4A", "O-4", Decimal("30.00"), "paid"),
                Payment("P-4B", "O-4", Decimal("30.00"), "succeeded"),
            ],
        )
        self.assertEqual(results[0].outcome, "DUPLICATE_PAYMENT")
        self.assertEqual(exceptions[0].code, "DUPLICATE_PAYMENT")

    def test_duplicate_orders_and_orphan_payment_are_reported(self) -> None:
        _, exceptions = reconcile(
            [
                Order("O-5", "Synthetic A", Decimal("10.00"), "new"),
                Order("O-5", "Synthetic B", Decimal("10.00"), "new"),
            ],
            [Payment("P-ORPHAN", "O-404", Decimal("12.00"), "paid")],
        )
        codes = [record.code for record in exceptions]
        self.assertEqual(codes, ["DUPLICATE_ORDER", "ORPHAN_PAYMENT"])

    def test_outputs_include_machine_readable_summary(self) -> None:
        results, exceptions = reconcile(
            [Order("O-6", "Synthetic Customer", Decimal("42.00"), "new")],
            [Payment("P-6", "O-6", Decimal("42.00"), "paid")],
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            summary = write_outputs(Path(temp_dir), results, exceptions)
            saved = json.loads((Path(temp_dir) / "summary.json").read_text(encoding="utf-8"))
            self.assertEqual(summary, saved)
            self.assertEqual(saved["matched"], 1)
            self.assertTrue((Path(temp_dir) / "reconciliation.csv").exists())
            self.assertTrue((Path(temp_dir) / "exceptions.csv").exists())


if __name__ == "__main__":
    unittest.main()
