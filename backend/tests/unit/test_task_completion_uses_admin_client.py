"""Regression guard for the task-completion PGRST301 failure
(Sentry OPTIO-BACKEND-V / -W).

POST /api/tasks/<id>/complete used to build its repositories with
``get_user_client()``, which forwards the caller's Supabase JWT to PostgREST
for RLS. After Supabase's JWT signing-key migration that verification began
failing in prod with ``PGRST301 "No suitable key or wrong key type"``, breaking
task completion. Every query in the handler is explicitly scoped to
``effective_user_id`` (ownership is verified in code), so the handler must use
the admin/service-role client and must NOT reach for ``get_user_client`` — that
is what reintroduces the PostgREST JWT dependency.

This is a source-level guard (cheap, no DB) in the spirit of
``test_ai_generate_uses_timeout.py``.
"""

from __future__ import annotations

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPLETION = REPO_ROOT / "routes" / "tasks" / "completion.py"


def _names_used(tree: ast.AST) -> set[str]:
    used: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            used.add(node.id)
        elif isinstance(node, ast.Attribute):
            used.add(node.attr)
    return used


def test_completion_route_does_not_use_user_client():
    tree = ast.parse(COMPLETION.read_text(encoding="utf-8"))
    names = _names_used(tree)
    assert "get_user_client" not in names, (
        "routes/tasks/completion.py references get_user_client(), which forwards "
        "the caller's JWT to PostgREST and caused PGRST301 in prod. Use the admin "
        "(service-role) client with explicit effective_user_id filters instead."
    )


def test_completion_route_uses_admin_client():
    """Sanity check that the handler still constructs the admin client."""
    tree = ast.parse(COMPLETION.read_text(encoding="utf-8"))
    names = _names_used(tree)
    assert "get_supabase_admin_client" in names
