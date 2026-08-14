"""Tests for peer connections -- the safety properties, not the plumbing.

Each test names the way the feature could be unsafe rather than the branch it
covers. The four things that must stay true:

  * an under-13 cannot get in, and cannot retry their way in
  * both families consent, and one family never consents for another
  * a school only stands in where the school exception applies
  * revocation and blocking actually cut access off
"""

from datetime import date, timedelta
from unittest.mock import Mock, patch

import pytest


def _dob(years):
    return (date.today() - timedelta(days=int(365.25 * years))).isoformat()


# ---------------------------------------------------------------------------
# is_under_13 -- the COPPA line, distinct from the 18 line
# ---------------------------------------------------------------------------

def test_missing_dob_is_treated_as_under_13():
    """Fails closed for the same reason is_minor does: no date of birth is
    missing information, not evidence of age. 223 of 522 students are in this
    state, so getting it backwards would open the feature to most of them."""
    from utils.portfolio_access import is_under_13

    assert is_under_13({'id': 'u1', 'date_of_birth': None}) is True
    assert is_under_13({}) is True
    assert is_under_13(None) is True


def test_unparseable_dob_is_treated_as_under_13():
    from utils.portfolio_access import is_under_13

    assert is_under_13({'id': 'u1', 'date_of_birth': 'not-a-date'}) is True


def test_thirteen_is_not_under_13():
    from utils.portfolio_access import is_under_13

    assert is_under_13({'id': 'u1', 'date_of_birth': _dob(13.1)}) is False


def test_twelve_is_under_13():
    from utils.portfolio_access import is_under_13

    assert is_under_13({'id': 'u1', 'date_of_birth': _dob(12)}) is True


def test_under_13_does_not_reuse_the_18_threshold():
    """A 15-year-old is a minor for publishing but is old enough for COPPA.
    Collapsing the two questions would lock every teenager out of the feature
    or, worse, let the 18-line answer stand in for the 13-line one."""
    from utils.portfolio_access import is_minor, is_under_13

    fifteen = {'id': 'u1', 'date_of_birth': _dob(15), 'is_dependent': False}
    assert is_minor(fifteen) is True
    assert is_under_13(fifteen) is False


def test_dependent_flag_does_not_by_itself_mean_under_13():
    """is_minor treats is_dependent as decisive; is_under_13 must not. A
    parent-managed 15-year-old is still 15."""
    from utils.portfolio_access import is_under_13

    assert is_under_13({'id': 'u1', 'date_of_birth': _dob(15),
                        'is_dependent': True}) is False


# ---------------------------------------------------------------------------
# The age screen -- one shot, records the honest answer
# ---------------------------------------------------------------------------

class _FakeTable:
    """Minimal stand-in for the PostgREST builder used by the service."""

    def __init__(self, store, name):
        self.store, self.name = store, name
        self._update = None

    def select(self, *a, **k): return self
    def eq(self, *a, **k): return self
    def limit(self, *a, **k): return self
    def is_(self, *a, **k): return self

    def update(self, payload):
        self._update = payload
        return self

    def execute(self):
        if self._update is not None:
            self.store.setdefault('updates', []).append((self.name, self._update))
            return Mock(data=[self._update])
        return Mock(data=self.store.get(self.name, []))


def _fake_admin(users_row, store=None):
    store = store if store is not None else {}
    store['users'] = [users_row] if users_row else []
    client = Mock()
    client.table.side_effect = lambda name: _FakeTable(store, name)
    return client, store


