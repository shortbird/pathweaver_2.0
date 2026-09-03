"""Org scoping on the SIS routes that name a student.

Eight routes in routes/sis/__init__.py take a student id in the URL: read and
edit the profile, list the enrolled classes, change the enrollment, message the
guardians, and read, add or copy the emergency contacts -- which are a minor's
contact names, phone numbers and pickup authorization.

`@require_role(*ADMIN_ROLES)` says the caller is front-office staff SOMEWHERE.
What says they are front-office staff of THIS student's school is
`@require_relationship_to('student_id', allow=('org_staff',))`, added
2026-09-03 (SEC-10 step c). Roles and tenancy are separate questions and each
decorator answers exactly one of them.

The in-view checks stayed. In routes/admin/transcript_generator.py the same
migration removed them, because there `caller_can_access_user` was purely a
check. Here `org_id` is a parameter of the WORK: `_org_or_error` resolves it,
every sis_service query filters on it, and for a superadmin it is the `org`
they asked for rather than one derived from the student. Removing that would
take the queries' scope with it, not just a redundant test.
"""

from unittest.mock import Mock, patch

import pytest

from utils.auth.relationships import ENFORCED_ATTR

STUDENT = '00000000-0000-4000-8000-0000000000cd'

SIS_STUDENT_ROUTES = (
    'sis.add_emergency_contact',
    'sis.copy_family_contacts',
    'sis.get_student',
    'sis.list_emergency_contacts',
    'sis.message_student',
    'sis.student_classes',
    'sis.update_enrollment',
    'sis.update_student',
)


@pytest.fixture(scope='module')
def declarations():
    from app import app

    return {endpoint: getattr(view, ENFORCED_ATTR, None)
            for endpoint, view in app.view_functions.items()
            if endpoint in SIS_STUDENT_ROUTES}


def test_every_sis_student_route_is_accounted_for(declarations):
    assert set(declarations) == set(SIS_STUDENT_ROUTES), (
        'routes/sis/__init__.py gained or lost a route naming a student. Give '
        'it a policy and list it here. Missing: '
        f'{sorted(set(SIS_STUDENT_ROUTES) - set(declarations))}')


@pytest.mark.parametrize('endpoint', sorted(SIS_STUDENT_ROUTES))
def test_route_declares_org_staff_on_student_id(declarations, endpoint):
    assert declarations[endpoint] == ('student_id', ('org_staff',)), (
        f'{endpoint} declares {declarations[endpoint]}')


def _staff_client():
    """Admin client answering "org_admin" to require_role's users lookup.

    Deliberately WITHOUT organization_id, matching the shape the other SIS route
    tests use: carrying one makes the before_request module gate go looking for
    that org's feature flags through this same mock and fall over on the reply.
    Org membership is not what these tests are about -- the relationship answer
    is patched directly.
    """
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'order', 'single', 'maybe_single'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{
        'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin'],
    }])
    return client


def _get_contacts(client, auth_headers, can_access):
    """GET the contacts with the gate answering `can_access` and the rest stubbed.

    sis_service is stubbed to the ALLOW answer in both cases on purpose: when
    the request is refused it must be the RELATIONSHIP gate refusing it, not
    the service failing to find a student. The SIS blueprint's before_request
    module gate is stubbed for the same reason -- it would otherwise answer 404
    for a feature flag, which is a different question entirely.
    """
    with patch('database.get_supabase_admin_client', return_value=_staff_client()), \
         patch('utils.auth.org_scope.caller_can_access_user', return_value=can_access), \
         patch('modules.gate.check_module', return_value=None), \
         patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch('services.sis_service.student_in_org', return_value=True), \
         patch('services.sis_service.list_emergency_contacts', return_value=[]):
        return client.get(
            f'/api/sis/students/{STUDENT}/emergency-contacts', headers=auth_headers)


@pytest.mark.unit
def test_staff_from_another_school_cannot_read_emergency_contacts(
        client, auth_headers, mock_verify_token):
    """403, not the 404 the in-view org filter would have produced.

    The distinction is the point of the decorator: 404 is what "this student is
    not in your school" looked like from outside, and it is also what "no such
    student" looks like. Now the caller is refused for who they are, before the
    route goes looking.
    """
    assert _get_contacts(client, auth_headers, can_access=False).status_code == 403


@pytest.mark.unit
def test_an_admin_of_the_student_s_own_school_still_gets_the_contacts(
        client, auth_headers, mock_verify_token):
    """The companion to the test above, and not a formality.

    A gate that always denies passes the negative test and breaks the product.
    Everything downstream is stubbed identically in both cases, so the only
    thing separating this 200 from that 403 is the relationship answer.
    """
    resp = _get_contacts(client, auth_headers, can_access=True)
    assert resp.status_code == 200
    assert resp.get_json()['contacts'] == []
