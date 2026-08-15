"""Observer invitation codes are single-use and expire after 7 days.

Until 2026-08-15 accepting an invitation deliberately left the code live --
routes/observer/acceptance.py said so: "codes are reusable ... Multiple
observers can use the same invitation link". Each acceptance wrote an
observer_student_links row with can_view_evidence = true, and the portfolio
gate only checks that such a row EXISTS. So one link, once forwarded, was a
permanent evidence-level grant over a child's education record for everybody
who ever received it.

These tests pin the three states a dead code can be in and, most importantly,
that a live code grants access exactly once.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import pytest

OBSERVER_ID = '11111111-1111-4111-8111-111111111111'
STUDENT_ID = '22222222-2222-4222-8222-222222222222'
PARENT_ID = '33333333-3333-4333-8333-333333333333'
INVITATION_ID = '44444444-4444-4444-8444-444444444444'


def _iso(delta):
    return (datetime.now(timezone.utc) + delta).isoformat()


def _invitation(**overrides):
    row = {
        'id': INVITATION_ID,
        'student_id': STUDENT_ID,
        'invitation_code': 'a-code',
        'status': 'pending',
        'expires_at': _iso(timedelta(days=3)),
        'consumed_at': None,
        'consumed_by_user_id': None,
        'accepted_at': None,
        'invited_by_user_id': PARENT_ID,
        'invited_by_role': 'parent',
    }
    row.update(overrides)
    return row


class _Table:
    """One table's worth of a PostgREST chain, recording writes."""

    def __init__(self, client, name):
        self.client = client
        self.name = name
        self._op = None
        self._payload = None
        self._filters = {}
        self._single = False

    def __getattr__(self, chained):
        if chained in ('select', 'eq', 'in_', 'limit', 'order', 'offset',
                       'single', 'maybe_single', 'is_', 'gt', 'delete', 'neq'):
            def _chain(*args, **kwargs):
                if chained == 'eq' and len(args) == 2:
                    self._filters[args[0]] = args[1]
                if chained == 'is_' and len(args) == 2:
                    self._filters[f'is_{args[0]}'] = args[1]
                if chained in ('single', 'maybe_single'):
                    self._single = True
                return self
            return _chain
        raise AttributeError(chained)

    def update(self, payload):
        self._op = 'update'
        self._payload = payload
        return self

    def insert(self, payload):
        self._op = 'insert'
        self._payload = payload
        return self

    def execute(self):
        if self._op == 'update' and self.name == 'observer_invitations':
            # Emulate the conditional claim: the UPDATE only matches while the
            # row is still pending and unconsumed.
            row = self.client.invitation
            claimable = (
                row.get('status') == 'pending' and row.get('consumed_at') is None
            )
            if self._filters.get('status') == 'pending' and not claimable:
                return Mock(data=[])
            row.update(self._payload)
            self.client.claims.append(self._payload)
            return Mock(data=[dict(row)])

        if self._op == 'insert':
            self.client.inserts.append((self.name, self._payload))
            return Mock(data=[{'id': 'new-row'}])

        rows = self.client.reads.get(self.name, [])
        if self._single:
            return Mock(data=rows[0] if rows else None)
        return Mock(data=rows)


class _Client:
    def __init__(self, invitation):
        self.invitation = invitation
        self.claims = []
        self.inserts = []
        self.reads = {
            'observer_invitations': [invitation],
            'observer_invitation_students': [],
            'observer_student_links': [],
            'parent_student_links': [],
            'users': [{'id': OBSERVER_ID, 'role': 'observer',
                       'created_at': _iso(-timedelta(days=400)),
                       'first_name': 'Obs', 'last_name': 'Erver',
                       'display_name': 'Obs', 'email': 'obs@example.com',
                       'organization_id': None, 'managed_by_parent_id': None}],
        }

    def table(self, name):
        return _Table(self, name)


def _accept(client, invitation, code='a-code'):
    """POST the accept endpoint as OBSERVER_ID against this invitation row."""
    fake = _Client(invitation)
    with patch('routes.observer.acceptance.get_supabase_admin_client', return_value=fake), \
         patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value=OBSERVER_ID), \
         patch('routes.observer.acceptance.NotificationService'), \
         patch('routes.observer.acceptance.email_service'):
        response = client.post(f'/api/observers/accept/{code}', json={})
    return response, fake


def _preview(client, invitation, code='a-code'):
    fake = _Client(invitation)
    with patch('routes.observer.acceptance.get_supabase_admin_client', return_value=fake):
        response = client.get(f'/api/observers/invitation/{code}/preview')
    return response, fake


