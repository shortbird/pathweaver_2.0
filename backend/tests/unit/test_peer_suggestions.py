"""Discovery without a directory -- the suggestion list and the pools.

What must stay true:

  * the list never names a student whose family has not turned Friends on,
    or whose family did not open this pool -- that would be a directory of
    the children whose parents opted out
  * blocked either way means absent, not "already friends"
  * the school pool is empty until the school turns it on
  * a request by id is verified against the pool it claims
  * a parent naming a child at the same school passes; at another school
    does not
"""

from unittest.mock import Mock, patch

import pytest

from services import peer_connection_service as svc
from services.peer_policy_service import EffectivePolicy

ME = '11111111-1111-4111-8111-111111111111'
A = '22222222-2222-4222-8222-222222222222'
B = '33333333-3333-4333-8333-333333333333'
C = '44444444-4444-4444-8444-444444444444'
D = '55555555-5555-4555-8555-555555555555'


def _policy(student_id, enabled=True, sources=None, org='org1'):
    return EffectivePolicy(student_id=student_id, enabled=enabled,
                           request_sources=sources if sources is not None else ['classmates', 'code', 'link'],
                           organization_id=org)


def _run(*, my_classes, class_members, policies, states=None, blocked=None,
         school_pool=False, org_students=None):
    """suggestions(ME) with every collaborator stubbed."""
    from utils import class_membership as cm

    conn_repo = Mock()
    conn_repo.blocked_either_way.return_value = set(blocked or ())
    conn_repo.states_with.return_value = states or {}
    conn_repo.class_names.return_value = {cid: f'Class {cid}' for cid in my_classes}
    policy_repo = Mock()
    policy_repo.users_by_ids.side_effect = lambda ids, cols: {
        i: {'id': i, 'display_name': f'Kid {i[:1]}', 'avatar_url': None} for i in ids}
    policy_repo.org_student_ids.return_value = set(org_students or ())

    def effective(sid):
        if sid == ME:
            return _policy(ME)
        return policies.get(sid) or _policy(sid, enabled=False)

    with patch.object(cm, 'student_class_ids', return_value=set(my_classes)), \
         patch.object(cm, 'class_student_ids', side_effect=lambda cid: set(class_members.get(cid, ()))), \
         patch.object(svc.policy_svc, 'effective_policy', side_effect=effective), \
         patch.object(svc.policy_svc, 'org_friends_settings',
                      return_value={'default_enabled': False, 'default_approval_mode': 'auto',
                                    'school_pool': school_pool}), \
         patch('repositories.peer_connection_repository.PeerConnectionRepository', return_value=conn_repo), \
         patch('repositories.peer_policy_repository.PeerPolicyRepository', return_value=policy_repo), \
         patch('utils.storage_urls.sign_in_place'):
        return svc.suggestions(ME)


def _ids(entries):
    return [e['peer']['id'] for e in entries]


def test_classmates_are_those_sharing_an_active_class():
    out = _run(my_classes={'c1'}, class_members={'c1': {ME, A, B}},
               policies={A: _policy(A), B: _policy(B)})
    assert _ids(out['classmates']) == [A, B]
    assert out['classmates'][0]['class_names'] == ['Class c1']
    assert out['classmates'][0]['state'] == 'none'


def test_a_family_that_has_friends_off_is_not_listed():
    """THE central test. The list must not become a directory of the
    children whose parents said nothing."""
    out = _run(my_classes={'c1'}, class_members={'c1': {ME, A, B}},
               policies={A: _policy(A), B: _policy(B, enabled=False)})
    assert _ids(out['classmates']) == [A]


def test_a_family_that_closed_this_pool_is_not_listed():
    out = _run(my_classes={'c1'}, class_members={'c1': {ME, A, B}},
               policies={A: _policy(A), B: _policy(B, sources=['code'])})
    assert _ids(out['classmates']) == [A]


def test_a_block_either_way_removes_the_student():
    out = _run(my_classes={'c1'}, class_members={'c1': {ME, A, B}},
               policies={A: _policy(A), B: _policy(B)}, blocked={B})
    assert _ids(out['classmates']) == [A]


