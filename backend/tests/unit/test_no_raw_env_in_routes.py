"""S4 lint: `os.getenv`/`os.environ` must not appear in routes/, services/,
repositories/, middleware/, or most utils/ — those should read from
`app_config.Config` instead. See CLAUDE.md rule 8.

Bootstrap modules (app.py, main.py, gunicorn.conf.py, app_config.py,
exceptions.py module-docstring examples) are deliberately allowlisted.

Scripts/tests/docs are out of scope."""

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

# Files where os.getenv/environ is acceptable (bootstrap, docs, legacy).
ALLOWLIST = {
    # Bootstrap is allowed to touch os.environ directly.
    BACKEND / "utils" / "logger.py",
}


def _iter_py_files():
    for base in SCAN_DIRS:
        if not base.exists():
            continue
        for path in base.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            if path in ALLOWLIST:
                continue
            yield path


def _file_has_raw_env(path: Path) -> list[tuple[int, str]]:
    """Return [(lineno, snippet)] for any os.getenv / os.environ[...] calls."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return []

    hits: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        # os.getenv(...) / os.environ.get(...)
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute):
                attr = func.attr
                value = func.value
                if isinstance(value, ast.Name) and value.id == "os":
                    if attr == "getenv":
                        hits.append((node.lineno, "os.getenv"))
                elif (
                    isinstance(value, ast.Attribute)
                    and isinstance(value.value, ast.Name)
                    and value.value.id == "os"
                    and value.attr == "environ"
                    and attr == "get"
                ):
                    hits.append((node.lineno, "os.environ.get"))
        # os.environ['X'] subscript
        if isinstance(node, ast.Subscript):
            v = node.value
            if (
                isinstance(v, ast.Attribute)
                and isinstance(v.value, ast.Name)
                and v.value.id == "os"
                and v.attr == "environ"
            ):
                hits.append((node.lineno, "os.environ[...]"))
    return hits


def test_routes_services_repos_have_no_raw_env_access():
    violations: list[str] = []
    for path in _iter_py_files():
        hits = _file_has_raw_env(path)
        for lineno, snippet in hits:
            rel = path.relative_to(BACKEND)
            violations.append(f"{rel}:{lineno}: {snippet}")
    assert not violations, (
        "Raw os.getenv/os.environ found in routes/services/repositories/"
        "middleware/utils. Read from app_config.Config instead.\n"
        + "\n".join(violations)
    )