def test_age_screen_records_an_under_13_answer_instead_of_rejecting_it():
    """THE central test. PUT /api/users/profile raises on an under-13 date,
    which for an age screen means the child gets an error and a form still
    waiting for input -- so they retype the year until it passes. The screen
    must accept the honest answer, store it, and lock it."""
    from services import peer_connection_service as svc

    client, store = _fake_admin({'id': 'u1', 'date_of_birth': None,
                                 'date_of_birth_locked_at': None,
                                 'is_dependent': False})
    with patch.object(svc, '_admin', return_value=client):
        with patch.object(svc, 'eligibility', return_value={'state': svc.UNDER_13,
                                                            'reason': 'x'}):
            result = svc.age_check('u1', _dob(10))

    assert result['state'] == svc.UNDER_13
    written = [u for (t, u) in store['updates'] if t == 'users']
    assert written, 'the under-13 date of birth must be persisted, not discarded'
    assert written[0]['date_of_birth_locked_at'] is not None


def test_age_screen_refuses_a_second_answer():
    """Without the lock the gate is decorative: a blocked student answers again
    with a different year."""
    from services import peer_connection_service as svc

    client, _ = _fake_admin({'id': 'u1', 'date_of_birth': _dob(10),
                             'date_of_birth_locked_at': '2026-08-14T00:00:00Z',
                             'is_dependent': False})
    with patch.object(svc, '_admin', return_value=client):
        with pytest.raises(svc.PeerConnectionError, match='already on file'):
            svc.age_check('u1', _dob(14))


def test_age_screen_refuses_a_dependent():
    """A dependent's date of birth belongs to their parent; letting the child
    self-attest would route around the adult who manages it."""
    from services import peer_connection_service as svc

    client, _ = _fake_admin({'id': 'u1', 'date_of_birth': None,
                             'date_of_birth_locked_at': None,
                             'is_dependent': True})
    with patch.object(svc, '_admin', return_value=client):
        with pytest.raises(svc.PeerConnectionError, match='parent or guardian'):
            svc.age_check('u1', _dob(14))


def test_eligibility_sends_unknown_age_to_the_screen_not_to_a_refusal():
    """A student of unknown age must be asked, not told no. This is the
    distinction the old portfolio gate got wrong by showing the under-18
    explanation to people whose age simply wasn't on file."""
    from services import peer_connection_service as svc

    client, _ = _fake_admin({'id': 'u1', 'date_of_birth': None,
                             'date_of_birth_locked_at': None,
                             'is_dependent': False})
    with patch.object(svc, '_admin', return_value=client):
        assert svc.eligibility('u1')['state'] == svc.NEEDS_DOB


def test_eligibility_points_a_dependent_at_their_parent():
    from services import peer_connection_service as svc

    client, _ = _fake_admin({'id': 'u1', 'date_of_birth': None,
                             'date_of_birth_locked_at': None,
                             'is_dependent': True})
    with patch.object(svc, '_admin', return_value=client):
        assert svc.eligibility('u1')['state'] == svc.NEEDS_PARENT_DOB


# ---------------------------------------------------------------------------
# Approver resolution -- the school exception has edges
# ---------------------------------------------------------------------------

def test_org_admin_may_stand_in_for_two_students_in_the_same_org():
    from services import peer_connection_service as svc

    client = Mock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = Mock(
        data=[{'id': 'a', 'organization_id': 'org1'},
              {'id': 'b', 'organization_id': 'org1'}]
    )
    with patch.object(svc, '_admin', return_value=client):
        with patch.object(svc.pa, 'find_approver',
                          return_value={'user_id': 'admin1', 'kind': 'org_admin',
                                        'first_name': 'Pat'}):
            approver = svc._resolve_approver('a', 'b')

    assert approver['kind'] == 'org_admin'


def test_org_admin_may_not_consent_across_organizations():
    """The COPPA school exception covers educational use within the school. A
    principal can speak for two children in their building; nobody appointed
    them to consent to a child connecting with a stranger at another school."""
    from services import peer_connection_service as svc

    client = Mock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = Mock(
        data=[{'id': 'a', 'organization_id': 'org1'},
              {'id': 'b', 'organization_id': 'org2'}]
    )
    with patch.object(svc, '_admin', return_value=client):
        with patch.object(svc.pa, 'find_approver',
                          return_value={'user_id': 'admin1', 'kind': 'org_admin',
                                        'first_name': 'Pat'}):
            with pytest.raises(svc.PeerConnectionError, match='outside your school'):
                svc._resolve_approver('a', 'b')


