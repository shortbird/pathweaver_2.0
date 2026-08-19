"""
The paperwork hold: a family cannot use the platform until they sign.

The check lives in utils/signature_hold (middleware asks it before any route
runs, and middleware may not import services); services/sis_access_gate adds
the half that renders what must be signed. Both are exercised here, because
from a family's point of view they are one feature.

iCreate, 2026-08-18: "need a way to assign documents to families to e-sign, and
block their platform access until signed."

Sending a document for signature already existed. What is new is that signing
can be a CONDITION, so what needs testing is every way that condition could be
wrong in a direction that matters:

  - it holds the right people (a guardian) and not the wrong ones (staff, and
    anybody with nothing outstanding),
  - it LIFTS the moment the last required item is signed, because a hold that
    outlives its paperwork locks a family out of a school they have already
    satisfied,
  - it fails OPEN, because a bug in a gate that fails closed takes the whole
    platform down for every family at once,
  - and the escape hatches work: the office can release it, and the signing
    flow itself is never blocked by it.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_access_gate
from utils import signature_hold as gate


ORG = 'org-1'
PARENT = 'parent-1'


def _assignment(*, status='pending', required=True, blocks=True, org=ORG):
    return {
        'id': 'a-1', 'organization_id': org, 'user_id': PARENT,
        'audience': 'family', 'blocks_access': blocks,
        'template_name': 'Media release',
        'items': [{'key': 'sign', 'title': 'Sign: Media release',
                   'required': required, 'needs_signature': True, 'status': status}],
    }


def _db(assignments, user_row=None):
    """Stub the two tables the gate reads: assignments, and the user's roles."""
    def _table(name):
        t = Mock()
        for chained in ('select', 'eq', 'order', 'limit'):
            getattr(t, chained).return_value = t
        if name == 'users':
            t.execute.return_value = Mock(
                data=[user_row if user_row is not None
                      else {'role': 'org_managed', 'org_role': 'parent', 'org_roles': ['parent']}])
        else:
            t.execute.return_value = Mock(data=assignments)
        return t
    admin = Mock()
    admin.table.side_effect = _table
    return admin


@pytest.fixture(autouse=True)
def _no_cache():
    """Each test starts with an empty clear-cache, or the previous test's
    'this person is fine' answer decides this one."""
    gate.clear_cache()
    yield
    gate.clear_cache()


