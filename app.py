"""Compatibility shim that re-exports the backend app from healthcare-backend/.

Render is configured to use healthcare-backend/ as the project root, but we
keep this file so that local workflows (`python app.py`) still function by
delegating to the actual backend implementation.
"""

from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

BACKEND_FILE = Path(__file__).resolve().parent / "healthcare-backend" / "app.py"

spec = spec_from_file_location("healthcare_backend_app", BACKEND_FILE)
if spec is None or spec.loader is None:
    raise ImportError(f"Unable to load backend module from {BACKEND_FILE}")

backend_module = module_from_spec(spec)
spec.loader.exec_module(backend_module)

app = backend_module.app


def main():
    backend_module.main()


if __name__ == "__main__":
    main()