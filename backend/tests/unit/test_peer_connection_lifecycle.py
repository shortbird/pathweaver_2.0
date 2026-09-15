"""The connection lifecycle under a family's policy.

What must stay true:

  * a side whose policy is 'auto' is settled from the row on file, attributed
    to whoever set it, method 'policy'; a side whose policy is 'ask_first'
    still waits for an explicit answer; a side whose policy is off ends it
  * a parent accepting for their own child has answered; they are not asked
    again
  * any current parent of a side may answer, not only the one recorded
  * a request by id comes from a vetted pool or not at all
  * a request on a child's behalf records who really made it
  * _maybe_activate is still the only writer of 'active', and it tells the
    parents who did not answer explicitly
"""

import inspect
import re
from unittest.mock import Mock, patch

import pytest

from services import peer_connection_service as svc
from services.peer_policy_service import EffectivePolicy


CONN = {'id': 'c1', 'status': 'pending_addressee', 'requester_id': 'a', 'addressee_id': 'b'}

# request() interpolates both ids into a PostgREST filter, which pgrst_uuid
# refuses for anything that is not a UUID -- so the discovery tests use real
# ones, and a name map keeps the assertions readable.
REQ = '11111111-1111-4111-8111-111111111111'
PEER = '22222222-2222-4222-8222-222222222222'
NAMES = {REQ: 'Ada', PEER: 'Linus'}


def _named(uid):
    return NAMES.get(uid, uid)


def _client(update_result=None, approvals=None):
    client = Mock()
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = Mock(
        data=[update_result or {**CONN, 'status': 'pending_approval'}])
    client.table.return_value.insert.return_value.execute.return_value = Mock(data=[{}])
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = Mock(
        data=approvals or [])
    # approver_decision filters on connection AND status
    client.table.return_value.select.return_value.eq.return_value.eq.return_value \
        .execute.return_value = Mock(data=approvals or [])
    return client


def _inserted(client):
    return [c.args[0] for c in client.table.return_value.insert.call_args_list]


def _side(mode, kind='parent'):
    def consent(sid, oid):
        return {'mode': mode(sid) if callable(mode) else mode,
                'approver': {'user_id': f'parent_of_{sid}', 'kind': kind}}
    return consent


# ---------------------------------------------------------------------------
# Settling each side
# ---------------------------------------------------------------------------

def test_two_auto_sides_activate_in_the_accepting_call():
    """The whole point. Both families' answers are on file, so the accept IS
    the activation -- no inbox, no email, no waiting on anyone."""
    active = {**CONN, 'status': 'active'}
    client = _client(approvals=[{'status': 'approved', 'student_id': 'a', 'method': 'policy'},
                                {'status': 'approved', 'student_id': 'b', 'method': 'policy'}])
    # the second update (the activation) must return the active row
    client.table.return_value.update.return_value.eq.return_value.execute.side_effect = [
        Mock(data=[{**CONN, 'status': 'pending_approval'}]), Mock(data=[active])]

    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_get_connection', return_value=CONN), \
         patch.object(svc, '_require_eligible'), \
         patch.object(svc, '_display_name', side_effect=lambda uid: uid), \
         patch.object(svc, '_notify'), \
         patch.object(svc, '_tell_parents_after_the_fact') as told, \
         patch.object(svc, '_side_consent', side_effect=_side('auto')), \
         patch.object(svc, '_email_approver') as mailer:
        result = svc.respond_to_request('b', 'c1', accept=True)

    assert result['status'] == 'active'
    rows = _inserted(client)
    assert {r['student_id'] for r in rows} == {'a', 'b'}
    for r in rows:
        assert r['status'] == 'approved'
        assert r['method'] == 'policy'
        assert r['approver_id'] == f"parent_of_{r['student_id']}"
        assert r['decided_by_user_id'] is None
    mailer.assert_not_called()
    told.assert_called_once()


