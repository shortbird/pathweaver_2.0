"""
Who an SIS admin is allowed to read as, on "View portal".

The rule is one function (sis_service.resolve_preview_target) because it now
answers for more
than one blueprint: the teacher portal routes and the announcements list. Two
copies of an authorization check drift, and the copy that drifts is the one
nobody is looking at.

Every refusal returns None, which the callers read as "answer as the caller".
That is deliberate: a preview that silently falls back is safe, whereas a
preview that errors would break the admin's own page.
"""

from unittest.mock import Mock, patch

import pytest

import services.sis_service as sp


ORG = 'org-1'
OTHER_ORG = 'org-2'
ADMIN = 'admin-1'
TEACHER = 'teacher-9'


def _run(requested, *, is_admin=True, target_org=ORG, target_exists=True):
    lookup = Mock()
    for chained in ('select', 'eq', 'limit'):
        getattr(lookup, chained).return_value = lookup
    lookup.execute.return_value = Mock(
        data=[{'id': TEACHER, 'organization_id': target_org}] if target_exists else [])
    client = Mock()
    client.table.return_value = lookup

    with patch.object(sp, 'caller_is_admin', return_value=is_admin), \
         patch.object(sp, '_admin', return_value=client):
        return sp.resolve_preview_target(ADMIN, ORG, requested)


@pytest.mark.unit
class TestWhoMayBePreviewed:
    def test_an_admin_previewing_a_teacher_in_their_org_gets_the_teacher(self):
        assert _run(TEACHER) == TEACHER

    def test_no_teacher_id_means_no_preview(self):
        assert _run(None) is None

    def test_a_non_admin_cannot_preview_anyone(self):
        # The check that stops a teacher reading a colleague's portal by
        # editing the URL.
        assert _run(TEACHER, is_admin=False) is None

    def test_a_target_in_another_org_is_refused(self):
        assert _run(TEACHER, target_org=OTHER_ORG) is None

    def test_a_target_that_does_not_exist_is_refused(self):
        assert _run(TEACHER, target_exists=False) is None

    def test_previewing_yourself_is_not_a_preview(self):
        # Not an error, just nothing to do -- the caller already is the viewer.
        assert _run(ADMIN) is None


@pytest.mark.unit
class TestItCostsNothingWhenNobodyIsPreviewing:
    def test_no_database_read_without_a_teacher_id(self):
        # This runs on every announcements read, including a parent's. It must
        # not add a users lookup to the ordinary path.
        client = Mock()
        with patch.object(sp, 'caller_is_admin') as is_admin, \
             patch.object(sp, '_admin', return_value=client):
            assert sp.resolve_preview_target(ADMIN, ORG, None) is None
        client.table.assert_not_called()
        is_admin.assert_not_called()


@pytest.mark.unit
def test_the_portal_routes_use_this_same_function():
    """If staff_portal grows its own copy again, the two can disagree about
    who may read whose portal -- which is a permission bug, not a style one."""
    import routes.sis.staff_portal as portal
    import inspect
    src = inspect.getsource(portal._preview_target)
    assert 'sis_service.resolve_preview_target' in src