def test_no_approver_at_all_blocks_the_connection():
    """A platform student with no parent has nobody accountable. The honest
    answer is that the connection cannot be formed."""
    from services import peer_connection_service as svc

    with patch.object(svc.pa, 'find_approver', return_value=None):
        with pytest.raises(svc.PeerConnectionError, match='could not find a parent'):
            svc._resolve_approver('a', 'b')


# ---------------------------------------------------------------------------
# Activation -- the single writer of 'active'
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('approvals,expect_active', [
    ([], False),
    ([{'status': 'approved'}], False),                      # only one side
    ([{'status': 'approved'}, {'status': 'pending'}], False),
    ([{'status': 'approved'}, {'status': 'declined'}], False),
    ([{'status': 'approved'}, {'status': 'approved'}], True),
])
def test_activation_requires_both_sides(approvals, expect_active):
    """One family must never be able to consent on another family's behalf --
    including by being the only one asked."""
    from services import peer_connection_service as svc

    client = Mock()
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = Mock(
        data=approvals
    )
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = Mock(
        data=[{'id': 'c1', 'status': 'active',
               'requester_id': 'a', 'addressee_id': 'b'}]
    )

    with patch.object(svc, '_admin', return_value=client):
        with patch.object(svc, '_get_connection',
                          return_value={'id': 'c1', 'status': 'pending_approval',
                                        'requester_id': 'a', 'addressee_id': 'b'}):
            with patch.object(svc, '_notify'), \
                 patch.object(svc, '_display_name', return_value='Sam'):
                result = svc._maybe_activate('c1')

    assert (result['status'] == 'active') is expect_active


# ---------------------------------------------------------------------------
# is_peer_of -- what downstream access actually reads
# ---------------------------------------------------------------------------

def test_only_an_active_connection_counts_as_a_peer():
    """A pending or revoked row must not grant access; is_peer_of reads status
    rather than mere existence."""
    from utils import portfolio_access as pa

    client = Mock()
    client.table.return_value.select.return_value.eq.return_value.or_.return_value \
        .limit.return_value.execute.return_value = Mock(data=[])
    with patch.object(pa, '_admin', return_value=client):
        assert pa.is_peer_of('a', 'b') is False


def test_a_block_beats_an_active_connection():
    """Blocking must work without unwinding the connection and asking two
    parents to approve it again."""
    from utils import portfolio_access as pa

    client = Mock()
    client.table.return_value.select.return_value.eq.return_value.or_.return_value \
        .limit.return_value.execute.return_value = Mock(data=[{'id': 'c1'}])
    with patch.object(pa, '_admin', return_value=client):
        with patch.object(pa, 'is_blocked_between', return_value=True):
            assert pa.is_peer_of('a', 'b') is False


def test_nobody_is_their_own_peer():
    from utils import portfolio_access as pa

    assert pa.is_peer_of('a', 'a') is False


# ---------------------------------------------------------------------------
# The XP-goal carve-out
# ---------------------------------------------------------------------------

def test_peers_do_not_inherit_xp_goal_visibility():
    """A connection is consent to show another student your work. A weekly XP
    target is a private goal that happens to live behind the same helper, and
    turning it into a number your friends can see is a disclosure no parent
    approved."""
    from services import xp_goal_service

    with patch('utils.portfolio_access.can_view_portfolio') as mock_view:
        mock_view.return_value = False
        xp_goal_service.can_view_goal('peer', 'student')

    assert mock_view.call_args.kwargs.get('allow_peers') is False


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