def test_an_ask_first_side_still_waits():
    client = _client(approvals=[{'status': 'approved', 'student_id': 'a', 'method': 'policy'},
                                {'status': 'pending', 'student_id': 'b', 'method': 'explicit'}])

    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_get_connection',
                      side_effect=[CONN, {**CONN, 'status': 'pending_approval'}]), \
         patch.object(svc, '_require_eligible'), \
         patch.object(svc, '_display_name', side_effect=lambda uid: uid), \
         patch.object(svc, '_notify') as notify, \
         patch.object(svc, '_side_consent',
                      side_effect=_side(lambda sid: 'ask_first' if sid == 'b' else 'auto')), \
         patch.object(svc, '_email_approver') as mailer:
        result = svc.respond_to_request('b', 'c1', accept=True)

    assert result['status'] == 'pending_approval'
    by_student = {r['student_id']: r for r in _inserted(client)}
    assert by_student['a']['status'] == 'approved' and by_student['a']['method'] == 'policy'
    assert by_student['b']['status'] == 'pending' and by_student['b']['method'] == 'explicit'
    assert mailer.call_args.args[0]['user_id'] == 'parent_of_b'
    needs = [c for c in notify.call_args_list if c.args[1] == 'peer_connection_needs_approval']
    assert len(needs) == 1 and needs[0].args[0] == 'parent_of_b'
    assert needs[0].kwargs['link'] == '/family'


def test_a_side_that_cannot_consent_declines_the_whole_request():
    """It was on when the request was made and is not now, or the school is
    being asked to vouch for a stranger. Nothing may sit half-consented."""
    client = _client(update_result={**CONN, 'status': 'declined'})

    def consent(sid, oid):
        if sid == 'a':
            raise svc.PeerConnectionError("a's family hasn't turned on Friends yet.")
        return {'mode': 'auto', 'approver': {'user_id': 'parent_of_b', 'kind': 'parent'}}

    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_get_connection', return_value=CONN), \
         patch.object(svc, '_require_eligible'), \
         patch.object(svc, '_side_consent', side_effect=consent), \
         patch.object(svc, '_email_approver') as mailer:
        with pytest.raises(svc.PeerConnectionError, match="hasn't turned on Friends"):
            svc.respond_to_request('b', 'c1', accept=True)

    written = client.table.return_value.update.call_args.args[0]
    assert written['status'] == 'declined'
    assert _inserted(client) == []
    mailer.assert_not_called()


def test_a_parent_accepting_for_their_child_has_answered():
    """Their own side's 'ask me first' is satisfied by the act. The row says
    so: explicit, decided by them -- not 'policy', which would claim a
    standing consent they may not have given."""
    client = _client(approvals=[{'status': 'approved', 'student_id': 'a'},
                                {'status': 'approved', 'student_id': 'b'}])
    client.table.return_value.update.return_value.eq.return_value.execute.side_effect = [
        Mock(data=[{**CONN, 'status': 'pending_approval'}]),
        Mock(data=[{**CONN, 'status': 'active'}])]

    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_get_connection', return_value=CONN), \
         patch.object(svc, '_require_eligible'), \
         patch.object(svc, '_display_name', side_effect=lambda uid: uid), \
         patch.object(svc, '_notify'), \
         patch.object(svc, '_tell_parents_after_the_fact'), \
         patch.object(svc.pa, 'is_parent_of', side_effect=lambda p, s: p == 'mum' and s == 'b'), \
         patch.object(svc, '_side_consent', side_effect=_side('ask_first')), \
         patch.object(svc, '_email_approver') as mailer:
        svc.respond_to_request('b', 'c1', accept=True, acting_user_id='mum')

    by_student = {r['student_id']: r for r in _inserted(client)}
    assert by_student['b']['status'] == 'approved'
    assert by_student['b']['method'] == 'explicit'
    assert by_student['b']['decided_by_user_id'] == 'mum'
    # The other family still asked to be asked.
    assert by_student['a']['status'] == 'pending'
    assert mailer.call_args.args[0]['user_id'] == 'parent_of_a'


def test_a_side_backed_by_the_school_cannot_reach_across_schools():
    policy = EffectivePolicy(student_id='a', enabled=True,
                             approver={'user_id': 'head', 'kind': 'org_admin'})
    with patch.object(svc.policy_svc, 'effective_policy', return_value=policy), \
         patch.object(svc, '_same_org', return_value=False):
        with pytest.raises(svc.PeerConnectionError, match='outside your school'):
            svc._side_consent('a', 'b')
    with patch.object(svc.policy_svc, 'effective_policy', return_value=policy), \
         patch.object(svc, '_same_org', return_value=True):
        assert svc._side_consent('a', 'b')['approver']['user_id'] == 'head'


def test_a_side_with_friends_off_cannot_consent():
    policy = EffectivePolicy(student_id='a', enabled=False)
    with patch.object(svc.policy_svc, 'effective_policy', return_value=policy), \
         patch.object(svc, '_display_name', return_value='Ada'):
        with pytest.raises(svc.PeerConnectionError, match="Ada's family hasn't turned on"):
            svc._side_consent('a', 'b')


# ---------------------------------------------------------------------------
# Answering an ask-first request
# ---------------------------------------------------------------------------

