"""Friend chat: two students may DM each other when they are friends AND both
families allow it.

What must stay true:

  * one family's 'message' is never a grant over the other family's child
  * a block, the friendship ending, or either parent flipping 'message' off
    closes the thread on the next send (the rule is read every time)
  * the Messages contact list shows exactly the friends the send path allows
  * the friends list tells the client which rows may get a Message button
"""

from unittest.mock import Mock, patch

import pytest

from services import peer_connection_service as svc
from services.peer_policy_service import EffectivePolicy


def _policy(uid, can):
    return EffectivePolicy(student_id=uid, enabled=True, friends_can=list(can))


def _policies(**by_uid):
    return lambda uid: by_uid[uid]


def test_both_families_must_allow_it():
    both = _policies(a=_policy('a', ['see', 'message']), b=_policy('b', ['see', 'message']))
    one = _policies(a=_policy('a', ['see', 'message']), b=_policy('b', ['see', 'comment']))
    with patch.object(svc.pa, 'is_peer_of', return_value=True):
        with patch.object(svc.policy_svc, 'effective_policy', side_effect=both):
            assert svc.friends_can_message('a', 'b') is True
        with patch.object(svc.policy_svc, 'effective_policy', side_effect=one):
            assert svc.friends_can_message('a', 'b') is False


def test_not_friends_means_no_chat_whatever_the_policies_say():
    both = _policies(a=_policy('a', ['see', 'message']), b=_policy('b', ['see', 'message']))
    with patch.object(svc.pa, 'is_peer_of', return_value=False), \
         patch.object(svc.policy_svc, 'effective_policy', side_effect=both) as pol:
        assert svc.friends_can_message('a', 'b') is False
    pol.assert_not_called()


def test_can_message_user_opens_for_friends_and_only_for_two_students():
    from services.direct_message_service import DirectMessageService

    dms = DirectMessageService()
    client = Mock()

    def users_row(uid):
        role = {'kid': 'student', 'pal': 'student', 'teach': 'advisor'}[uid]
        return {'role': role, 'org_role': None, 'organization_id': None}

    def table(name):
        t = Mock()
        if name == 'users':
            t.select.return_value.eq.side_effect = lambda col, uid: Mock(
                single=Mock(return_value=Mock(execute=Mock(return_value=Mock(data=users_row(uid))))))
        else:
            empty = Mock(data=[])
            for chain in (t.select.return_value.or_.return_value.limit.return_value,
                          t.select.return_value.eq.return_value.eq.return_value.eq.return_value,
                          t.select.return_value.eq.return_value.eq.return_value):
                chain.execute.return_value = empty
        return t

    client.table.side_effect = table
    dms._get_client = Mock(return_value=client)

    with patch('services.school_inbox_service.can_message_school', return_value=False), \
         patch('utils.class_membership.shares_class', return_value=False), \
         patch('utils.class_membership.teaches_child_of', return_value=False), \
         patch.object(dms, '_org_adult_connection', return_value=False), \
         patch.object(svc, 'friends_can_message', return_value=True) as rule:
        assert dms.can_message_user('kid', 'pal') is True
        rule.assert_called_once_with('kid', 'pal')

        rule.reset_mock()
        # A student and a teacher never reach the friends rule.
        assert dms.can_message_user('kid', 'teach') is False
        rule.assert_not_called()

    with patch('services.school_inbox_service.can_message_school', return_value=False), \
         patch('utils.class_membership.shares_class', return_value=False), \
         patch('utils.class_membership.teaches_child_of', return_value=False), \
         patch.object(dms, '_org_adult_connection', return_value=False), \
         patch.object(svc, 'friends_can_message', return_value=False):
        assert dms.can_message_user('kid', 'pal') is False


def test_messageable_friends_are_the_two_sided_subset():
    policies = _policies(
        me=_policy('me', ['see', 'message']),
        yes=_policy('yes', ['see', 'message']),
        no=_policy('no', ['see', 'comment']),
    )
    with patch.object(svc, 'active_peer_ids', return_value=['yes', 'no']), \
         patch.object(svc.policy_svc, 'effective_policy', side_effect=policies):
        assert svc.messageable_friend_ids('me') == ['yes']


def test_a_student_whose_own_family_said_no_has_no_messageable_friends():
    policies = _policies(me=_policy('me', ['see', 'comment']))
    with patch.object(svc, 'active_peer_ids') as peers, \
         patch.object(svc.policy_svc, 'effective_policy', side_effect=policies):
        assert svc.messageable_friend_ids('me') == []
    peers.assert_not_called()


ME = '00000000-0000-4000-8000-00000000000a'
YES = '00000000-0000-4000-8000-00000000000b'
NO = '00000000-0000-4000-8000-00000000000c'


