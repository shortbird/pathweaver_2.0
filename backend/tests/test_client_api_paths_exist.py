"""
Every `/api/...` path the web and mobile clients call must be a real route.

Two endpoints were being called by shipped UI that the server had never
registered (found 2026-08-18):

  /api/observers/invite   — the "Invite an Observer" button in the mobile
                            profile screen, and a dead helper in the web api
                            service. Student invites had become link-based and
                            the email route went away; the callers did not.
  /api/parents/invite     — the whole student-invites-their-parent form in
                            web ParentLinking.jsx, along with a DELETE to
                            /api/parents/invitations/<id> that also did not
                            exist.

Both were documented as real in API_DOCUMENTATION.md and the OpenAPI spec,
which is largely how they survived. There were even unit tests "covering" the
observer one — but they mocked the transport and asserted that the mock had
been called, so they passed against a route that did not exist. Mocking the
transport cannot tell you the other end is there; this can.

The check is deliberately dumb: find quoted `/api/...` literals in client
source, normalise `${...}` interpolation to a placeholder segment, and ask
Flask's own url_map whether anything matches. It reports the path as present if
ANY method matches, because the clients' verbs are not visible from a string
literal — a wrong verb is a different (much louder) bug than a missing route.
"""

import re
from pathlib import Path

import pytest

from app import app

REPO = Path(__file__).resolve().parents[2]

CLIENT_ROOTS = [
    REPO / 'frontend' / 'src',
    REPO / 'frontend-v2' / 'app',
    REPO / 'frontend-v2' / 'src',
]

SUFFIXES = {'.js', '.jsx', '.ts', '.tsx'}

# Quoted string literals beginning /api/ — single, double or backtick.
_LITERAL = re.compile(r"""['"`](/api/[^'"`\s]*)['"`]""")
# `${...}` (and bare :param / <param>) stand in for a value supplied at runtime.
_INTERP = re.compile(r'\$\{[^}]*\}')

# Client paths that no route serves TODAY. This is a debt baseline, not
# approval: it exists so the check can be switched on now and fail on anything
# NEW, instead of being deferred until 64 pre-existing breakages are cleaned up.
#
# Roughly what is in here (2026-08-18):
#   /api/tutor/*   — the tutor backend is gone (its tables are in CLAUDE.md's
#                    deleted list) but the web components still call it.
#   /api/parents/* — the student-invites-their-parent flow.
#   the rest       — assorted admin, quest, user and LMS paths that outlived
#                    their routes.
#
# Every line here is a button that fails for a user. Delete entries as they are
# fixed; the stale-entry test below makes sure the list can only shrink.
KNOWN_DEAD = {
    '/api/admin/ai-quest-review/bulk-reject',
    '/api/admin/organizations/__param__/invitations__param__',
    '/api/admin/quest-sources',
    '/api/admin/quest-sources/__param__',
    '/api/admin/roster-import/__param__',
    '/api/admin/service-inquiries',
    '/api/admin/service-inquiries/__param__',
    '/api/admin/services',
    '/api/admin/services/__param__',
    '/api/advisor/student-overview',
    '/api/bounties/__param__/claims/__param__/evidence/__param__/__param__',
    '/api/bounties/__param__/submit',
    '/api/credits/__param__',
    '/api/curriculum/__param__/reorder',
    '/api/evidence',
    '/api/evidence/documents/by-id/__param__',
    '/api/evidence__param__',
    '/api/fix/fix-completion',
    '/api/lessons/__param__/generate-tasks',
    '/api/lms/grade-sync/status',
    '/api/lms/integration/status',
    '/api/lms/platforms',
    '/api/lms/sync/assignments',
    '/api/lms/sync/roster',
    '/api/observers/accept',
    '/api/observers/student/__param__/progress',
    '/api/observers/student/__param__/report',
    '/api/parent/child-overview',
    '/api/parent/linked',
    '/api/parents/approve-link/__param__',
    '/api/parents/decline-link/__param__',
    '/api/parents/invitations/__param__/approve',
    '/api/parents/invitations/__param__/decline',
    '/api/parents/my-connection-requests',
    '/api/parents/pending-approvals',
    '/api/parents/pending-invitations',
    '/api/portfolio/__param__',
    '/api/portfolio/__param__/settings',
    '/api/quests/__param__/abandon',
    '/api/quests/__param__/enrollment__param__',
    '/api/quests/__param__/progress',
    '/api/quests/__param__/rate',
    '/api/quests/__param__/rating',
    '/api/quests/__param__/user-rating',
    '/api/sis/billing/invoices/__param__/document',
    '/api/sis/onboarding',
    '/api/sis/reports/__param__',
    '/api/sis/teacher/time/__param__',
    '/api/tasks',
    '/api/tutor/chat',
    '/api/tutor/conversations',
    '/api/tutor/conversations/__param__',
    '/api/tutor/parent/conversations/__param__/messages',
    '/api/tutor/parent/safety-reports/__param__',
    '/api/tutor/parent/settings/__param__',
    '/api/tutor/report',
    '/api/tutor/usage',
    '/api/users/__param__/completed-quests',
    '/api/users/__param__/profile',
    '/api/users/__param__/settings',
    '/api/users/__param__/transcript',
    '/api/users/badges',
    '/api/users/xp',
}