def test_any_current_parent_of_that_side_may_answer():
    """A policy set by one parent must not lock the other out of a request
    the family is being asked about."""
    pending = [{'id': 'ap1', 'connection_id': 'c1', 'student_id': 'b',
                'approver_id': 'dad', 'status': 'pending'}]
    client = _client(approvals=pending)
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = Mock(
        data=[{**CONN, 'status': 'declined'}])

    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_get_connection', return_value={**CONN, 'status': 'pending_approval'}), \
         patch.object(svc, '_notify'), \
         patch.object(svc.pa, 'is_parent_of', side_effect=lambda p, s: p == 'mum'):
        svc.approver_decision('mum', 'c1', approve=False)

    stamped = client.table.return_value.update.call_args_list[0].args[0]
    assert stamped['decided_by_user_id'] == 'mum'
    assert stamped['status'] == 'declined'


def test_a_stranger_may_not_answer():
    pending = [{'id': 'ap1', 'connection_id': 'c1', 'student_id': 'b',
                'approver_id': 'dad', 'status': 'pending'}]
    client = _client(approvals=pending)
    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc.pa, 'is_parent_of', return_value=False):
        with pytest.raises(svc.PeerConnectionError, match='not found'):
            svc.approver_decision('stranger', 'c1', approve=True)


# ---------------------------------------------------------------------------
# Starting a request
# ---------------------------------------------------------------------------

def _on(student_id='b', sources=None, dependent=False):
    return EffectivePolicy(student_id=student_id, enabled=True,
                           request_sources=sources or ['classmates', 'code', 'link'],
                           is_dependent=dependent)


def _fresh_pair_client():
    client = Mock()
    # no existing row between the two
    client.table.return_value.select.return_value.or_.return_value.limit.return_value \
        .execute.return_value = Mock(data=[])
    client.table.return_value.insert.return_value.execute.return_value = Mock(
        data=[{'id': 'c1', 'status': 'pending_addressee'}])
    return client


def test_a_request_by_id_must_come_from_a_vetted_pool():
    with patch.object(svc, '_require_eligible'):
        with pytest.raises(svc.PeerConnectionError, match='not a way to add'):
            svc.request(REQ, peer_id=PEER, source='directory')
        with pytest.raises(svc.PeerConnectionError, match='not a way to add'):
            svc.request(REQ, peer_id=PEER, source=None)


def test_classmates_means_a_shared_active_class():
    from utils import class_membership as cm

    with patch.object(svc, '_require_eligible'), \
         patch.object(cm, 'student_class_ids', side_effect=lambda uid: {REQ: {'c1'}, PEER: {'c9'}}[uid]):
        with pytest.raises(svc.PeerConnectionError, match='only add classmates'):
            svc.request(REQ, peer_id=PEER, source='classmates')


def test_a_classmate_request_records_its_source():
    from utils import class_membership as cm

    client = _fresh_pair_client()
    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_require_eligible'), \
         patch.object(cm, 'student_class_ids', return_value={'shared'}), \
         patch.object(svc.pa, 'is_blocked_between', return_value=False), \
         patch.object(svc.policy_svc, 'effective_policy', return_value=_on(PEER)), \
         patch.object(svc, '_display_name', side_effect=_named), \
         patch.object(svc, '_notify') as notify:
        svc.request(REQ, peer_id=PEER, source='classmates')

    row = client.table.return_value.insert.call_args.args[0]
    assert row['source'] == 'classmates'
    assert row['created_by_user_id'] is None
    assert notify.call_args.args[0] == PEER
    assert notify.call_args.kwargs['link'] == '/connections'


def test_a_source_the_family_did_not_allow_is_refused():
    from utils import class_membership as cm

    with patch.object(svc, '_require_eligible'), \
         patch.object(cm, 'student_class_ids', return_value={'shared'}), \
         patch.object(svc.pa, 'is_blocked_between', return_value=False), \
         patch.object(svc.policy_svc, 'effective_policy', return_value=_on(PEER, sources=['code'])), \
         patch.object(svc, '_display_name', side_effect=_named):
        with pytest.raises(svc.PeerConnectionError, match='another way'):
            svc.request(REQ, peer_id=PEER, source='classmates')


