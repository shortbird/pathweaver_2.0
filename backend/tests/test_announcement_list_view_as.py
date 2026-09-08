"""
The dashboard list and the archive answer the same caller the same way.

iCreate, 2026-08-31 (0a10f2ae): "I sent this announcement to only 5 teachers
but it's showing up in my preview for a teacher I didn't send it to."

Two routes read the announcements table for a viewer. The archive
(GET /api/announcements/archive) passed ?view_as into the audience filter;
GET /api/announcements hardcoded None, so the same person previewing the same
school got a filtered archive and an unfiltered list. Since org_admin,
campus_coordinator and superadmin are all in _ARCHIVE_SEES_ALL, the unfiltered
answer is EVERY announcement in the school -- which is how a send addressed to
five named teachers turned up while reading as a teacher who was not one.

The guarantee worth pinning is the direction: view_as can only ever narrow.
A parent cannot pass ?view_as=admin and read the staff notices, because the
role check that would hand back a wider token is never reached for them.
"""

from unittest.mock import Mock, patch

import pytest

import routes.announcements as announcements


@pytest.mark.unit
class TestTheListHonoursViewAs:
    def test_the_list_passes_view_as_through_like_the_archive_does(self):
        # The bug was literally a hardcoded None in this call.
        with patch.object(announcements, '_archive_audience_token',
                          return_value='advisors') as token, \
             patch.object(announcements.sis_service, 'resolve_preview_target', return_value=None), \
             patch.object(announcements, '_received_announcement_ids', return_value=[]), \
             patch.object(announcements, 'get_supabase_admin_client') as admin, \
             patch.object(announcements, 'get_effective_role', return_value='superadmin'), \
             patch.object(announcements, 'request',
                          Mock(args={'organization_id': 'org-1', 'view_as': 'advisor'})):
            admin.return_value = _stub_client()
            from flask import Flask
            with Flask(__name__).app_context():
                fn = announcements.list_announcements
                fn = getattr(fn, '__wrapped__', fn)
                fn('user-1')

        assert token.call_args[0][1] == 'advisor', (
            'the list must pass ?view_as into the audience filter')

    def test_no_view_as_leaves_a_staff_caller_seeing_everything(self):
        # The ordinary staff read of this endpoint -- the composer's history
        # panel -- must keep showing the whole school.
        assert announcements._archive_audience_token('org_admin', None) is None
        assert announcements._archive_audience_token('campus_coordinator', None) is None


@pytest.mark.unit
class TestViewAsOnlyNarrows:
    def test_a_family_role_cannot_widen_itself_with_view_as(self):
        # The role check for the caller's OWN role runs first, so a parent
        # asking to be treated as an admin is still filtered as a parent.
        assert announcements._archive_audience_token('parent', 'admin') == 'parents'
        assert announcements._archive_audience_token('student', 'admin') == 'students'

    def test_an_unknown_view_as_does_not_open_the_gate(self):
        # An unrecognised token must not fall through to "no filter" for a
        # member; only the sees-all roles get None.
        assert announcements._archive_audience_token('parent', 'nonsense') == 'parents'


class _Table:
    """Enough of the Supabase builder for list_announcements to run through.

    The two reads want different shapes -- `users` is fetched with .single()
    and yields a dict, the announcements query yields a list of rows -- so the
    stub answers per table rather than handing back one Mock for both.
    """

    def __init__(self, name):
        self.name = name
        self._single = False

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def or_(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        if self.name == 'users':
            return Mock(data={'id': 'u', 'organization_id': 'org-1',
                              'role': 'org_managed', 'org_role': 'advisor',
                              'org_roles': ['advisor']})
        return Mock(data=[])


def _stub_client():
    client = Mock()
    client.table.side_effect = _Table
    return client


@pytest.mark.unit
class TestTheListFollowsAViewPortalPreview:
    """"View portal" on the Staff page, reading the announcements half.

    The preview chrome reaches more than /api/sis/teacher/*, and this endpoint
    is one of the pages it reaches. Answering as the ADMIN is what put a send
    addressed to five named teachers in front of a teacher who was not one.
    """

    # 'advisor' so the audience filter actually runs -- the received-snapshot
    # read only happens when there IS a token, which is the whole point here.
    def _run(self, preview_returns, effective_role='advisor'):
        seen = {}

        def _token(role, view_as):
            seen['role'] = role
            return 'advisors' if role == 'advisor' else None

        def _received(_admin, uid):
            seen['received_for'] = uid
            return []

        with patch.object(announcements.sis_service, 'resolve_preview_target',
                          return_value=preview_returns) as prev, \
             patch.object(announcements, '_archive_audience_token', _token), \
             patch.object(announcements, '_received_announcement_ids', _received), \
             patch.object(announcements, 'get_effective_role',
                          side_effect=lambda row: row.get('_role', effective_role)), \
             patch.object(announcements, 'get_supabase_admin_client') as admin, \
             patch.object(announcements, 'request',
                          Mock(args={'organization_id': 'org-1'})):
            admin.return_value = _stub_client()
            from flask import Flask
            with Flask(__name__).app_context():
                fn = getattr(announcements.list_announcements, '__wrapped__',
                             announcements.list_announcements)
                fn('admin-1')
        return seen, prev

    def test_the_previewed_teacher_decides_the_audience_and_the_snapshot(self):
        seen, prev = self._run('teacher-9')
        # The role read, and the received-list, both belong to the teacher.
        assert seen['received_for'] == 'teacher-9'
        prev.assert_called_once()

    def test_with_no_preview_the_caller_is_the_viewer(self):
        seen, _ = self._run(None)
        assert seen['received_for'] == 'admin-1'

    def test_the_preview_check_is_the_portals_own(self):
        # Not a second copy of "is this caller allowed to look at that person".
        # If this import moves, the two answers can drift apart.
        import inspect
        src = inspect.getsource(announcements.list_announcements)
        assert 'sis_service.resolve_preview_target' in src