def test_the_friends_list_says_who_may_be_messaged():
    rows = [
        {'id': 'c1', 'status': 'active', 'requester_id': ME, 'addressee_id': YES,
         'created_at': 't', 'activated_at': 't'},
        {'id': 'c2', 'status': 'active', 'requester_id': NO, 'addressee_id': ME,
         'created_at': 't', 'activated_at': 't'},
        {'id': 'c3', 'status': 'pending_addressee', 'requester_id': ME, 'addressee_id': 'x',
         'created_at': 't'},
    ]
    admin = Mock()
    admin.table.return_value.select.return_value.or_.return_value.execute.return_value.data = rows
    policies = {
        ME: _policy(ME, ['see', 'message']),
        YES: _policy(YES, ['see', 'message']),
        NO: _policy(NO, ['see']),
    }
    with patch.object(svc, '_admin', return_value=admin), \
         patch.object(svc, '_peer_profile', side_effect=lambda uid: {'id': uid}), \
         patch.object(svc.pa, 'is_blocked_between', return_value=False), \
         patch.object(svc.policy_svc, 'effective_policy', side_effect=policies.__getitem__):
        out = svc.list_connections(ME)
    by_id = {c['id']: c for c in out['active']}
    assert by_id['c1']['can_message'] is True
    assert by_id['c2']['can_message'] is False
    assert 'can_message' not in out['outgoing'][0]


def test_the_contact_list_adds_friends_with_the_peer_shape():
    from routes.direct_messages import _add_friend_contacts
    contacts = [{'id': 'teach', 'relationship': 'advisor'}]
    with patch.object(svc, 'messageable_friend_ids', return_value=['pal', 'teach']), \
         patch.object(svc, '_peer_profile', return_value={'id': 'pal', 'display_name': 'Pal', 'avatar_url': None}):
        _add_friend_contacts(Mock(), contacts, 'me')
    assert [c['id'] for c in contacts] == ['teach', 'pal']
    friend = contacts[1]
    assert friend['relationship'] == 'friend'
    assert friend['last_name'] == ''
    assert 'email' not in friend


# ---------------------------------------------------------------------------
# "Ask my parent" -- how a kid reaches the switch
# ---------------------------------------------------------------------------

def test_a_kid_with_friends_off_asks_every_guardian():
    email = Mock()
    people = Mock()
    people.users_by_ids.return_value = {
        'mum': {'id': 'mum', 'email': 'mum@example.com', 'first_name': 'Ann'},
        'dad': {'id': 'dad', 'email': None, 'first_name': 'Bo'},
    }
    with patch.object(svc, 'eligibility', return_value={'state': 'friends_off', 'who_can_enable': 'parent'}), \
         patch.object(svc, '_guardians_of', return_value=['dad', 'mum']), \
         patch.object(svc, '_display_name', return_value='Jane'), \
         patch.object(svc, '_notify') as notify, \
         patch('repositories.peer_policy_repository.PeerPolicyRepository', return_value=people), \
         patch('services.email_service.email_service', email):
        out = svc.ask_parent('kid')
    assert out == {'asked': 2}
    assert {c.args[0] for c in notify.call_args_list} == {'mum', 'dad'}
    assert notify.call_args_list[0].args[1] == 'parent_approval_required'
    # Only the guardian with an address gets the email.
    email.send_friends_ask_parent_email.assert_called_once()
    assert email.send_friends_ask_parent_email.call_args.kwargs['parent_email'] == 'mum@example.com'
    assert email.send_friends_ask_parent_email.call_args.kwargs['child_name'] == 'Jane'


@pytest.mark.parametrize('state', [
    {'state': 'eligible', 'who_can_enable': None},
    {'state': 'friends_off', 'who_can_enable': 'org_admin'},
    {'state': 'friends_off', 'who_can_enable': 'nobody'},
    {'state': 'module_off', 'who_can_enable': None},
])
def test_there_is_nobody_to_ask_outside_the_parent_case(state):
    with patch.object(svc, 'eligibility', return_value=state), \
         patch.object(svc, '_notify') as notify:
        with pytest.raises(svc.PeerConnectionError, match='nobody to ask'):
            svc.ask_parent('kid')
    notify.assert_not_called()


def test_the_ask_route_is_rate_limited_per_user():
    from pathlib import Path
    src = (Path(__file__).resolve().parents[2] / 'routes' / 'connections.py').read_text()
    block = src.split("@bp.route('/ask-parent'")[1].split('def ask_parent')[0]
    assert 'rate_limit(calls=3, period=86400, per_user=True)' in block