def test_a_request_on_a_childs_behalf_records_the_parent_and_is_always_admitted():
    """The row says a parent made it, and the other family's source list
    cannot shut a parent out: a guardian asking is the safe path."""
    client = _fresh_pair_client()
    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_require_eligible'), \
         patch.object(svc, '_resolve_code', return_value=PEER), \
         patch.object(svc.pa, 'is_blocked_between', return_value=False), \
         patch.object(svc.policy_svc, 'effective_policy',
                      return_value=_on(PEER, sources=['classmates'])), \
         patch.object(svc, '_display_name', side_effect=_named), \
         patch.object(svc, '_notify') as notify:
        svc.request(REQ, code='CODE1234', acting_user_id='mum')

    row = client.table.return_value.insert.call_args.args[0]
    assert row['source'] == 'parent'
    assert row['created_by_user_id'] == 'mum'
    assert "Ada's parent" in notify.call_args.args[3], 'the message names who really asked'


def test_a_request_to_a_dependent_goes_to_their_parents():
    """No login of their own; the Family tab is where it gets answered."""
    client = _fresh_pair_client()
    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_require_eligible'), \
         patch.object(svc, '_resolve_code', return_value=PEER), \
         patch.object(svc.pa, 'is_blocked_between', return_value=False), \
         patch.object(svc.policy_svc, 'effective_policy', return_value=_on(PEER, dependent=True)), \
         patch.object(svc, '_guardians_of', return_value=['mum', 'dad']), \
         patch.object(svc, '_display_name', side_effect=_named), \
         patch.object(svc, '_notify') as notify:
        svc.request(REQ, code='CODE1234')

    told = {c.args[0] for c in notify.call_args_list}
    assert told == {'mum', 'dad'}
    assert all(c.kwargs['link'] == '/family' for c in notify.call_args_list)


def test_a_link_delivered_code_records_link():
    client = _fresh_pair_client()
    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_require_eligible'), \
         patch.object(svc, '_resolve_code', return_value=PEER), \
         patch.object(svc.pa, 'is_blocked_between', return_value=False), \
         patch.object(svc.policy_svc, 'effective_policy', return_value=_on(PEER)), \
         patch.object(svc, '_display_name', side_effect=_named), \
         patch.object(svc, '_notify'):
        svc.request(REQ, code='CODE1234', source='link')
    assert client.table.return_value.insert.call_args.args[0]['source'] == 'link'


def test_a_student_with_friends_off_cannot_start_a_request():
    off = EffectivePolicy(student_id='a', enabled=False, reason='Ask Mo to turn on Friends for you.')
    with patch.object(svc.policy_svc, 'effective_policy', return_value=off):
        with pytest.raises(svc.PeerConnectionError, match='Ask Mo'):
            svc.request('a', code='CODE1234')


# ---------------------------------------------------------------------------
# Activation and the after-the-fact notice
# ---------------------------------------------------------------------------

def test_maybe_activate_is_the_only_writer_of_active():
    """The docstring's promise, checked against the source: one place writes
    'status': 'active', and it is _maybe_activate."""
    source = inspect.getsource(svc)
    writers = [m.start() for m in re.finditer(r"'status':\s*'active'", source)]
    assert len(writers) == 1, f'expected one writer of active, found {len(writers)}'
    fn_start = source.index('def _maybe_activate(')
    fn_end = source.index('\ndef ', fn_start + 1)
    assert fn_start < writers[0] < fn_end


def test_parents_who_did_not_answer_are_told_and_those_who_did_are_not():
    conn = {**CONN, 'status': 'active'}
    approvals = [
        {'status': 'approved', 'student_id': 'a', 'method': 'policy', 'decided_by_user_id': None},
        {'status': 'approved', 'student_id': 'b', 'method': 'explicit', 'decided_by_user_id': 'b_mum'},
    ]
    guardians = {'a': ['a_mum', 'a_dad'], 'b': ['b_mum', 'b_dad']}
    with patch.object(svc, '_guardians_of', side_effect=lambda sid: guardians[sid]), \
         patch.object(svc, '_display_name', side_effect=lambda uid: uid), \
         patch.object(svc, '_email_friend_added') as mail, \
         patch.object(svc, '_notify') as notify:
        svc._tell_parents_after_the_fact(conn, approvals)

    told = {c.args[0] for c in notify.call_args_list}
    assert told == {'a_mum', 'a_dad', 'b_dad'}, 'b_mum answered explicitly and already knows'
    assert all(c.args[1] == 'peer_friend_added' for c in notify.call_args_list)
    assert all(c.kwargs['link'] == '/family' for c in notify.call_args_list)
    emailed = [c.args[0] for c in mail.call_args_list]
    assert emailed == [['a_mum', 'a_dad'], ['b_dad']]


