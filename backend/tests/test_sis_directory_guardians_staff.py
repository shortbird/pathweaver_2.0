"""
The family directory and family training links are for guardians and staff.

iCreate, 82485501 (2026-09-22): "should students have access to the entire
family directory?" The owner's answer was no -- parents and staff only. Until
then the directory was readable by every member of the school
(_is_org_member), so a student could browse every other family's names,
emails and phone numbers. The same membership check handed a student the
training links a school set for FAMILIES (/api/sis/parent/training), so that
read moved to the same helper.

What these tests hold, in both directions:
  - a student gets 403 on the directory list, on the listing settings (GET and
    PUT), and on the family training links;
  - a guardian and a staff member still get 200 on the list and the training
    links, and a guardian still gets 200 on the listing settings.
"""

from unittest.mock import patch

import pytest
from flask import Flask

import routes.sis.parent as parent_routes
from services import sis_parent_service as parent
from services import sis_service
from services import sis_training_service

ORG = 'org-1'
OTHER_ORG = 'org-2'


def _ctx(role='org_managed', org_role=None, org_roles=(), org=ORG):
    """get_user_org_context as the helper reads it."""
    return {'id': 'u', 'role': role, 'org_role': org_role,
            'org_roles': list(org_roles), 'organization_id': org}


STUDENT = _ctx(org_role='student', org_roles=['student'])
TEACHER = _ctx(org_role='advisor', org_roles=['advisor'])
ADMIN = _ctx(org_role='org_admin', org_roles=['org_admin'])
COORDINATOR = _ctx(org_role='campus_coordinator', org_roles=['campus_coordinator'])
# A platform parent: no organization_id, a guardian through their child.
PARENT = _ctx(role='parent', org=None)
SUPERADMIN = _ctx(role='superadmin', org=None)


def _who(ctx, guardian=False, sis_enabled=True):
    """Patch the three facts is_guardian_or_staff reads."""
    return [
        patch.object(parent, '_has_org_access', return_value=guardian),
        patch.object(sis_service, 'get_user_org_context', return_value=ctx),
        patch.object(parent, 'org_has_feature', return_value=sis_enabled),
    ]


def _allowed(ctx, **kw):
    patches = _who(ctx, **kw)
    for p in patches:
        p.start()
    try:
        return parent.is_guardian_or_staff('u', ORG)
    finally:
        for p in patches:
            p.stop()


@pytest.mark.unit
class TestWhoIsGuardianOrStaff:
    def test_a_guardian_is(self):
        assert _allowed(PARENT, guardian=True) is True

    def test_a_student_is_not(self):
        assert _allowed(STUDENT) is False

    @pytest.mark.parametrize('ctx', [TEACHER, ADMIN, COORDINATOR])
    def test_staff_of_this_school_are(self, ctx):
        assert _allowed(ctx) is True

    def test_staff_of_another_school_are_not(self):
        assert _allowed(_ctx(org_role='org_admin', org_roles=['org_admin'], org=OTHER_ORG)) is False

    def test_staff_of_a_school_without_the_sis_are_not(self):
        assert _allowed(ADMIN, sis_enabled=False) is False

    def test_a_superadmin_is(self):
        # They belong to no school; the school-page preview links here.
        assert _allowed(SUPERADMIN) is True

    def test_a_parent_who_is_also_staff_elsewhere_is_not_staff_here(self):
        assert _allowed(_ctx(org_role='advisor', org_roles=['advisor'], org=OTHER_ORG)) is False


def _call(view, ctx, *, guardian=False, method='GET', json=None, extra=()):
    """Call a route with its auth decorators unwrapped, as `ctx`."""
    app = Flask(__name__)
    patches = _who(ctx, guardian=guardian) + list(extra)
    for p in patches:
        p.start()
    try:
        with app.test_request_context(f'/api/sis/parent/x?organization_id={ORG}',
                                      method=method, json=json):
            fn = view
            while hasattr(fn, '__wrapped__'):
                fn = fn.__wrapped__
            resp = fn('u')
    finally:
        for p in patches:
            p.stop()
    body = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return body, status


