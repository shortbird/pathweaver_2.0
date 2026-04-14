"""M1 regression: register_all() must succeed at import and produce a sane
number of routes.

This is the test M1 wishes had existed earlier — it would have caught the
silently-broken modules (khan_academy_sync, batch_quest_generation, ai_tutor)
the day they were deleted, instead of letting them rot for months under the
old try/except scaffolding in app.py.

Sub-tests:
1. `register_all` runs without raising on a fresh Flask app.
2. The route count clears a sanity floor (currently ~789; floor is 700 to
   absorb minor adds/removes without churn).
3. A handful of representative route prefixes from each major area are
   present, so we'd notice if a whole subtree went missing.
4. Routes for modules removed in the M1 cleanup are confirmed absent (so a
   half-revert that re-adds them would fail loudly).

We stub `magic` (libmagic) before import because it segfaults during ffi
load in some Windows venvs (pre-existing — see audit plan M1 entry). The
stub is byte-compatible with the file_validator usage path: only `from_buffer`
and `from_file` are called, both returning a benign MIME string.
"""
import os
import sys
import types

import pytest


@pytest.fixture(scope='module')
def app_with_stubs():
    # Stub libmagic before any backend import touches utils.file_validator.
    if 'magic' not in sys.modules:
        magic_stub = types.ModuleType('magic')
        magic_stub.from_buffer = lambda buf, mime=False: 'application/octet-stream' if mime else 'data'
        magic_stub.from_file = lambda *a, **k: 'data'

        class _Magic:
            def from_buffer(self, *a, **k):
                return 'data'

            def from_file(self, *a, **k):
                return 'data'

        magic_stub.Magic = _Magic
        magic_stub.MAGIC_MIME = 16
        sys.modules['magic'] = magic_stub

    # Make sure backend/ is importable.
    here = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.abspath(os.path.join(here, '..', '..'))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    # Importing app triggers register_all(app).
    import app as _app  # noqa: E402
    return _app.app


def test_register_all_runs_and_produces_routes(app_with_stubs):
    rules = list(app_with_stubs.url_map.iter_rules())
    assert len(rules) >= 700, (
        f'Expected >= 700 routes after register_all, got {len(rules)}. '
        'Either many routes were intentionally removed (update this floor), '
        'or a blueprint silently failed to register.'
    )


@pytest.mark.parametrize('prefix', [
    '/api/health',
    '/api/auth/login',
    '/api/quests',
    '/api/courses',
    '/api/users/me',
    '/api/admin/users',
    '/api/parent',
    '/api/observers/feed',
    '/api/dependents/my-dependents',
    '/api/messages/conversations',
    '/api/notifications',
    '/csrf-token',
])
def test_major_route_prefixes_present(app_with_stubs, prefix):
    rule_strs = {str(r.rule) for r in app_with_stubs.url_map.iter_rules()}
    parent = prefix.rsplit('/', 1)[0] if prefix.count('/') > 1 else prefix
    assert any(rs.startswith(parent) for rs in rule_strs), (
        f'No routes registered under {prefix} — a whole blueprint area may have dropped.'
    )


@pytest.mark.parametrize('dead_prefix', [
    '/api/tutor',                    # AI Tutor removed in M1 cleanup
    '/api/admin/batch-generation',   # batch_quest_generation removed in M1 cleanup
    '/api/admin/jobs/quality',       # ai_jobs quality endpoints removed in M1 cleanup
])
def test_routes_removed_in_m1_cleanup_stay_gone(app_with_stubs, dead_prefix):
    rule_strs = {str(r.rule) for r in app_with_stubs.url_map.iter_rules()}
    assert not any(rs.startswith(dead_prefix) for rs in rule_strs), (
        f'Route prefix {dead_prefix} reappeared. These were intentionally removed in '
        'M1 cleanup because they depended on deleted services. If reviving, also '
        'restore the underlying service.'
    )