def test_the_after_the_fact_email_skips_org_parents():
    """Org parents get the digest; a second email would be the same fact
    twice. Platform parents have no digest, so this is theirs."""
    repo = Mock()
    repo.users_by_ids.return_value = {
        'plat': {'id': 'plat', 'email': 'p@x', 'first_name': 'P', 'organization_id': None},
        'org': {'id': 'org', 'email': 'o@x', 'first_name': 'O', 'organization_id': 'org1'},
        'noemail': {'id': 'noemail', 'email': None, 'organization_id': None},
    }
    with patch('repositories.peer_policy_repository.PeerPolicyRepository', return_value=repo), \
         patch('services.email_service.email_service') as mail:
        svc._email_friend_added(['plat', 'org', 'noemail'], 'Ada', 'Linus')

    assert mail.send_peer_friend_added_email.call_count == 1
    assert mail.send_peer_friend_added_email.call_args.kwargs['parent_email'] == 'p@x'


def test_a_failed_after_the_fact_notice_does_not_break_activation():
    conn = {**CONN, 'status': 'active'}
    with patch.object(svc, '_guardians_of', side_effect=RuntimeError('db down')):
        svc._tell_parents_after_the_fact(conn, [])   # no exception


# ---------------------------------------------------------------------------
# Revocation
# ---------------------------------------------------------------------------

def test_a_parent_of_either_student_may_revoke():
    """Consent that can only be granted is not consent -- and with consent
    on file under a policy, the parent who gave it may never have been the
    recorded approver of this particular row."""
    conn = {'id': 'c1', 'status': 'active', 'requester_id': 'a', 'addressee_id': 'b'}
    client = Mock()
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = Mock(data=[])
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = Mock(
        data=[{**conn, 'status': 'revoked'}])

    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_get_connection', return_value=conn), \
         patch.object(svc.pa, 'is_parent_of', side_effect=lambda p, s: p == 'b_mum' and s == 'b'):
        assert svc.revoke('b_mum', 'c1', reason='parent')['status'] == 'revoked'
        with pytest.raises(svc.PeerConnectionError, match='not found'):
            svc.revoke('stranger', 'c1')


# ---------------------------------------------------------------------------
# The feed keeps peers to the peer shape
# ---------------------------------------------------------------------------

def test_the_peer_feed_asks_for_the_peer_author_shape():
    with patch.object(svc, 'active_peer_ids', return_value=['b']), \
         patch.object(svc, '_admin'), \
         patch('services.activity_feed_service.build_activity_feed') as build:
        build.return_value = {'items': [], 'has_more': False, 'next_cursor': None}
        svc.feed('a')
    assert build.call_args.kwargs['author_shape'] == 'peer'


def test_the_peer_author_shape_carries_no_surname():
    from services.activity_feed_service import build_activity_feed

    completions = [
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
                data=[{'id': 'peer', 'display_name': 'Peer', 'first_name': 'Pea',
                       'last_name': 'Surname'}])
        else:
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

    peer_view = build_activity_feed(supabase, ['peer'], author_shape='peer')
    author = peer_view['items'][0]['author'] if 'author' in peer_view['items'][0] else peer_view['items'][0]['student']
    assert 'last_name' not in author
    assert author['display_name'] == 'Peer'

    full_view = build_activity_feed(supabase, ['peer'])
    author = full_view['items'][0]['author'] if 'author' in full_view['items'][0] else full_view['items'][0]['student']
    assert author.get('last_name') == 'Surname'


def test_the_peer_feed_stamps_relationship_reactions_and_share():
    """The web feed card reads these off each item: a friend's item is
    'peer', carries its reactions, and is never shareable by the viewer."""
    page = {'items': [
        {'id': 'tc1', 'completion_id': 'tc1', 'student': {'id': 'a'}},
        {'id': 'le_1', 'learning_event_id': 'le1', 'student': {'id': 'b'}},
    ], 'has_more': False, 'next_cursor': None}
    with patch.object(svc, 'active_peer_ids', return_value=['b']), \
         patch.object(svc, '_admin'), \
         patch('services.activity_feed_service.build_activity_feed', return_value=page), \
         patch.object(svc, 'reactions_for_feed',
                      return_value={'le1': {'by_key': {'proud': 1}, 'mine': 'proud'}}):
        out = svc.feed('a')

    mine, theirs = out['items']
    assert mine['viewer_relationship'] == 'self' and mine['can_share'] is True
    assert mine['reactions'] == {'by_key': {}, 'mine': None}
    assert theirs['viewer_relationship'] == 'peer' and theirs['can_share'] is False
    assert theirs['reactions'] == {'by_key': {'proud': 1}, 'mine': 'proud'}