@pytest.mark.unit
class TestExpiry:
    def test_expired_code_is_rejected(self, client):
        response, fake = _accept(client, _invitation(expires_at=_iso(-timedelta(hours=1))))

        assert response.status_code == 410
        assert response.get_json()['reason'] == 'expired'
        assert fake.claims == [], 'an expired code must not be consumed'
        assert not [i for i in fake.inserts if i[0] == 'observer_student_links'], \
            'an expired code granted access'

    def test_missing_expiry_is_treated_as_expired_not_as_forever(self, client):
        """A NULL expiry is a row written outside the normal flow. It must
        fail closed -- the whole point of this change is that no observer
        grant is unbounded."""
        response, _ = _accept(client, _invitation(expires_at=None))

        assert response.status_code == 410
        assert response.get_json()['reason'] == 'expired'

    def test_revoked_code_is_rejected(self, client):
        response, fake = _accept(client, _invitation(status='expired'))

        assert response.status_code == 410
        assert response.get_json()['reason'] == 'revoked'
        assert fake.claims == []


@pytest.mark.unit
class TestSingleUse:
    def test_valid_code_is_accepted_and_consumed(self, client):
        invitation = _invitation()
        response, fake = _accept(client, invitation)

        assert response.status_code == 200, response.get_json()
        assert len(fake.claims) == 1, 'the code was not consumed'
        claim = fake.claims[0]
        assert claim['status'] == 'accepted'
        assert claim['consumed_at']
        assert claim['consumed_by_user_id'] == OBSERVER_ID
        assert [i for i in fake.inserts if i[0] == 'observer_student_links'], \
            'a valid acceptance should link the observer'

    def test_a_second_observer_cannot_reuse_the_same_code(self, client):
        """The regression that mattered: the same link, used twice."""
        invitation = _invitation()

        first, _ = _accept(client, invitation)
        assert first.status_code == 200

        # invitation now carries the consumed markers written by the first accept
        second, fake = _accept(client, invitation)

        assert second.status_code == 410
        assert second.get_json()['reason'] == 'already_used'
        assert not [i for i in fake.inserts if i[0] == 'observer_student_links'], \
            'a spent code granted a second observer access'

    def test_claim_is_conditional_so_a_race_has_one_winner(self, client):
        """The claim must filter on status/consumed_at in the UPDATE itself.

        Reading the row and then writing it would let two simultaneous
        redemptions both pass the read and both grant access.
        """
        invitation = _invitation()
        fake = _Client(invitation)

        from routes.observer.acceptance import _claim_invitation

        assert _claim_invitation(fake, INVITATION_ID, OBSERVER_ID) is True
        assert _claim_invitation(fake, INVITATION_ID, 'someone-else') is False

    def test_consumed_code_is_rejected_even_if_status_lagged(self, client):
        """consumed_at alone is enough. Belt and braces against a partial
        write leaving status='pending' on a spent row."""
        response, fake = _accept(
            client, _invitation(consumed_at=_iso(-timedelta(minutes=5)))
        )

        assert response.status_code == 410
        assert response.get_json()['reason'] == 'already_used'
        assert fake.claims == []


@pytest.mark.unit
class TestPreviewDoesNotLeak:
    def test_preview_of_a_used_code_reveals_no_student(self, client):
        response, _ = _preview(client, _invitation(consumed_at=_iso(-timedelta(days=1))))

        assert response.status_code == 410
        body = response.get_json()
        assert body['valid'] is False
        assert body['reason'] == 'already_used'
        assert 'student_name' not in body
        assert 'student_avatar' not in body

    def test_preview_of_an_unknown_code_says_nothing_about_existence(self, client):
        fake = _Client(_invitation())
        fake.reads['observer_invitations'] = []

        with patch('routes.observer.acceptance.get_supabase_admin_client', return_value=fake):
            response = client.get('/api/observers/invitation/no-such-code/preview')

        assert response.status_code == 404
        body = response.get_json()
        assert body['reason'] == 'invalid'
        # No wording that distinguishes "never existed" from "not yours".
        assert 'not found' not in body['error'].lower()

    def test_preview_of_a_live_code_advertises_single_use(self, client):
        fake = _Client(_invitation())
        fake.reads['observer_invitation_students'] = []
        fake.reads['users'] = [{'first_name': 'Ada', 'display_name': 'Ada',
                                'avatar_url': None}]

        with patch('routes.observer.acceptance.get_supabase_admin_client', return_value=fake):
            response = client.get('/api/observers/invitation/a-code/preview')

        assert response.status_code == 200
        body = response.get_json()
        assert body['valid'] is True
        assert body['single_use'] is True
