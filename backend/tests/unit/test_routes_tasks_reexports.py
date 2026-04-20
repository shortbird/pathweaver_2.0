"""Regression guard for the 2026-04-14 `routes/tasks.py` package split.

The split dropped helper re-exports that several downstream modules still
import via ``from routes.tasks import <helper>``. The imports are inside
function bodies (not at module level), so a plain module-import smoke test
passes — but the first call to the endpoint 500s with ``ImportError`` and
users see a blank page.

The credit review dashboard shipped broken to prod because of this: every
GET /api/credit-dashboard/items returned 500, and the frontend swallowed
the error and rendered an empty table.

If you need to remove a re-export from routes/tasks/__init__.py, first
update every caller listed below to use the full path
(``from routes.tasks.xp_helpers import ...``).
"""

import importlib

import pytest


def test_routes_tasks_reexports_helpers():
    """Package namespace must expose XP helpers that callers rely on."""
    from routes.tasks import (
        add_pending_subject_xp,
        bp,
        finalize_subject_xp,
        get_subject_xp_distribution,
        remove_pending_subject_xp,
    )

    assert bp.name == 'tasks'
    for helper in (
        add_pending_subject_xp,
        finalize_subject_xp,
        get_subject_xp_distribution,
        remove_pending_subject_xp,
    ):
        assert callable(helper)


# Modules that do `from routes.tasks import <helper>` at function scope.
# Adding a new caller? Append to this list.
CALLERS_WITH_FUNCTION_SCOPED_IMPORTS = [
    'routes.credit_dashboard.items',
    'routes.credit_dashboard.org_admin_actions',
    'routes.credit_dashboard.accreditor_actions',
    'routes.advisor.credit_review',
]


@pytest.mark.parametrize('module_name', CALLERS_WITH_FUNCTION_SCOPED_IMPORTS)
def test_credit_review_caller_modules_import_cleanly(module_name):
    """Each of these modules can be imported without side effects. The
    function-scoped helper imports are exercised by the separate test
    above — here we just guarantee the module itself doesn't regress."""
    importlib.import_module(module_name)
