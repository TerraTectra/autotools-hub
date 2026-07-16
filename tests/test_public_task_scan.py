from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "public_task_scan.py"
SPEC = importlib.util.spec_from_file_location("public_task_scan", MODULE_PATH)
assert SPEC and SPEC.loader
SCAN = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SCAN
SPEC.loader.exec_module(SCAN)


def sample(marker: str = "Видно всем", title: str = "Python API bot", applications: int = 4, age: str = "2 часа назад", body: str = "Нужно исправить API и тесты") -> str:
    return f"""
    <html><body>
      <div>{marker}</div>
      <a href="/task/view/1234">{title}</a>
      <p>{body}</p>
      <div>{age}</div><div>Опыт: Не важна</div><div>{applications}</div><div>120</div>
      <div>Гонорар</div><div>10 000 ₽</div><div>Срок</div><div>3 дня</div>
    </body></html>
    """


class ScannerTests(unittest.TestCase):
    def test_accepts_public_recent_profile_task(self) -> None:
        item = SCAN.parse_page(sample(), 5, 72)[0]
        self.assertTrue(item.actionable)
        self.assertEqual((item.applications, item.views, item.age_hours), (4, 120, 2))

    def test_rejects_premium_task(self) -> None:
        item = SCAN.parse_page(sample(marker="Только для Премиум"), 5, 72)[0]
        self.assertIn("not-public", item.blockers)

    def test_rejects_high_competition(self) -> None:
        item = SCAN.parse_page(sample(applications=6), 5, 72)[0]
        self.assertIn("competition", item.blockers)

    def test_rejects_non_profile_task(self) -> None:
        item = SCAN.parse_page(sample(title="Ландшафтный дизайн", body="Подготовить план участка"), 5, 72)[0]
        self.assertIn("not-profile", item.blockers)

    def test_rejects_review_task(self) -> None:
        item = SCAN.parse_page(sample(body="Нужно написать отзыв на Яндекс"), 5, 72)[0]
        self.assertIn("unsafe-or-off-platform", item.blockers)

    def test_converts_days_and_hours(self) -> None:
        self.assertEqual(SCAN.age_hours("2 дня назад"), 48)
        self.assertEqual(SCAN.age_hours("2 часа назад"), 2)


if __name__ == "__main__":
    unittest.main()