def _normalise(path: str) -> str:
    """A concrete path Flask can be asked to match."""
    path = _INTERP.sub('__param__', path)
    path = path.split('?', 1)[0].split('#', 1)[0]
    # A trailing slash-less template like /api/x/ is still the same rule.
    return path or '/'


def _client_api_paths():
    """[(path, source_file, line)] for every /api/ literal in client source."""
    found = []
    for root in CLIENT_ROOTS:
        if not root.exists():
            continue
        for f in root.rglob('*'):
            if f.suffix not in SUFFIXES or 'node_modules' in f.parts:
                continue
            try:
                text = f.read_text(encoding='utf-8')
            except (UnicodeDecodeError, OSError):
                continue
            for i, line in enumerate(text.splitlines(), 1):
                for raw in _LITERAL.findall(line):
                    found.append((_normalise(raw), f.relative_to(REPO), i))
    return found


def _is_test_file(path: Path) -> bool:
    """Test fixtures legitimately invent paths ('/api/x/5' in a retry test), so
    they are not evidence of a broken caller."""
    return '__tests__' in path.parts or '.test.' in path.name


def _exists(adapter, path: str) -> bool:
    """True when any HTTP method matches this path."""
    from werkzeug.exceptions import MethodNotAllowed, NotFound
    from werkzeug.routing import RequestRedirect

    for method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'):
        try:
            adapter.match(path, method=method)
            return True
        except MethodNotAllowed:
            return True          # the rule exists, just not for this verb
        except RequestRedirect:
            return True          # differs only by a trailing slash
        except NotFound:
            continue
    return False


def test_client_source_finds_api_paths():
    """Guard the guard: if the scan finds nothing, it is broken, not clean."""
    paths = _client_api_paths()
    assert len(paths) > 100, (
        f'Only {len(paths)} /api/ literals found across the clients — the '
        'scan is probably not reading the right directories.'
    )


def test_every_client_api_path_is_a_real_route():
    adapter = app.url_map.bind('localhost')
    missing = {}
    for path, src, line in _client_api_paths():
        if _is_test_file(REPO / src) or path in KNOWN_DEAD:
            continue
        if _exists(adapter, path):
            continue
        missing.setdefault(path, []).append(f'{src}:{line}')

    if missing:
        report = '\n'.join(
            f'  {path}\n' + '\n'.join(f'      {c}' for c in sorted(set(callers)))
            for path, callers in sorted(missing.items())
        )
        pytest.fail(
            'Client code calls API paths that no Flask route serves.\n'
            'Either the route was removed and the caller was not, or the path '
            'is a typo. Both reach the user as an unexplained failure.\n\n'
            + report
        )


def test_known_dead_list_only_shrinks():
    """A baseline entry that is no longer dead — fixed, or its caller deleted —
    must come off the list, or the list rots into a permanent exemption."""
    adapter = app.url_map.bind('localhost')
    still_called = {
        p for p, src, _ in _client_api_paths() if not _is_test_file(REPO / src)
    }
    stale = sorted(
        p for p in KNOWN_DEAD
        if p not in still_called or _exists(adapter, p)
    )
    if stale:
        pytest.fail(
            'These paths are in KNOWN_DEAD but are no longer broken — either a '
            'route now serves them or nothing calls them any more. Remove them '
            'from the baseline:\n'
            + '\n'.join(f'  {p}' for p in stale)
        )
