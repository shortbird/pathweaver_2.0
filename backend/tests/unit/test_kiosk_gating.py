"""
The org-generic kiosk (routes/kiosk.py) gates on the `kiosk` building block,
not on the SIS switch.

The kiosk was built for Gryffin (SIS school) with `parent='sis'` and its device
card on the console-only settings surface. The first LMS-only school to ask for
it, Arete Academy (2026-09-07), could not reach it at all: the block stayed off
under the SIS cascade and the card never rendered. The registry entry lost its
parent and the routes moved from the flat feature flag to module_enabled, so
the Blocks panel (which writes modules.kiosk and mirrors the flat flag) and the
routes agree by construction.

The roster and login routes are pre-session: the org comes from the DEVICE
token, so the gate is called inline (modules.gate.module_guard resolves the
org from the caller and cannot apply). These tests stub the device lookup and
the roster and run the real module evaluation against an org row.
"""

import hashlib
from contextlib import ExitStack
from unittest.mock import Mock, patch

import pytest

ORG = '11111111-1111-4111-8111-111111111111'
DEVICE_ID = '22222222-2222-4222-8222-222222222222'
STUDENT_ID = '33333333-3333-4333-8333-333333333333'
OUTSIDER_ID = '44444444-4444-4444-8444-444444444444'

DEVICE = {'id': DEVICE_ID, 'organization_id': ORG, 'name': 'Room 2 iPad',
          'class_id': None, 'is_active': True}
STUDENT = {'id': STUDENT_ID, 'first_name': 'Ada', 'last_name': 'Lovelace',
           'display_name': None, 'avatar_url': None,
           'role': 'org_managed', 'org_role': 'student', 'org_roles': None}

LMS_ONLY_SHAPES = [
    pytest.param({'kiosk': True}, id='legacy-flat-flag'),
    pytest.param({'modules': {'kiosk': True}}, id='modules-entry'),
]


def _org_row(flags):
    return {'id': ORG, 'feature_flags': flags, 'ai_features_enabled': False}


def _chain_client(rows):
    """An admin client whose every read answers `rows` (branding for the
    roster, the student row for the login greeting)."""
    m = Mock()
    for name in ('table', 'select', 'eq', 'limit', 'order', 'in_', 'update', 'insert'):
        getattr(m, name).return_value = m
    m.execute.return_value = Mock(data=rows)
    return m


def _kiosk(flags, device=DEVICE, students=(STUDENT,)):
    """Patch the kiosk's DB touches; the module gate runs for real on `flags`."""
    stack = ExitStack()
    session = Mock()
    session.generate_access_token.return_value = 'access'
    session.generate_refresh_token.return_value = 'refresh'
    stack.enter_context(patch('routes.kiosk.SessionManager', return_value=session))
    stack.enter_context(patch('routes.kiosk._get_active_device_by_token', return_value=device))
    stack.enter_context(patch('routes.kiosk._device_scope_students', return_value=list(students)))
    stack.enter_context(patch('routes.kiosk._touch_device'))
    stack.enter_context(patch('routes.kiosk.sign_in_place'))
    stack.enter_context(patch('routes.kiosk.get_supabase_admin_client', return_value=_chain_client([
        {'name': 'Test School', 'branding_config': {'primary_color': '#123456'},
         'first_name': 'Ada', 'display_name': None},
    ])))
    stack.enter_context(patch('modules.enabled._org_row', return_value=_org_row(flags)))
    return stack


@pytest.mark.unit
class TestTheRosterGate:
    def test_a_school_without_the_block_gets_nothing(self, client):
        with _kiosk({'sis_enabled': True}):
            res = client.post('/api/kiosk/roster', json={'token': 'ksk_x'})
        assert res.status_code == 403
        assert res.get_json()['error'] == 'Kiosk is not enabled for this organization'

    @pytest.mark.parametrize('flags', LMS_ONLY_SHAPES)
    def test_an_lms_only_school_with_the_block_on_gets_its_roster(self, client, flags):
        """No sis_enabled anywhere: the Arete shape."""
        with _kiosk(flags):
            res = client.post('/api/kiosk/roster', json={'token': 'ksk_x'})
        assert res.status_code == 200, res.get_json()
        body = res.get_json()
        assert [s['name'] for s in body['students']] == ['Ada']
        assert body['org'] == {'name': 'Test School', 'logo_url': None,
                               'colors': {'primary': '#123456', 'secondary': None}}
        assert body['device'] == {'name': 'Room 2 iPad', 'class_id': None}

    def test_an_explicit_off_beats_the_legacy_flag(self, client):
        with _kiosk({'kiosk': True, 'modules': {'kiosk': False}}):
            res = client.post('/api/kiosk/roster', json={'token': 'ksk_x'})
        assert res.status_code == 403

    def test_an_unknown_device_is_refused_before_the_gate_is_consulted(self, client):
        with _kiosk({'kiosk': True}, device=None):
            res = client.post('/api/kiosk/roster', json={'token': 'ksk_nope'})
        assert res.status_code == 401


