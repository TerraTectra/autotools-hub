#!/usr/bin/env python3
"""Regression test for the proposed chain-bound UTXO signature format."""

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
    parser.add_argument("--repo", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    node_dir = (args.repo / "node").resolve()
    endpoints_path = node_dir / "utxo_endpoints.py"
    sys.path.insert(0, str(node_dir))

    from utxo_db import (  # pylint: disable=import-error,import-outside-toplevel
        UNIT,
        UtxoDB,
        address_to_proposition,
        compute_box_id,
    )

    signing_key = SigningKey.generate()
    public_key_hex = signing_key.verify_key.encode().hex()

    def address_from_public_key(public_key: str) -> str:
        digest = hashlib.sha256(bytes.fromhex(public_key)).hexdigest()
        return "RTC" + digest[:40]

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

    from_address = address_from_public_key(public_key_hex)
    to_address = "RTC" + "c" * 40
    amount = 1.0
    fee = 0.0
    memo = "chain-bound-regression"
    nonce = 11

    def sign(chain_id: str) -> str:
        payload = {
            "domain": "rustchain-utxo-transfer-v2",
            "chain_id": chain_id,
            "from": from_address,
            "to": to_address,
            "amount": amount,
            "fee": fee,
            "memo": memo,
            "nonce": nonce,
        }
        message = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        return signing_key.sign(message).signature.hex()

    def request_body(signature: str) -> dict:
        return {
            "from_address": from_address,
            "to_address": to_address,
            "amount_rtc": amount,
            "fee_rtc": fee,
            "public_key": public_key_hex,
            "signature": signature,
            "nonce": nonce,
            "memo": memo,
        }

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

    def build_chain(chain_id: str, slot: int, directory: Path):
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
            chain_id=chain_id,
        )
        return app.test_client(), database

    mainnet_chain_id = "rustchain-mainnet-v2"
    testnet_chain_id = "rustchain-testnet-v2"
    mainnet_signature = sign(mainnet_chain_id)
    testnet_signature = sign(testnet_chain_id)

    with tempfile.TemporaryDirectory() as temp_dir:
        directory = Path(temp_dir)
        mainnet_client, mainnet_database = build_chain(
            mainnet_chain_id,
            101,
            directory,
        )
        testnet_client, testnet_database = build_chain(
            testnet_chain_id,
            202,
            directory,
        )

        accepted_mainnet = mainnet_client.post(
            "/utxo/transfer",
            json=request_body(mainnet_signature),
        )
        rejected_testnet = testnet_client.post(
            "/utxo/transfer",
            json=request_body(mainnet_signature),
        )
        accepted_testnet = testnet_client.post(
            "/utxo/transfer",
            json=request_body(testnet_signature),
        )

        assert accepted_mainnet.status_code == 200, accepted_mainnet.get_json()
        assert rejected_testnet.status_code == 401, rejected_testnet.get_json()
        assert accepted_testnet.status_code == 200, accepted_testnet.get_json()
        assert mainnet_database.get_balance(to_address) == UNIT
        assert testnet_database.get_balance(to_address) == UNIT

    print("RustChain chain-bound signature regression passed")
    print("mainnet signature accepted on mainnet: true")
    print("mainnet signature rejected on testnet: true")
    print("testnet signature accepted on testnet: true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