@pytest.mark.unit
class TestWhoIsHeld:

    def test_a_guardian_with_an_unsigned_required_document_is_held(self):
        with patch.object(gate, '_admin', return_value=_db([_assignment()])):
            assert gate.is_blocked(PARENT) is True

    def test_signing_the_last_item_lifts_the_hold(self):
        with patch.object(gate, '_admin',
                          return_value=_db([_assignment(status='complete')])):
            assert gate.is_blocked(PARENT) is False

    def test_an_approved_item_counts_as_done(self):
        with patch.object(gate, '_admin',
                          return_value=_db([_assignment(status='approved')])):
            assert gate.is_blocked(PARENT) is False

    def test_a_rejected_item_still_holds(self):
        # The office sent it back, so it is not done.
        with patch.object(gate, '_admin',
                          return_value=_db([_assignment(status='rejected')])):
            assert gate.is_blocked(PARENT) is True

    def test_an_optional_item_holds_nobody(self):
        with patch.object(gate, '_admin',
                          return_value=_db([_assignment(required=False)])):
            assert gate.is_blocked(PARENT) is False

    def test_paperwork_nobody_marked_required_holds_nobody(self):
        # blocks_access is filtered in the query, so an unmarked send simply
        # never comes back — the belt to that query's braces.
        with patch.object(gate, '_admin', return_value=_db([])):
            assert gate.is_blocked(PARENT) is False

    def test_staff_are_never_held(self):
        """A parent who also teaches keeps their classroom.

        Holding them would take a teacher's whole job away over their own
        child's permission slip — and their teaching is not what is being
        gated. Mirrors the registration gate's exemption for dual-role staff.
        """
        staff = {'role': 'org_managed', 'org_role': 'advisor',
                 'org_roles': ['advisor', 'parent']}
        with patch.object(gate, '_admin', return_value=_db([_assignment()], user_row=staff)):
            assert gate.is_blocked(PARENT) is False

    def test_an_admin_is_never_held(self):
        admin_row = {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin']}
        with patch.object(gate, '_admin',
                          return_value=_db([_assignment()], user_row=admin_row)):
            assert gate.is_blocked(PARENT) is False

    def test_no_user_id_is_not_held(self):
        assert gate.is_blocked(None) is False
        assert gate.is_blocked('') is False


@pytest.mark.unit
class TestFailureModes:

    def test_an_unreadable_assignments_table_does_not_lock_anybody_out(self):
        """Fail open, on purpose.

        This gate exists to hold one family over one document. If a database
        hiccup could make it hold EVERY family, the feature would be a bigger
        outage risk than the problem it solves.
        """
        admin = Mock()
        admin.table.side_effect = RuntimeError('postgrest is having a day')
        with patch.object(gate, '_admin', return_value=admin):
            assert gate.is_blocked(PARENT) is False

    def test_an_unreadable_user_row_does_not_lock_anybody_out(self):
        def _table(name):
            t = Mock()
            for chained in ('select', 'eq', 'order', 'limit'):
                getattr(t, chained).return_value = t
            if name == 'users':
                raise RuntimeError('role lookup failed')
            t.execute.return_value = Mock(data=[_assignment()])
            return t
        admin = Mock()
        admin.table.side_effect = _table
        with patch.object(gate, '_admin', return_value=admin):
            assert gate.is_blocked(PARENT) is False


@pytest.mark.unit
class TestCaching:

    def test_a_clear_answer_is_cached_so_ordinary_traffic_skips_the_query(self):
        admin = _db([])
        with patch.object(gate, '_admin', return_value=admin):
            assert gate.is_blocked(PARENT) is False
            calls = admin.table.call_count
            assert gate.is_blocked(PARENT) is False
            assert admin.table.call_count == calls, 'second check should hit the cache'

    def test_a_held_answer_is_never_cached_so_signing_frees_them_at_once(self):
        """The one failure mode that must not exist: signing, and staying out.

        Caching 'held' would strand a parent for the cache's lifetime in every
        worker that had already seen them — with no invalidation path that
        reaches the others.
        """
        held = _db([_assignment()])
        with patch.object(gate, '_admin', return_value=held):
            assert gate.is_blocked(PARENT) is True
        signed = _db([_assignment(status='complete')])
        with patch.object(gate, '_admin', return_value=signed):
            assert gate.is_blocked(PARENT) is False, 'the hold must lift on the next request'

    def test_clearing_the_cache_re_asks(self):
        clear = _db([])
        with patch.object(gate, '_admin', return_value=clear):
            assert gate.is_blocked(PARENT) is False
        gate.clear_cache(PARENT)
        with patch.object(gate, '_admin', return_value=_db([_assignment()])):
            assert gate.is_blocked(PARENT) is True


@pytest.mark.unit
class TestStatusPayload:

    def test_it_returns_the_documents_that_lift_the_hold(self):
        admin = _db([_assignment()])
        with patch.object(gate, '_admin', return_value=admin), \
             patch('services.sis_onboarding_service._attach_sign_docs'):
            result = sis_access_gate.status(PARENT)
        assert result['blocked'] is True
        assert result['organization_id'] == ORG
        assert len(result['assignments']) == 1
        assert result['assignments'][0]['template_name'] == 'Media release'
        # The signing UI shows the exact sentence the signature records.
        assert result['assignments'][0]['signature_statement']

    def test_nothing_outstanding_is_a_plain_false(self):
        with patch.object(gate, '_admin', return_value=_db([])):
            assert sis_access_gate.status(PARENT) == {'blocked': False, 'assignments': []}

    def test_staff_get_a_plain_false_too(self):
        staff = {'role': 'org_managed', 'org_role': 'advisor', 'org_roles': ['advisor']}
        with patch.object(gate, '_admin', return_value=_db([_assignment()], user_row=staff)):
            assert sis_access_gate.status(PARENT)['blocked'] is False


@pytest.mark.unit
class TestRelease:

    def test_the_office_can_let_a_family_back_in_without_a_signature(self):
        """The escape hatch. A family with no device, or a document sent to the
        wrong person, must not be stuck on a screen whose only exit is the
        action they cannot take."""
        updated = {}

        def _table(name):
            t = Mock()
            for chained in ('select', 'eq', 'limit'):
                getattr(t, chained).return_value = t

            def _update(payload):
                updated.update(payload)
                return t
            t.update.side_effect = _update
            t.execute.return_value = Mock(data=[{
                'id': 'a-1', 'user_id': PARENT,
                'organization_id': ORG, 'blocks_access': True}])
            return t
        admin = Mock()
        admin.table.side_effect = _table

        with patch.object(gate, '_admin', return_value=admin):
            result = gate.release(ORG, 'a-1')
        assert result == {'released': True, 'user_id': PARENT}
        assert updated == {'blocks_access': False}

    def test_another_orgs_assignment_is_not_found(self):
        admin = Mock()
        t = Mock()
        for chained in ('select', 'eq', 'limit', 'update'):
            getattr(t, chained).return_value = t
        t.execute.return_value = Mock(data=[{
            'id': 'a-1', 'user_id': PARENT,
            'organization_id': 'someone-else', 'blocks_access': True}])
        admin.table.return_value = t
        with patch.object(gate, '_admin', return_value=admin):
            assert gate.release(ORG, 'a-1')['status'] == 404