@pytest.mark.unit
class TestTheLoginGate:
    def test_a_student_on_the_device_gets_a_session(self, client):
        with _kiosk({'modules': {'kiosk': True}}):
            res = client.post('/api/kiosk/login',
                              json={'token': 'ksk_x', 'student_id': STUDENT_ID})
        assert res.status_code == 200, res.get_json()
        assert res.get_json() == {'success': True, 'user_id': STUDENT_ID, 'first_name': 'Ada'}

    def test_a_student_outside_the_device_scope_is_refused(self, client):
        with _kiosk({'modules': {'kiosk': True}}):
            res = client.post('/api/kiosk/login',
                              json={'token': 'ksk_x', 'student_id': OUTSIDER_ID})
        assert res.status_code == 403
        assert res.get_json()['error'] == 'Student not on this device'

    def test_the_block_off_refuses_even_a_student_on_the_device(self, client):
        with _kiosk({}):
            res = client.post('/api/kiosk/login',
                              json={'token': 'ksk_x', 'student_id': STUDENT_ID})
        assert res.status_code == 403


@pytest.mark.unit
class TestTheWiring:
    def test_the_routes_read_the_module_system_not_the_flat_flag(self):
        import routes.kiosk as kiosk
        from modules import module_enabled

        assert kiosk.module_enabled is module_enabled
        assert not hasattr(kiosk, 'org_has_feature')

    def test_the_kiosk_block_has_no_sis_parent(self):
        from modules import MODULES

        assert MODULES['kiosk'].parent is None
        assert 'learning' in MODULES['kiosk'].surfaces
        assert 'console' in MODULES['kiosk'].surfaces

    def test_the_roster_reads_are_paged(self):
        """Both roster reads grow with the org (CLAUDE.md, Row Limits): every
        row must come back, not the first thousand."""
        from routes.kiosk import _device_scope_students

        advisor = {**STUDENT, 'id': 'adv', 'org_role': 'advisor'}
        enrolled = [{'id': 'e1', 'student_id': STUDENT_ID}]
        with patch('routes.kiosk.fetch_all_rows',
                   side_effect=[[STUDENT, advisor], enrolled]) as paged:
            got = _device_scope_students(Mock(), {'organization_id': ORG, 'class_id': 'c1'})
        assert got == [STUDENT]
        assert paged.call_count == 2


# ---------------------------------------------------------------------------
# The device code stays visible (2026-09-07)
#
# It was shown once at provisioning and only its hash kept, so a lost code
# meant re-pairing the iPad. The org's own admins already manage every student
# the code can log in, so it is stored in plaintext beside the hash and the
# device list hands it back while the device is active.
# ---------------------------------------------------------------------------

def _admin_route(stack, route_rows, flags=None):
    """Patch an admin route's collaborators: require_role's users lookup (an
    org_admin), the caller's org, the module gate, and the route's own client
    answering `route_rows` to every read and insert."""
    stack.enter_context(patch('database.get_supabase_admin_client', return_value=_chain_client([
        {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin']},
    ])))
    stack.enter_context(patch('routes.kiosk._caller_org_id', return_value=(ORG, None)))
    stack.enter_context(patch('modules.enabled._org_row',
                              return_value=_org_row(flags or {'modules': {'kiosk': True}})))
    route_client = _chain_client(route_rows)
    stack.enter_context(patch('routes.kiosk.get_supabase_admin_client', return_value=route_client))
    return route_client


@pytest.mark.unit
class TestTheCodeStaysVisible:
    def test_provisioning_stores_the_plaintext_beside_its_hash(
            self, client, auth_headers, mock_verify_token):
        with ExitStack() as stack:
            route_client = _admin_route(stack, [{'id': DEVICE_ID, 'created_at': 'now'}])
            res = client.post('/api/kiosk/devices', json={'name': 'Room 2 iPad'},
                              headers=auth_headers)
        assert res.status_code == 201, res.get_json()
        body = res.get_json()
        code = body['device_token']
        assert code.startswith('ksk_')
        assert body['device']['token'] == code
        inserted = route_client.insert.call_args.args[0]
        assert inserted['token'] == code
        assert inserted['token_hash'] == hashlib.sha256(code.encode()).hexdigest()

    def test_the_list_returns_codes_for_active_devices_only(
            self, client, auth_headers, mock_verify_token):
        rows = [
            {'id': 'a', 'organization_id': ORG, 'name': 'Room 2 iPad', 'token': 'ksk_live',
             'class_id': None, 'is_active': True, 'created_at': 'x', 'last_used_at': None},
            {'id': 'b', 'organization_id': ORG, 'name': 'Retired iPad', 'token': 'ksk_dead',
             'class_id': None, 'is_active': False, 'created_at': 'x', 'last_used_at': None},
            {'id': 'c', 'organization_id': ORG, 'name': 'Pre-column iPad', 'token': None,
             'class_id': None, 'is_active': True, 'created_at': 'x', 'last_used_at': None},
        ]
        with ExitStack() as stack:
            _admin_route(stack, rows)
            res = client.get('/api/kiosk/devices', headers=auth_headers)
        assert res.status_code == 200, res.get_json()
        by_name = {d['name']: d['token'] for d in res.get_json()['devices']}
        assert by_name == {'Room 2 iPad': 'ksk_live', 'Retired iPad': None, 'Pre-column iPad': None}
        assert 'token_hash' not in res.get_data(as_text=True)
