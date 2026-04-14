"""E2 lint: every `model.generate_content(...)` call in services/ must go
through ``services.ai_gen.generate_with_timeout`` (or explicitly pass
``request_options``), so Gemini calls can't hang a worker indefinitely.

``base_ai_service.py`` is allowlisted because it is the only module that
constructs ``RequestOptions(timeout=...)`` directly.
"""

from __future__ import annotations

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SERVICES = REPO_ROOT / "services"

ALLOWLIST = {
    SERVICES / "base_ai_service.py",  # configures RequestOptions directly
    SERVICES / "ai_gen.py",           # the helper itself
}


def _direct_generate_content_calls(path: Path) -> list[int]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return []
    hits: list[int] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not (isinstance(func, ast.Attribute) and func.attr == "generate_content"):
            continue
        # Accept if the call passes request_options=... explicitly.
        if any(kw.arg == "request_options" for kw in node.keywords):
            continue
        hits.append(node.lineno)
    return hits


def test_all_generate_content_calls_use_timeout_helper():
    violations: list[str] = []
    for path in SERVICES.rglob("*.py"):
        if path in ALLOWLIST or "__pycache__" in path.parts:
            continue
        for lineno in _direct_generate_content_calls(path):
            rel = path.relative_to(REPO_ROOT)
            violations.append(f"{rel}:{lineno}")
    assert not violations, (
        "Direct `.generate_content(...)` call found without `request_options=`. "
        "Use `from services.ai_gen import generate_with_timeout` instead.\n"
        + "\n".join(violations)
    )
