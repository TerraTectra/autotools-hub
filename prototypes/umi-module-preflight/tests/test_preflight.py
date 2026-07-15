from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import preflight


class PreflightTests(unittest.TestCase):
    def make_module(self, root: Path, *, config: str = "0") -> Path:
        module = root / "classes" / "components" / "demo"
        module.mkdir(parents=True)
        admin = "'default_method_admin' => 'config',\n" if config == "1" else ""
        module.joinpath("install.php").write_text(
            "<?php\n"
            "$INFO = [\n"
            "  'name' => 'demo',\n"
            f"  'config' => '{config}',\n"
            f"  {admin}"
            "];\n"
            "$COMPONENTS = [\n"
            "  './classes/components/demo/class.php',\n"
            "  './classes/components/demo/permissions.php',\n"
            "  './classes/components/demo/lang.php',\n"
            "  './classes/components/demo/i18n.php',\n"
            "];\n",
            encoding="utf-8",
        )
        for name in ("class.php", "permissions.php", "lang.php", "i18n.php"):
            module.joinpath(name).write_text("<?php\n", encoding="utf-8")
        root.joinpath("README.md").write_text("# Demo\n", encoding="utf-8")
        return module

    def test_valid_basic_module_has_no_errors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.make_module(root)
            report = preflight.inspect(root)
            self.assertTrue(report.ok)
            self.assertEqual("demo", report.module_name)
            self.assertFalse(any(f.code == "component-missing" for f in report.findings))

    def test_configured_module_requires_admin_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.make_module(root, config="1")
            report = preflight.inspect(root)
            self.assertTrue(any(f.code == "admin-file-missing" for f in report.findings))

    def test_declared_missing_component_is_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            module = self.make_module(root)
            module.joinpath("class.php").unlink()
            report = preflight.inspect(root)
            self.assertTrue(any(f.code == "component-missing" for f in report.findings))

    def test_sensitive_file_is_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.make_module(root)
            root.joinpath(".env").write_text("MODE=demo\n", encoding="utf-8")
            report = preflight.inspect(root)
            self.assertTrue(any(f.code == "sensitive-file" for f in report.findings))

    def test_bom_is_warning(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            module = self.make_module(root)
            module.joinpath("lang.php").write_bytes(b"\xef\xbb\xbf<?php\n")
            report = preflight.inspect(root)
            self.assertTrue(any(f.code == "utf8-bom" for f in report.findings))


if __name__ == "__main__":
    unittest.main()