def test_commenting_requires_an_active_connection():
    from services import peer_connection_service as svc

    with patch.object(svc.pa, 'is_peer_of', return_value=False):
        with pytest.raises(svc.PeerConnectionError, match='not connected'):
            svc.add_comment('a', 'b', 'nice work', learning_event_id='le1')


def test_a_comment_must_name_exactly_one_item():
    from services import peer_connection_service as svc

    with patch.object(svc.pa, 'is_peer_of', return_value=True):
        with pytest.raises(svc.PeerConnectionError, match='exactly one item'):
            svc.add_comment('a', 'b', 'hi', learning_event_id='le1',
                            quest_id='q1')
        with pytest.raises(svc.PeerConnectionError, match='exactly one item'):
            svc.add_comment('a', 'b', 'hi')


def test_empty_comment_is_refused():
    from services import peer_connection_service as svc

    with patch.object(svc.pa, 'is_peer_of', return_value=True):
        with pytest.raises(svc.PeerConnectionError, match='cannot be empty'):
            svc.add_comment('a', 'b', '   ', learning_event_id='le1')


def test_overlong_comment_is_refused():
    from services import peer_connection_service as svc

    with patch.object(svc.pa, 'is_peer_of', return_value=True):
        with pytest.raises(svc.PeerConnectionError, match='characters or fewer'):
            svc.add_comment('a', 'b', 'x' * (svc.MAX_COMMENT_LENGTH + 1),
                            learning_event_id='le1')


def test_a_third_party_cannot_read_peer_comments():
    from services import peer_connection_service as svc

    with patch.object(svc.pa, 'can_view_portfolio', return_value=False):
        with pytest.raises(svc.PeerConnectionError, match='Not authorized'):
            svc.list_comments('stranger', 'student', learning_event_id='le1')


def test_only_the_author_or_the_work_owner_may_delete_a_comment():
    """The student whose work it is can remove anything left on it without
    filing a report and waiting -- that is the difference between a moderation
    queue and control over your own page."""
    from services import peer_connection_service as svc

    client = Mock()
    client.table.return_value.select.return_value.eq.return_value.limit.return_value \
        .execute.return_value = Mock(data=[{'id': 'c1', 'author_id': 'a',
                                            'student_id': 'b'}])
    with patch.object(svc, '_admin', return_value=client):
        with pytest.raises(svc.PeerConnectionError, match='not found'):
            svc.delete_comment('stranger', 'c1')
        svc.delete_comment('a', 'c1')   # author
        svc.delete_comment('b', 'c1')   # owner of the work


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

def test_an_invalid_and_an_expired_code_are_indistinguishable():
    """A differentiated error turns the code field into an oracle for probing
    which codes exist."""
    from services import peer_connection_service as svc

    with patch.object(svc, '_require_eligible'):
        with patch.object(svc, '_resolve_code', return_value=None):
            with pytest.raises(svc.PeerConnectionError) as expired:
                svc.request_by_code('a', 'EXPIRED1')
            with pytest.raises(svc.PeerConnectionError) as missing:
                svc.request_by_code('a', 'NOSUCH12')

    assert str(expired.value) == str(missing.value)


def test_an_under_13_code_holder_cannot_be_connected_to():
    """Both ends of a connection are age-gated. Checking only the initiator
    would let a 14-year-old pull a 10-year-old in."""
    from services import peer_connection_service as svc

    with patch.object(svc, '_require_eligible'):
        with patch.object(svc, '_resolve_code', return_value='child'):
            with patch.object(svc.pa, 'is_under_13_by_id', return_value=True):
                with pytest.raises(svc.PeerConnectionError, match='not valid'):
                    svc.request_by_code('a', 'CODE1234')


def test_you_cannot_connect_to_yourself():
    from services import peer_connection_service as svc

    with patch.object(svc, '_require_eligible'):
        with patch.object(svc, '_resolve_code', return_value='a'):
            with pytest.raises(svc.PeerConnectionError, match='your own code'):
                svc.request_by_code('a', 'CODE1234')


