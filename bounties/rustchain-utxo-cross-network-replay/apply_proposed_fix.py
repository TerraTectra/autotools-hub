#!/usr/bin/env python3
"""Apply the proposed chain-bound UTXO signature fix to a RustChain checkout."""

from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one {label} block, found {count}")
    return text.replace(old, new, 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    args = parser.parse_args()

    target = args.repo / "node" / "utxo_endpoints.py"
    text = target.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "import json\nimport sqlite3\n",
        "import json\nimport os\nimport sqlite3\n",
        "import",
    )
    text = replace_once(
        text,
        'UTXO_SIGNATURE_DOMAIN = "rustchain-utxo-transfer-v1"\n',
        'UTXO_SIGNATURE_DOMAIN = "rustchain-utxo-transfer-v2"\n'
        '_DEFAULT_CHAIN_ID = "rustchain-mainnet-v2"\n',
        "signature domain",
    )
    text = replace_once(
        text,
        "_current_slot_fn = None    # current_slot() -> int\n"
        "_dual_write: bool = False\n",
        "_current_slot_fn = None    # current_slot() -> int\n"
        "_dual_write: bool = False\n"
        "_chain_id: str = _DEFAULT_CHAIN_ID\n",
        "global dependencies",
    )

    old_registration = '''def register_utxo_blueprint(app, utxo_db: UtxoDB, db_path: str,
                            verify_sig_fn, addr_from_pk_fn,
                            current_slot_fn, dual_write: bool = False):
    """
    Wire up the UTXO blueprint with dependencies from the main server.
    Call this after init_db().
    """
    global _utxo_db, _db_path, _verify_sig_fn, _addr_from_pk_fn
    global _current_slot_fn, _dual_write

    _utxo_db = utxo_db
    _db_path = db_path
    _verify_sig_fn = verify_sig_fn
    _addr_from_pk_fn = addr_from_pk_fn
    _current_slot_fn = current_slot_fn
    _dual_write = dual_write

    conn = sqlite3.connect(db_path)
'''
    new_registration = '''def register_utxo_blueprint(app, utxo_db: UtxoDB, db_path: str,
                            verify_sig_fn, addr_from_pk_fn,
                            current_slot_fn, dual_write: bool = False,
                            chain_id: str = None):
    """
    Wire up the UTXO blueprint with dependencies from the main server.
    Call this after init_db().

    chain_id binds wallet signatures to one RustChain network. Operators may
    pass it explicitly; otherwise the node's RC_CHAIN_ID is used. Mainnet is
    the compatibility default for deployments that predate RC_CHAIN_ID.
    """
    global _utxo_db, _db_path, _verify_sig_fn, _addr_from_pk_fn
    global _current_slot_fn, _dual_write, _chain_id

    _utxo_db = utxo_db
    _db_path = db_path
    _verify_sig_fn = verify_sig_fn
    _addr_from_pk_fn = addr_from_pk_fn
    _current_slot_fn = current_slot_fn
    _dual_write = dual_write
    resolved_chain_id = chain_id or os.environ.get(
        'RC_CHAIN_ID', _DEFAULT_CHAIN_ID
    )
    if not isinstance(resolved_chain_id, str) or not resolved_chain_id.strip():
        raise ValueError('chain_id must be a non-empty string')
    _chain_id = resolved_chain_id.strip()

    conn = sqlite3.connect(db_path)
'''
    text = replace_once(
        text,
        old_registration,
        new_registration,
        "blueprint registration",
    )
    text = replace_once(
        text,
        "    app.register_blueprint(utxo_bp)\n"
        "    print(f\"[UTXO] Endpoints registered at /utxo/* "
        "(dual_write={'ON' if dual_write else 'OFF'})\")\n",
        "    app.register_blueprint(utxo_bp)\n"
        "    print(\n"
        "        f\"[UTXO] Endpoints registered at /utxo/* \"\n"
        "        f\"(dual_write={'ON' if dual_write else 'OFF'}, \"\n"
        "        f\"chain_id={_chain_id})\"\n"
        "    )\n",
        "registration log",
    )
    text = replace_once(
        text,
        "        tx_data_v2 = {\n"
        "            'domain': UTXO_SIGNATURE_DOMAIN,\n"
        "            'from': from_address,\n",
        "        tx_data_v2 = {\n"
        "            'domain': UTXO_SIGNATURE_DOMAIN,\n"
        "            'chain_id': _chain_id,\n"
        "            'from': from_address,\n",
        "signed payload",
    )
    text = replace_once(
        text,
        "                'domain': UTXO_SIGNATURE_DOMAIN,\n"
        "            }), 401\n",
        "                'domain': UTXO_SIGNATURE_DOMAIN,\n"
        "                'chain_id': _chain_id,\n"
        "            }), 401\n",
        "signature error response",
    )

    target.write_text(text, encoding="utf-8")
    print(f"Updated {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