def test_an_existing_request_is_shown_with_its_state():
    states = {A: {'id': 'x1', 'status': 'pending_addressee', 'direction': 'outgoing'},
              B: {'id': 'x2', 'status': 'active', 'direction': 'incoming'}}
    out = _run(my_classes={'c1'}, class_members={'c1': {ME, A, B}},
               policies={A: _policy(A), B: _policy(B)}, states=states)
    by_id = {e['peer']['id']: e for e in out['classmates']}
    assert by_id[A]['state'] == 'outgoing' and by_id[A]['connection_id'] == 'x1'
    assert by_id[B]['state'] == 'active' and by_id[B]['connection_id'] == 'x2'


def test_the_school_pool_is_empty_until_the_school_turns_it_on():
    out = _run(my_classes=set(), class_members={}, org_students={A, B},
               policies={A: _policy(A, sources=['school']), B: _policy(B, sources=['school'])})
    assert out['school'] == [] and out['school_pool'] is False

    out = _run(my_classes=set(), class_members={}, org_students={A, B}, school_pool=True,
               policies={A: _policy(A, sources=['school']), B: _policy(B, sources=['classmates'])})
    assert _ids(out['school']) == [A], 'B did not open the school pool'
    assert out['school_pool'] is True


def test_a_classmate_is_not_repeated_in_the_school_pool():
    out = _run(my_classes={'c1'}, class_members={'c1': {ME, A}}, org_students={A, B},
               school_pool=True,
               policies={A: _policy(A, sources=['classmates', 'school']),
                         B: _policy(B, sources=['school'])})
    assert _ids(out['classmates']) == [A]
    assert _ids(out['school']) == [B]


def test_the_peer_shape_carries_no_surname():
    out = _run(my_classes={'c1'}, class_members={'c1': {ME, A}}, policies={A: _policy(A)})
    assert set(out['classmates'][0]['peer']) == {'id', 'display_name', 'avatar_url'}


def test_a_student_with_friends_off_gets_no_list():
    off = EffectivePolicy(student_id=ME, enabled=False, reason='Ask Mo to turn on Friends for you.')
    with patch.object(svc.policy_svc, 'effective_policy', return_value=off):
        with pytest.raises(svc.PeerConnectionError, match='Ask Mo'):
            svc.suggestions(ME)


# ---------------------------------------------------------------------------
# The pool a request by id claims
# ---------------------------------------------------------------------------

def _fresh_pair_client():
    client = Mock()
    client.table.return_value.select.return_value.or_.return_value.limit.return_value \
        .execute.return_value = Mock(data=[])
    client.table.return_value.insert.return_value.execute.return_value = Mock(
        data=[{'id': 'c1', 'status': 'pending_addressee'}])
    return client


def test_a_parent_may_name_a_child_at_the_same_school():
    client = _fresh_pair_client()
    with patch.object(svc, '_admin', return_value=client), \
         patch.object(svc, '_require_eligible'), \
         patch.object(svc, '_same_org', return_value=True), \
         patch.object(svc.pa, 'is_blocked_between', return_value=False), \
         patch.object(svc.policy_svc, 'effective_policy', return_value=_policy(A)), \
         patch.object(svc, '_display_name', side_effect=lambda uid: uid), \
         patch.object(svc, '_notify'):
        svc.request(ME, peer_id=A, source='parent', acting_user_id='mum')
    row = client.table.return_value.insert.call_args.args[0]
    assert row['source'] == 'parent' and row['created_by_user_id'] == 'mum'


def test_a_parent_may_not_name_a_child_at_another_school():
    with patch.object(svc, '_require_eligible'), \
         patch.object(svc, '_same_org', return_value=False):
        with pytest.raises(svc.PeerConnectionError, match='not found'):
            svc.request(ME, peer_id=A, source='parent', acting_user_id='mum')


def test_a_student_may_not_claim_the_parent_pool():
    """'parent' is what a delegated request records, not a pool a student
    can name for themselves."""
    with patch.object(svc, '_require_eligible'):
        with pytest.raises(svc.PeerConnectionError, match='not a way to add'):
            svc.request(ME, peer_id=A, source='parent')