def test_share_codes_avoid_ambiguous_glyphs():
    """Children type these by hand off a screen; 0/O and 1/I/L collisions turn
    a safety mechanism into a support ticket."""
    from services import peer_connection_service as svc

    for bad in '01OIL':
        assert bad not in svc.CODE_ALPHABET


# ---------------------------------------------------------------------------
# The approval email
# ---------------------------------------------------------------------------

def _approver_row(email='mum@example.com'):
    client = Mock()
    client.table.return_value.select.return_value.eq.return_value.limit.return_value \
        .execute.return_value = Mock(data=[{'id': 'mum', 'email': email,
                                            'first_name': 'Mo',
                                            'display_name': 'Mo P'}])
    return client


def test_approver_email_names_both_students_and_the_right_template():
    from services import peer_connection_service as svc

    with patch.object(svc, '_admin', return_value=_approver_row()), \
         patch.object(svc, '_display_name',
                      side_effect=lambda uid: {'kid': 'Ada', 'friend': 'Linus'}[uid]), \
         patch('services.email_service.email_service') as mail:
        svc._email_approver({'user_id': 'mum', 'kind': 'parent'}, 'kid', 'friend')

    kwargs = mail.send_peer_connection_approval_email.call_args.kwargs
    assert kwargs['approver_email'] == 'mum@example.com'
    assert kwargs['child_name'] == 'Ada'
    assert kwargs['peer_name'] == 'Linus'
    assert kwargs['approver_kind'] == 'parent'


def test_a_school_approver_gets_the_school_wording():
    """An administrator needs telling from the email alone why they are the one
    being asked, without signing in to find out."""
    from services import peer_connection_service as svc

    with patch.object(svc, '_admin', return_value=_approver_row('head@school.org')), \
         patch.object(svc, '_display_name', side_effect=lambda uid: uid), \
         patch('services.email_service.email_service') as mail:
        svc._email_approver({'user_id': 'mum', 'kind': 'org_admin'}, 'kid', 'friend')

    assert mail.send_peer_connection_approval_email.call_args.kwargs['approver_kind'] == 'org_admin'


def test_a_failed_email_does_not_break_the_request():
    """The in-app notification is already written, so a bounced send must not
    roll back an accept the two students already made."""
    from services import peer_connection_service as svc

    with patch.object(svc, '_admin', return_value=_approver_row()), \
         patch.object(svc, '_display_name', side_effect=lambda uid: uid), \
         patch('services.email_service.email_service') as mail:
        mail.send_peer_connection_approval_email.side_effect = RuntimeError('smtp down')
        svc._email_approver({'user_id': 'mum', 'kind': 'parent'}, 'kid', 'friend')
        # no exception


def test_an_approver_with_no_email_is_skipped_quietly():
    from services import peer_connection_service as svc

    with patch.object(svc, '_admin', return_value=_approver_row(email=None)), \
         patch.object(svc, '_display_name', side_effect=lambda uid: uid), \
         patch('services.email_service.email_service') as mail:
        svc._email_approver({'user_id': 'mum', 'kind': 'parent'}, 'kid', 'friend')

    mail.send_peer_connection_approval_email.assert_not_called()


def test_both_approvers_are_emailed_when_the_second_student_accepts():
    """One email per side. Emailing only the initiator's parent would leave the
    other family's approval sitting in an inbox nobody checks."""
    from services import peer_connection_service as svc

    conn = {'id': 'c1', 'status': 'pending_addressee',
            'requester_id': 'a', 'addressee_id': 'b'}
    client = Mock()
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = Mock(
        data=[{**conn, 'status': 'pending_approval'}])
    client.table.return_value.insert.return_value.execute.return_value = Mock(data=[{}])

    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_get_connection', return_value=conn), \
         patch.object(svc, '_require_eligible'), \
         patch.object(svc, '_display_name', side_effect=lambda uid: uid), \
         patch.object(svc, '_notify'), \
         patch.object(svc, '_resolve_approver',
                      side_effect=lambda sid, oid: {'user_id': f'parent_of_{sid}',
                                                    'kind': 'parent',
                                                    'first_name': 'P'}), \
         patch.object(svc, '_email_approver') as mailer:
        svc.respond_to_request('b', 'c1', accept=True)

    emailed = {c.args[0]['user_id'] for c in mailer.call_args_list}
    assert emailed == {'parent_of_a', 'parent_of_b'}


