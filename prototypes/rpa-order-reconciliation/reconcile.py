#!/usr/bin/env python3
"""Deterministic order/payment reconciliation robot.

Uses only the Python standard library so it can run in a clean worker,
container or an RPA orchestration step without dependency installation.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable, Sequence


SUCCESSFUL_PAYMENT_STATUSES = {"paid", "captured", "succeeded"}


@dataclass(frozen=True)
class Order:
    order_id: str
    customer: str
    amount: Decimal
    status: str


@dataclass(frozen=True)
class Payment:
    payment_id: str
    order_id: str
    amount: Decimal
    status: str


@dataclass(frozen=True)
class Result:
    order_id: str
    order_amount: str
    paid_amount: str
    outcome: str
    details: str


@dataclass(frozen=True)
class ExceptionRecord:
    code: str
    entity_id: str
    details: str


def _required(row: dict[str, str], field: str, row_number: int) -> str:
    value = (row.get(field) or "").strip()
    if not value:
        raise ValueError(f"row {row_number}: missing required field '{field}'")
    return value


def _money(value: str, field: str, row_number: int) -> Decimal:
    try:
        parsed = Decimal(value.replace(",", ".")).quantize(Decimal("0.01"))
    except (InvalidOperation, AttributeError) as exc:
        raise ValueError(f"row {row_number}: invalid money in '{field}'") from exc
    if parsed < 0:
        raise ValueError(f"row {row_number}: negative money in '{field}'")
    return parsed


def read_orders(path: Path) -> list[Order]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"order_id", "customer", "amount", "status"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"orders file must contain columns: {', '.join(sorted(required))}")
        return [
            Order(
                order_id=_required(row, "order_id", number),
                customer=_required(row, "customer", number),
                amount=_money(_required(row, "amount", number), "amount", number),
                status=_required(row, "status", number).lower(),
            )
            for number, row in enumerate(reader, start=2)
        ]


def read_payments(path: Path) -> list[Payment]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"payment_id", "order_id", "amount", "status"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"payments file must contain columns: {', '.join(sorted(required))}")
        return [
            Payment(
                payment_id=_required(row, "payment_id", number),
                order_id=_required(row, "order_id", number),
                amount=_money(_required(row, "amount", number), "amount", number),
                status=_required(row, "status", number).lower(),
            )
            for number, row in enumerate(reader, start=2)
        ]


def reconcile(orders: Sequence[Order], payments: Sequence[Payment]) -> tuple[list[Result], list[ExceptionRecord]]:
    """Reconcile orders against successful payments.

    Business exceptions are returned as records instead of raising, allowing an
    orchestrator to route them to a human queue while completing the batch.
    """

    results: list[Result] = []
    exceptions: list[ExceptionRecord] = []

    order_counts = Counter(order.order_id for order in orders)
    unique_orders: dict[str, Order] = {}
    for order in orders:
        if order_counts[order.order_id] > 1:
            continue
        unique_orders[order.order_id] = order

    for order_id, count in sorted(order_counts.items()):
        if count > 1:
            exceptions.append(
                ExceptionRecord("DUPLICATE_ORDER", order_id, f"found {count} order rows")
            )

    successful_by_order: dict[str, list[Payment]] = defaultdict(list)
    for payment in payments:
        if payment.status in SUCCESSFUL_PAYMENT_STATUSES:
            successful_by_order[payment.order_id].append(payment)

    for order_id in sorted(unique_orders):
        order = unique_orders[order_id]
        matched_payments = successful_by_order.get(order_id, [])
        paid_amount = sum((payment.amount for payment in matched_payments), Decimal("0.00"))

        if not matched_payments:
            outcome = "MISSING_PAYMENT"
            details = "no successful payment found"
            exceptions.append(ExceptionRecord(outcome, order_id, details))
        elif len(matched_payments) > 1:
            outcome = "DUPLICATE_PAYMENT"
            details = f"found {len(matched_payments)} successful payments"
            exceptions.append(ExceptionRecord(outcome, order_id, details))
        elif paid_amount != order.amount:
            outcome = "AMOUNT_MISMATCH"
            details = f"expected {order.amount:.2f}, received {paid_amount:.2f}"
            exceptions.append(ExceptionRecord(outcome, order_id, details))
        else:
            outcome = "MATCHED"
            details = "order and successful payment match"

        results.append(
            Result(
                order_id=order_id,
                order_amount=f"{order.amount:.2f}",
                paid_amount=f"{paid_amount:.2f}",
                outcome=outcome,
                details=details,
            )
        )

    known_order_ids = set(order_counts)
    for order_id, matched_payments in sorted(successful_by_order.items()):
        if order_id not in known_order_ids:
            for payment in matched_payments:
                exceptions.append(
                    ExceptionRecord(
                        "ORPHAN_PAYMENT",
                        payment.payment_id,
                        f"successful payment references unknown order {order_id}",
                    )
                )

    return results, exceptions


def _write_csv(path: Path, records: Iterable[object], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for record in records:
            writer.writerow(asdict(record))


def write_outputs(output_dir: Path, results: list[Result], exceptions: list[ExceptionRecord]) -> dict[str, object]:
    _write_csv(
        output_dir / "reconciliation.csv",
        results,
        ["order_id", "order_amount", "paid_amount", "outcome", "details"],
    )
    _write_csv(
        output_dir / "exceptions.csv",
        exceptions,
        ["code", "entity_id", "details"],
    )

    outcome_counts = Counter(result.outcome for result in results)
    exception_counts = Counter(record.code for record in exceptions)
    summary: dict[str, object] = {
        "orders_processed": len(results),
        "matched": outcome_counts.get("MATCHED", 0),
        "business_exceptions": len(exceptions),
        "outcomes": dict(sorted(outcome_counts.items())),
        "exception_codes": dict(sorted(exception_counts.items())),
    }
    (output_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Reconcile orders with successful payments")
    parser.add_argument("--orders", type=Path, required=True, help="orders CSV path")
    parser.add_argument("--payments", type=Path, required=True, help="payments CSV path")
    parser.add_argument("--output", type=Path, required=True, help="output directory")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        orders = read_orders(args.orders)
        payments = read_payments(args.payments)
        results, exceptions = reconcile(orders, payments)
        summary = write_outputs(args.output, results, exceptions)
    except (OSError, ValueError) as exc:
        print(f"robot failed: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
