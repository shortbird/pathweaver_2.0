"""S3/E1 lint: cap the number of `except ...: pass` sites.

Silently swallowing exceptions hides bugs and security events. New code must
log the exception (at least `logger.debug(..., exc_info=True)`) rather than
`pass`.

We track a baseline count and fail CI if it grows. As sites are remediated,
update the baseline downward — never upward.
"""

from __future__ import annotations

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND = REPO_ROOT

SCAN_DIRS = [
    BACKEND / "routes",
    BACKEND / "services",
    BACKEND / "repositories",
    BACKEND / "middleware",
    BACKEND / "utils",
]

# Baseline set 2026-04-14 after fixing the auth/admin/user_repository hot
# paths. Ratchet this down as sites are migrated to log-and-swallow or
# re-raise. Never raise it.
BASELINE_COUNT = 0


def _count_silent_excepts() -> list[str]:
    findings: list[str] = []
    for base in SCAN_DIRS:
        if not base.exists():
            continue
        for path in base.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            try:
                tree = ast.parse(path.read_text(encoding="utf-8"))
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.ExceptHandler):
                    body = node.body
                    if len(body) == 1 and isinstance(body[0], ast.Pass):
                        rel = path.relative_to(BACKEND)
                        findings.append(f"{rel}:{node.lineno}")
    return findings


def test_silent_excepts_dont_grow():
    findings = _count_silent_excepts()
    count = len(findings)
    assert count <= BASELINE_COUNT, (
        f"Silent except count grew from baseline {BASELINE_COUNT} to {count}. "
        "New code must log the exception (logger.debug/exception) rather "
        "than `pass`. Current sites:\n" + "\n".join(findings)
    )