def test_no_email_goes_out_when_the_student_declines():
    from services import peer_connection_service as svc

    conn = {'id': 'c1', 'status': 'pending_addressee',
            'requester_id': 'a', 'addressee_id': 'b'}
    client = Mock()
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = Mock(
        data=[{**conn, 'status': 'declined'}])

    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_get_connection', return_value=conn), \
         patch.object(svc, '_email_approver') as mailer:
        svc.respond_to_request('b', 'c1', accept=False)

    mailer.assert_not_called()


# ---------------------------------------------------------------------------
# The feed
# ---------------------------------------------------------------------------

def test_feed_asks_for_own_items_plus_active_peers():
    from services import peer_connection_service as svc

    with patch.object(svc, 'active_peer_ids', return_value=['b', 'c']), \
         patch.object(svc, '_admin'), \
         patch('services.activity_feed_service.build_activity_feed') as build:
        build.return_value = {'items': [], 'has_more': False, 'next_cursor': None}
        result = svc.feed('a')

    ids = build.call_args.args[1]
    assert ids == ['a', 'b', 'c']
    assert result['peer_count'] == 2


def test_feed_scopes_confidentiality_to_the_viewer_alone():
    """The sharpest edge of widening the feed. is_confidential is 'hide this
    from my observers'; on your own feed you still see it so you can unhide it.
    When peers join the feed that must NOT extend to their hidden items."""
    from services import peer_connection_service as svc

    with patch.object(svc, 'active_peer_ids', return_value=['b']), \
         patch.object(svc, '_admin'), \
         patch('services.activity_feed_service.build_activity_feed') as build:
        build.return_value = {'items': [], 'has_more': False, 'next_cursor': None}
        svc.feed('a')

    assert build.call_args.kwargs['confidential_ok_for'] == {'a'}


def test_a_block_removes_a_peer_from_the_feed():
    from services import peer_connection_service as svc

    client = Mock()
    client.table.return_value.select.return_value.eq.return_value.or_.return_value \
        .execute.return_value = Mock(data=[{'requester_id': 'a', 'addressee_id': 'b'}])

    with patch.object(svc, '_admin', return_value=client):
        with patch.object(svc.pa, 'is_blocked_between', return_value=True):
            assert svc.active_peer_ids('a') == []
        with patch.object(svc.pa, 'is_blocked_between', return_value=False):
            assert svc.active_peer_ids('a') == ['b']


