"""Q3 lint: direct Supabase client usage in routes shouldn't grow.

Per CLAUDE.md, new endpoints must use the repository pattern. Legacy direct
client usage is frozen at the baseline below; bring the count down, never up.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ROUTES = REPO_ROOT / "routes"

# Patterns that indicate direct DB access from a route file (vs going through
# a repository or service). Bump these down as repositories absorb more code.
BASELINE_USER_CLIENT = 5
BASELINE_SUPABASE_CLIENT = 12  # get_user_client() + get_supabase_client() combined


def _count_matches(pattern: str) -> int:
    total = 0
    for path in ROUTES.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        # Count occurrences, ignoring import statements and comments.
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith(("#", "from ", "import ")):
                continue
            total += line.count(pattern)
    return total


def test_user_client_usage_in_routes_does_not_grow():
    count = _count_matches("get_user_client()")
    assert count <= BASELINE_USER_CLIENT, (
        f"get_user_client() usage in routes/ grew from baseline "
        f"{BASELINE_USER_CLIENT} to {count}. New routes must use the "
        "repository pattern (backend/repositories/*)."
    )


def test_direct_supabase_client_usage_in_routes_does_not_grow():
    total = _count_matches("get_user_client()") + _count_matches("get_supabase_client()")
    assert total <= BASELINE_SUPABASE_CLIENT, (
        f"Combined direct client usage (user+supabase) in routes/ grew from "
        f"baseline {BASELINE_SUPABASE_CLIENT} to {total}. New routes must "
        "use the repository pattern."
    )
