"""Exercise the frozen entry point's pipe protocol without model dependencies."""

import os
from pathlib import Path
import subprocess
import sys
import unittest


class RuntimeEncodingTests(unittest.TestCase):
    def test_utf8_pipes_override_locale_in_both_directions(self):
        runtime = Path(__file__).resolve().parents[1] / "runtime" / "argos_runtime.py"
        # Supply an identity translator so this test isolates stdin/stdout rather
        # than depending on downloaded models or a particular translation.
        bootstrap = """
import runpy, sys, types
class Language:
    def __init__(self, code): self.code = code
    def get_translation(self, target): return self
    def translate(self, text): return text
translate = types.ModuleType('argostranslate.translate')
translate.get_installed_languages = lambda: [Language('en'), Language('ja')]
package = types.ModuleType('argostranslate')
package.translate = translate
sys.modules['argostranslate'] = package
sys.argv = [sys.argv[1], '--from-lang', sys.argv[2], '--to-lang', sys.argv[3]]
runpy.run_path(sys.argv[0], run_name='__main__')
"""
        for source, target in (("ja", "en"), ("en", "ja")):
            with self.subTest(source=source, target=target):
                text = "こんにちは世界。 café\n"
                result = subprocess.run(
                    [sys.executable, "-c", bootstrap, str(runtime), source, target],
                    input=text.encode("utf-8"), capture_output=True, timeout=10,
                    env={**os.environ, "PYTHONIOENCODING": "ascii", "ARGOS_PACKAGES_DIR": "test-models"},
                )
                self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", errors="replace"))
                self.assertEqual(result.stdout.decode("utf-8"), text)


if __name__ == "__main__":
    unittest.main()
