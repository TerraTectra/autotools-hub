from __future__ import annotations

import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from mock_api import MockApiHandler, build_server


class ApiSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = build_server()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_address[1]}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self) -> None:
        MockApiHandler.orders = {}
        MockApiHandler.next_order_id = 1

    def request(
        self,
        method: str,
        path: str,
        payload: object | None = None,
        content_type: str = "application/json",
    ) -> tuple[int, dict[str, str], dict[str, object]]:
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={"Content-Type": content_type},
        )
        try:
            response = urlopen(request, timeout=3)
            status = response.status
        except HTTPError as error:
            response = error
            status = error.code

        headers = {key.lower(): value for key, value in response.headers.items()}
        body = json.loads(response.read().decode("utf-8"))
        response.close()
        return status, headers, body

    def test_health_contract(self) -> None:
        status, headers, body = self.request("GET", "/health")
        self.assertEqual(200, status)
        self.assertEqual({"status": "ok"}, body)
        self.assertTrue(headers["content-type"].startswith("application/json"))
        self.assertTrue(headers["x-request-id"])

    def test_create_and_read_order(self) -> None:
        status, _, created = self.request(
            "POST",
            "/api/v1/orders",
            {"customer_email": "qa@example.com", "amount": 1490.5},
        )
        self.assertEqual(201, status)
        self.assertEqual(1, created["id"])
        self.assertEqual("created", created["status"])

        status, _, fetched = self.request("GET", "/api/v1/orders/1")
        self.assertEqual(200, status)
        self.assertEqual(created, fetched)

    def test_rejects_missing_required_field(self) -> None:
        status, _, body = self.request("POST", "/api/v1/orders", {"amount": 100})
        self.assertEqual(422, status)
        self.assertEqual("validation_error", body["error"])
        self.assertEqual("customer_email", body["details"][0]["field"])

    def test_rejects_non_positive_amount(self) -> None:
        for amount in (0, -1, True):
            with self.subTest(amount=amount):
                status, _, body = self.request(
                    "POST",
                    "/api/v1/orders",
                    {"customer_email": "qa@example.com", "amount": amount},
                )
                self.assertEqual(422, status)
                self.assertEqual("amount", body["details"][0]["field"])

    def test_rejects_wrong_content_type(self) -> None:
        status, _, body = self.request(
            "POST",
            "/api/v1/orders",
            {"customer_email": "qa@example.com", "amount": 100},
            content_type="text/plain",
        )
        self.assertEqual(415, status)
        self.assertEqual("unsupported_media_type", body["error"])

    def test_rejects_invalid_json(self) -> None:
        request = Request(
            f"{self.base_url}/api/v1/orders",
            data=b"{broken",
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with self.assertRaises(HTTPError) as context:
            urlopen(request, timeout=3)
        self.assertEqual(400, context.exception.code)
        body = json.loads(context.exception.read().decode("utf-8"))
        self.assertEqual("invalid_json", body["error"])

    def test_unknown_order_and_route_return_404(self) -> None:
        for path, expected_error in (
            ("/api/v1/orders/999", "order_not_found"),
            ("/missing", "not_found"),
        ):
            with self.subTest(path=path):
                status, _, body = self.request("GET", path)
                self.assertEqual(404, status)
                self.assertEqual(expected_error, body["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
