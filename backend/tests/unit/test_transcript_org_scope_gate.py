"""Org scoping on the transcript endpoints, and the order it runs in.

These ten routes take a student id in the URL and hand back an academic
transcript: name, date of birth, every credit, and on `/send`, an emailed PDF
of all of it to an address the caller types in. `@require_school_admin` only
says the caller administers SOME organization. What says they administer THIS
student's is `@require_relationship_to('user_id', allow=('org_staff',))`,
which resolves to `caller_can_access_user` -- the original IDOR-C1 fix, moved
out of ten copied inline blocks and into one declaration on 2026-09-03
(SEC-10 step c).

The move is why the ordering test below matters. `/send` validates its payload
first -- school name, recipient email, base64, PDF magic bytes, size -- and the
inline check used to sit AFTER all of that. A caller with no business near this
student could tell a missing school name from a bad email from an oversized
PDF, and push 15MB through a base64 decode, before being told no. Now the gate
is the first thing that runs.
"""

from unittest.mock import Mock, patch

import pytest

from utils.auth.relationships import ENFORCED_ATTR

STUDENT = '00000000-0000-4000-8000-0000000000ab'

#: Every id-bearing route in the module. A new one that is not here fails
#: test_every_transcript_route_is_accounted_for rather than shipping ungated.
TRANSCRIPT_ROUTES = (
    'admin_transcript_generator.add_planned_credit',
    'admin_transcript_generator.check_transcript_exists',
    'admin_transcript_generator.delete_planned_credit',
    'admin_transcript_generator.get_overrides',
    'admin_transcript_generator.get_planned_credits',
    'admin_transcript_generator.get_transcript_data',
    'admin_transcript_generator.get_transfer_history',
    'admin_transcript_generator.save_overrides',
    'admin_transcript_generator.send_transcript_to_school',
    'admin_transcript_generator.update_planned_credit',
)


@pytest.fixture(scope='module')
def declarations():
    """endpoint -> (param, allow), read off the app the process really serves."""
    from app import app

    return {endpoint: getattr(view, ENFORCED_ATTR, None)
            for endpoint, view in app.view_functions.items()
            if endpoint.startswith('admin_transcript_generator.')
            and endpoint in TRANSCRIPT_ROUTES}


def test_every_transcript_route_is_accounted_for(declarations):
    assert set(declarations) == set(TRANSCRIPT_ROUTES), (
        'routes/admin/transcript_generator.py gained or lost an id-bearing '
        'route. Give it a policy and list it here. Missing: '
        f'{sorted(set(TRANSCRIPT_ROUTES) - set(declarations))}')


@pytest.mark.parametrize('endpoint', sorted(TRANSCRIPT_ROUTES))
def test_route_declares_org_staff_on_user_id(declarations, endpoint):
    declared = declarations[endpoint]
    assert declared is not None, f'{endpoint} declares no relationship'
    assert declared == ('user_id', ('org_staff',)), (
        f'{endpoint} declares {declared}. These carry a minor\'s transcript and '
        "date of birth; the caller must be staff of that student's own org.")


def _org_admin_client():
    """An admin client whose users lookup answers "org admin of org-1"."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'order', 'single', 'maybe_single'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{
        'role': 'org_managed', 'org_role': 'org_admin',
        'org_roles': ['org_admin'], 'is_org_admin': True,
        'organization_id': 'org-1',
    }])
    return client


def _send(client, auth_headers, can_access, body=None):
    with patch('database.get_supabase_admin_client', return_value=_org_admin_client()), \
         patch('utils.auth.org_scope.caller_can_access_user', return_value=can_access):
        return client.post(f'/api/admin/transcript/{STUDENT}/send',
                           json=body if body is not None else {},
                           headers=auth_headers)


@pytest.mark.unit
def test_an_org_admin_from_another_org_is_refused(client, auth_headers, mock_verify_token):
    assert _send(client, auth_headers, can_access=False).status_code == 403


@pytest.mark.unit
def test_the_refusal_comes_before_the_payload_is_even_looked_at(
        client, auth_headers, mock_verify_token):
    """An empty body is a 400 for someone allowed here, and a 403 for someone not.

    If this ever returns 400, the gate has slipped back behind the validation
    and an outsider can once again probe this endpoint's input handling.
    """
    assert _send(client, auth_headers, can_access=True).status_code == 400
    assert _send(client, auth_headers, can_access=False).status_code == 403
