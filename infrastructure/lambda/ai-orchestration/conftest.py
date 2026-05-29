# conftest.py — ensures scoring.py / assembly.py are importable from tests/
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).parent))