def test_build_activity_feed_drops_other_peoples_hidden_items():
    """Asserted against the assembler itself, not just the caller: a hidden item
    must be dropped before shaping, so it cannot leak through a comment count or
    a pagination cursor."""
    from services.activity_feed_service import build_activity_feed

    completions = [
        {'id': 'c1', 'user_id': 'me', 'quest_id': None, 'user_quest_task_id': None,
         'completed_at': '2026-08-10T00:00:00Z', 'evidence_url': None,
         'evidence_text': 'mine hidden', 'is_confidential': True},
        {'id': 'c2', 'user_id': 'peer', 'quest_id': None, 'user_quest_task_id': None,
         'completed_at': '2026-08-11T00:00:00Z', 'evidence_url': None,
         'evidence_text': 'theirs hidden', 'is_confidential': True},
        {'id': 'c3', 'user_id': 'peer', 'quest_id': None, 'user_quest_task_id': None,
         'completed_at': '2026-08-12T00:00:00Z', 'evidence_url': None,
         'evidence_text': 'theirs open', 'is_confidential': False},
    ]

    def table(name):
        t = Mock()
        if name == 'quest_task_completions':
            t.select.return_value.in_.return_value.order.return_value.limit.return_value \
                .execute.return_value = Mock(data=completions)
        elif name == 'users':
            t.select.return_value.in_.return_value.execute.return_value = Mock(
                data=[{'id': 'me', 'display_name': 'Me'},
                      {'id': 'peer', 'display_name': 'Peer'}])
        else:
            # learning_events and every lookup table: empty.
            m = Mock(data=[])
            t.select.return_value.in_.return_value.order.return_value.limit.return_value.execute.return_value = m
            t.select.return_value.in_.return_value.execute.return_value = m
            t.select.return_value.in_.return_value.eq.return_value.execute.return_value = m
            t.select.return_value.in_.return_value.in_.return_value.eq.return_value.execute.return_value = m
            t.select.return_value.in_.return_value.is_.return_value.execute.return_value = m
            t.select.return_value.in_.return_value.eq.return_value.order.return_value.execute.return_value = m
        return t

    supabase = Mock()
    supabase.table.side_effect = table

    result = build_activity_feed(supabase, ['me', 'peer'],
                                 confidential_ok_for={'me'})
    ids = {i['id'] for i in result['items']}

    assert 'c1' in ids, "my own hidden item stays visible to me"
    assert 'c2' not in ids, "a peer's hidden item must never reach me"
    assert 'c3' in ids


# ---------------------------------------------------------------------------
# What a parent can do after approving
# ---------------------------------------------------------------------------

def test_approved_connections_lists_only_live_ones_this_adult_approved():
    """A revoked or declined connection is not something to manage, and another
    family's approval is not this parent's business."""
    from services import peer_connection_service as svc

    approvals = [
        {'id': 'a1', 'connection_id': 'live', 'student_id': 'kid',
         'approver_kind': 'parent', 'responded_at': 'x'},
        {'id': 'a2', 'connection_id': 'dead', 'student_id': 'kid',
         'approver_kind': 'parent', 'responded_at': 'x'},
    ]
    conns = {
        'live': {'id': 'live', 'status': 'active', 'requester_id': 'kid',
                 'addressee_id': 'friend', 'activated_at': 'y'},
        'dead': {'id': 'dead', 'status': 'revoked', 'requester_id': 'kid',
                 'addressee_id': 'friend', 'activated_at': 'y'},
    }

    client = Mock()
    client.table.return_value.select.return_value.eq.return_value.eq.return_value \
        .execute.return_value = Mock(data=approvals)

    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_get_connection', side_effect=lambda cid: conns[cid]), \
         patch.object(svc, '_peer_profile',
                      side_effect=lambda uid: {'id': uid, 'display_name': uid}):
        out = svc.approved_connections('mum')

    assert [c['connection_id'] for c in out] == ['live']


# ---------------------------------------------------------------------------
# Revocation
# ---------------------------------------------------------------------------

def test_either_student_and_either_approver_may_revoke():
    """Consent that can only be granted is not consent."""
    from services import peer_connection_service as svc

    conn = {'id': 'c1', 'status': 'active', 'requester_id': 'a',
            'addressee_id': 'b'}
    client = Mock()
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = Mock(
        data=[{'approver_id': 'mum'}, {'approver_id': 'dad'}]
    )
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = Mock(
        data=[{**conn, 'status': 'revoked'}]
    )

    with patch.object(svc, '_admin', return_value=client):
        with patch.object(svc, '_get_connection', return_value=conn):
            for who in ('a', 'b', 'mum', 'dad'):
                assert svc.revoke(who, 'c1')['status'] == 'revoked'

            with pytest.raises(svc.PeerConnectionError, match='not found'):
                svc.revoke('stranger', 'c1')
