import importlib.util
import sys
import unittest
from pathlib import Path

scripts = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(scripts))
spec = importlib.util.spec_from_file_location("entry", scripts / "task_scan_entry.py")
entry = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = entry
spec.loader.exec_module(entry)

HTML = """<div>Видно всем</div><a href='/task/view/1234'>Python API bot</a><p>API tests</p><div>2 часа назад</div><div>Опыт: Не важна</div><div>4</div><div>1 200</div><div>Гонорар</div><div>10 000 ₽</div><div>Срок</div>"""

class Tests(unittest.TestCase):
    def test_metrics(self):
        item = entry.scan.parse_page(HTML, 5, 72)[0]
        self.assertEqual((item.applications, item.views, item.age_hours), (4, 1200, 2))
        self.assertTrue(item.actionable)

    def test_days(self):
        self.assertEqual(entry.scan.age_hours("2 дня назад"), 48)

    def test_limit(self):
        item = entry.scan.parse_page(HTML.replace("<div>4</div>", "<div>6</div>"), 5, 72)[0]
        self.assertIn("competition", item.blockers)

if __name__ == "__main__":
    unittest.main()
