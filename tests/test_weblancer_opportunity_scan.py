from __future__ import annotations

import importlib.util
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "weblancer_opportunity_scan.py"
SPEC = importlib.util.spec_from_file_location("weblancer_opportunity_scan", MODULE_PATH)
assert SPEC and SPEC.loader
SCAN = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SCAN
SPEC.loader.exec_module(SCAN)

NOW = datetime(2026, 7, 16, tzinfo=timezone.utc)


def card_html(
    *,
    title: str = "Python Telegram bot with API",
    status: str = "Открыт",
    applications: int = 4,
    date: str = "15.07.2026",
    body: str = "Нужно исправить Python Telegram-бота, SQLite и Google Sheets API.",
    extra: str = "",
) -> str:
    return f"""
    <html><body>
      <h1>{title}</h1>
      <div>Тип</div><div>Проект</div>
      <div>Статус</div><div>{status}</div>
      <div>Бюджет</div><div>$100</div>
      <div>Заявки</div><div>{applications}</div>
      <div>Просмотры</div><div>40</div>
      <div>{date}</div>
      <p>{body}</p>
      <div>Авторизуйтесь для подачи заявки</div>
      {extra}
    </body></html>
    """


class WeblancerScannerTests(unittest.TestCase):
    def test_extracts_and_deduplicates_job_links(self) -> None:
        source = """
        <a href="/freelance/veb-programmirovanie-31/python-bot-1268001/">One</a>
        <a href="https://www.weblancer.net/freelance/veb-programmirovanie-31/python-bot-1268001/?x=1">Duplicate</a>
        <a href="/freelance/napisanie-skriptov/parser-1268002/">Two</a>
        <a href="https://example.com/freelance/nope-1/">External</a>
        """
        self.assertEqual(
            SCAN.extract_job_links(source),
            [
                "https://www.weblancer.net/freelance/napisanie-skriptov/parser-1268002/",
                "https://www.weblancer.net/freelance/veb-programmirovanie-31/python-bot-1268001/",
            ],
        )

    def test_accepts_recent_relevant_low_competition_project(self) -> None:
        item = SCAN.parse_card("https://example.test/job", card_html(), now=NOW)
        self.assertTrue(item.actionable)
        self.assertEqual(item.applications, 4)
        self.assertEqual(item.age_days, 1)
        self.assertIn("python", item.relevant_signals)
        self.assertTrue(item.registration_required)
        self.assertEqual(item.blocking_reasons, [])

    def test_rejects_blocked_customer(self) -> None:
        item = SCAN.parse_card(
            "https://example.test/job",
            card_html(extra="<div>Аккаунт заказчика блокирован</div>"),
            now=NOW,
        )
        self.assertFalse(item.actionable)
        self.assertIn("customer-blocked", item.blocking_reasons)

    def test_rejects_stale_urgent_full_postpayment_project(self) -> None:
        item = SCAN.parse_card(
            "https://example.test/job",
            card_html(
                title="Python скрипт срочно",
                date="23.06.2026",
                body="Срок сегодня. Строго полная постоплата после тестирования.",
            ),
            now=NOW,
        )
        self.assertFalse(item.actionable)
        self.assertIn("older-than-limit", item.blocking_reasons)
        self.assertIn("stale-urgent-project", item.blocking_reasons)
        self.assertIn("full-postpayment-only", item.blocking_reasons)

    def test_rejects_verification_bypass_and_selected_executor(self) -> None:
        item = SCAN.parse_card(
            "https://example.test/job",
            card_html(
                body="Python-бот для прохождения видео-верификации через виртуальную камеру.",
                extra="<h2>Выбранный исполнитель</h2>",
            ),
            now=NOW,
        )
        self.assertFalse(item.actionable)
        self.assertIn("captcha-or-verification-bypass", item.blocking_reasons)
        self.assertIn("executor-selected", item.blocking_reasons)

    def test_rejects_more_than_five_applications(self) -> None:
        item = SCAN.parse_card(
            "https://example.test/job",
            card_html(applications=6),
            now=NOW,
        )
        self.assertFalse(item.actionable)
        self.assertIn("too-many-applications", item.blocking_reasons)


if __name__ == "__main__":
    unittest.main()
