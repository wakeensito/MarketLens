# conftest.py — makes `plinths_auth` importable from tests/ without installing the layer.
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent / "python"))