HOUSEHOLD = {'id': 'h1', 'name': 'One Family', 'directory_opt_in': True,
             'directory_opted_out': False, 'carpool_interest': False,
             'directory_share_email': True, 'directory_share_phone': True,
             'directory_share_address': False}


def _directory_data():
    """Enough for family_directory to answer: an empty school."""
    return [patch.object(parent, 'directory_default_in', return_value=False),
            patch.object(parent, 'fetch_all_rows', return_value=[])]


def _listing_data():
    return [patch.object(parent, '_guardian_households', return_value=[HOUSEHOLD]),
            patch.object(parent, 'directory_default_in', return_value=False),
            patch.object(parent, '_admin')]


def _training_data():
    return [patch.object(sis_training_service, 'list_links', return_value=[])]


@pytest.mark.unit
class TestStudentsAreRefused:
    """82485501: parents and staff only."""

    def test_the_directory_list(self):
        body, status = _call(parent_routes.family_directory, STUDENT, extra=_directory_data())
        assert status == 403
        assert 'families' not in body

    def test_the_listing_settings_read(self):
        _body, status = _call(parent_routes.directory_opt_in_status, STUDENT, extra=_listing_data())
        assert status == 403

    def test_the_listing_settings_write(self):
        data = _listing_data()
        _body, status = _call(parent_routes.set_directory_opt_in, STUDENT, method='PUT',
                              json={'opted_in': False}, extra=data)
        assert status == 403

    def test_the_listing_settings_write_touches_nothing(self):
        with patch.object(parent, 'set_directory_opt_in') as wrote:
            _body, status = _call(parent_routes.set_directory_opt_in, STUDENT, method='PUT',
                                  json={'opted_in': False})
        assert status == 403
        wrote.assert_not_called()

    def test_the_family_training_links(self):
        body, status = _call(parent_routes.my_training_links, STUDENT, extra=_training_data())
        assert status == 403
        assert 'training' not in body


@pytest.mark.unit
class TestGuardiansAndStaffStillGetIn:
    def test_a_guardian_reads_the_directory(self):
        body, status = _call(parent_routes.family_directory, PARENT, guardian=True,
                             extra=_directory_data())
        assert status == 200
        assert body['families'] == []

    @pytest.mark.parametrize('ctx', [TEACHER, ADMIN, COORDINATOR])
    def test_staff_read_the_directory(self, ctx):
        _body, status = _call(parent_routes.family_directory, ctx, extra=_directory_data())
        assert status == 200

    def test_a_guardian_reads_their_listing(self):
        body, status = _call(parent_routes.directory_opt_in_status, PARENT, guardian=True,
                             extra=_listing_data())
        assert status == 200
        assert body['opted_in'] is True

    def test_a_guardian_changes_their_listing(self):
        body, status = _call(parent_routes.set_directory_opt_in, PARENT, guardian=True,
                             method='PUT', json={'opted_in': False, 'share_email': False},
                             extra=_listing_data())
        assert status == 200
        assert body['opted_in'] is False

    def test_a_guardian_reads_the_family_training_links(self):
        body, status = _call(parent_routes.my_training_links, PARENT, guardian=True,
                             extra=_training_data())
        assert status == 200
        assert body['training'] == []

    def test_staff_read_the_family_training_links(self):
        _body, status = _call(parent_routes.my_training_links, ADMIN, extra=_training_data())
        assert status == 200

    def test_a_student_cannot_mark_a_family_link_done(self):
        family_link = {'id': 'L2', 'organization_id': ORG, 'audience': 'families'}
        patches = _who(STUDENT)
        for p in patches:
            p.start()
        try:
            with patch.object(sis_training_service, 'owned_link', return_value=family_link), \
                 patch.object(sis_training_service, 'set_link_done') as marked:
                assert parent.set_training_link_done('u', ORG, 'L2', True) is None
        finally:
            for p in patches:
                p.stop()
        marked.assert_not_called()
