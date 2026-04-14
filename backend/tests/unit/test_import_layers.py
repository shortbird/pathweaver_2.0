"""A3 — layered-import contract: routes → services → repositories → utils.

Lightweight in-house version of a full `import-linter` setup. Walks the
module imports statically (AST) and flags violations where a lower layer
reaches up into a higher one.

Allowed:
    routes/*       -> services, repositories, utils, middleware, exceptions, database, app_config, config, prompts, schemas
    services/*     -> repositories, utils, middleware (limited), exceptions, database, app_config, config, prompts, schemas, other services
    repositories/* -> utils, exceptions, database, app_config, config, other repositories
    utils/*        -> utils, exceptions, app_config, config

Disallowed examples:
    repositories/*  importing services.*
    repositories/*  importing routes.*
    services/*      importing routes.*
    utils/*         importing routes, services, repositories, middleware
"""

from __future__ import annotations

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

LAYER_PATHS = {
    "routes": REPO_ROOT / "routes",
    "services": REPO_ROOT / "services",
    "repositories": REPO_ROOT / "repositories",
    "utils": REPO_ROOT / "utils",
    "middleware": REPO_ROOT / "middleware",
}

# Layers that each source layer MUST NOT import from.
FORBIDDEN = {
    "repositories": {"services", "routes", "middleware"},
    "services": {"routes"},
    "utils": {"routes", "services", "repositories", "middleware"},
    "middleware": {"routes", "services"},
}


def _imports_of(path: Path) -> list[str]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return []
    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0 and node.module:
                modules.append(node.module)
    return modules


def _layer_of(module: str) -> str | None:
    for layer in LAYER_PATHS:
        if module == layer or module.startswith(layer + "."):
            return layer
    return None


# Baseline 2026-04-14. Ratchet down as violations are removed — never up.
BASELINE_VIOLATIONS = 8


def test_forbidden_cross_layer_imports_do_not_grow():
    violations: list[str] = []
    for layer, base in LAYER_PATHS.items():
        if not base.is_dir():
            continue
        bad_layers = FORBIDDEN.get(layer, set())
        if not bad_layers:
            continue
        for path in base.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            for mod in _imports_of(path):
                target_layer = _layer_of(mod)
                if target_layer in bad_layers:
                    rel = path.relative_to(REPO_ROOT)
                    violations.append(
                        f"{rel}: {layer} -> {target_layer} ({mod})"
                    )
    unique = sorted(set(violations))
    assert len(unique) <= BASELINE_VIOLATIONS, (
        f"Forbidden cross-layer imports grew from baseline "
        f"{BASELINE_VIOLATIONS} to {len(unique)}. "
        "Layers must flow: routes -> services -> repositories -> utils.\n"
        + "\n".join(unique)
    )
