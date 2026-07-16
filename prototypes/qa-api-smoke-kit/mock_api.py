"""Deterministic local API used by the QA portfolio smoke tests."""

from __future__ import annotations

import json
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse


class MockApiHandler(BaseHTTPRequestHandler):
    orders: dict[int, dict[str, Any]] = {}
    next_order_id: int = 1

    def log_message(self, _format: str, *args: object) -> None:
        """Keep CI output focused on test results."""

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Request-Id", str(uuid.uuid4()))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> tuple[dict[str, Any] | None, str | None]:
        if self.headers.get_content_type() != "application/json":
            return None, "content_type"

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None, "invalid_json"

        try:
            value = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None, "invalid_json"

        if not isinstance(value, dict):
            return None, "invalid_json"
        return value, None

    @staticmethod
    def _validate_order(payload: dict[str, Any]) -> list[dict[str, str]]:
        errors: list[dict[str, str]] = []
        email = payload.get("customer_email")
        amount = payload.get("amount")

        if not isinstance(email, str) or "@" not in email:
            errors.append({"field": "customer_email", "message": "valid email is required"})
        if isinstance(amount, bool) or not isinstance(amount, (int, float)) or amount <= 0:
            errors.append({"field": "amount", "message": "positive number is required"})
        return errors

    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        path = urlparse(self.path).path
        if path == "/health":
            self._send_json(200, {"status": "ok"})
            return

        prefix = "/api/v1/orders/"
        if path.startswith(prefix):
            raw_id = path.removeprefix(prefix)
            if not raw_id.isdigit():
                self._send_json(404, {"error": "not_found"})
                return
            order = self.orders.get(int(raw_id))
            if order is None:
                self._send_json(404, {"error": "order_not_found"})
                return
            self._send_json(200, order)
            return

        self._send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if urlparse(self.path).path != "/api/v1/orders":
            self._send_json(404, {"error": "not_found"})
            return

        payload, read_error = self._read_json()
        if read_error == "content_type":
            self._send_json(415, {"error": "unsupported_media_type"})
            return
        if read_error is not None or payload is None:
            self._send_json(400, {"error": "invalid_json"})
            return

        validation_errors = self._validate_order(payload)
        if validation_errors:
            self._send_json(422, {"error": "validation_error", "details": validation_errors})
            return

        order_id = self.next_order_id
        type(self).next_order_id += 1
        order = {
            "id": order_id,
            "customer_email": payload["customer_email"],
            "amount": payload["amount"],
            "status": "created",
        }
        type(self).orders[order_id] = order
        self._send_json(201, order)


def build_server(host: str = "127.0.0.1", port: int = 0) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), MockApiHandler)


if __name__ == "__main__":
    server = build_server(port=8080)
    print("Mock QA API listening on http://127.0.0.1:8080")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
