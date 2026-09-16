"""A friend's page, friends on a quest, and Collaborate (2026-09-16).

What must stay true:

  * the page is only for an active friend, and shows the friend's PUBLIC
    quests in progress plus any quest the viewer shares with them -- never a
    friend's private quest on its own, and never progress on any of them
  * shared quests come first and are marked
  * Collaborate goes only to a friend, only from someone on the quest, and
    rides the quest_invitation type with the quest one tap away
"""

from unittest.mock import Mock, patch

import pytest

from services import peer_connection_service as svc


ME, PAL, STRANGER = 'me', 'pal', 'stranger'


def _quest(qid, title, public=True):
    return {'id': qid, 'title': title, 'image_url': None, 'is_public': public,
            'quest_type': 'optio', 'started_at': '2026-09-01T00:00:00+00:00'}


def _repo(quests_by_user=None, conn=None, on_quest=None, title='Zoo'):
    repo = Mock()
    repo.quests_in_progress.return_value = quests_by_user or {}
    repo.active_between.return_value = conn
    repo.is_on_quest.side_effect = lambda uid, qid: (uid, qid) in (on_quest or set())
    repo.quest_title.return_value = title
    return repo


def _page(repo, *, peer=True, my_classes=None, pal_classes=None):
    classes = {ME: my_classes or set(), PAL: pal_classes or set()}
    with patch('repositories.peer_connection_repository.PeerConnectionRepository', return_value=repo), \
         patch.object(svc.pa, 'is_peer_of', return_value=peer), \
         patch.object(svc, '_peer_profile', return_value={'id': PAL, 'display_name': 'Pal', 'avatar_url': None}), \
         patch.object(svc, 'friends_can_message', return_value=True), \
         patch.object(svc, '_class_names', side_effect=lambda ids: {i: f'Class {i}' for i in ids}), \
         patch('utils.class_membership.student_class_ids', side_effect=lambda uid: classes[uid]):
        return svc.friend_page(ME, PAL)


def test_the_page_is_only_for_a_friend():
    with pytest.raises(svc.PeerConnectionError, match='not friends'):
        _page(_repo(), peer=False)


def test_a_friends_public_quests_show_and_their_private_ones_do_not():
    repo = _repo({PAL: [_quest('q1', 'Zoo'), _quest('q2', 'Therapy journal', public=False)]},
                 conn={'id': 'c1', 'activated_at': '2026-09-16T00:00:00+00:00'})
    out = _page(repo)
    assert [q['id'] for q in out['quests']] == ['q1']
    assert out['friends_since'] == '2026-09-16T00:00:00+00:00'
    assert out['connection_id'] == 'c1'
    # Nothing about how far along they are.
    assert 'progress' not in out['quests'][0] and 'started_at' not in out['quests'][0]


def test_a_shared_quest_shows_even_when_private_and_comes_first():
    """A class project both are on is theirs to talk about."""
    repo = _repo({
        ME: [_quest('proj', 'Class project', public=False)],
        PAL: [_quest('q1', 'Zoo'), _quest('proj', 'Class project', public=False)],
    })
    out = _page(repo)
    assert [(q['id'], q['shared']) for q in out['quests']] == [('proj', True), ('q1', False)]
    # The viewer's own quests, for the Collaborate picker, say which the friend is on.
    assert out['my_quests'] == [{'id': 'proj', 'title': 'Class project', 'shared': True}]


def test_the_feed_scope_narrows_to_mine_or_to_friends():
    built = Mock(return_value={'items': [], 'has_more': False, 'next_cursor': None})
    with patch.object(svc, 'active_peer_ids', return_value=[PAL]), \
         patch.object(svc, '_admin', return_value=Mock()), \
         patch.object(svc, 'reactions_for_feed', return_value={}), \
         patch('services.activity_feed_service.build_activity_feed', built):
        svc.feed(ME, scope='self')
        assert built.call_args.args[1] == [ME]
        svc.feed(ME, scope='friends')
        assert built.call_args.args[1] == [PAL]
        svc.feed(ME)
        assert built.call_args.args[1] == [ME, PAL]


def test_the_friends_scope_with_no_friends_is_an_empty_page_not_a_query():
    built = Mock()
    with patch.object(svc, 'active_peer_ids', return_value=[]), \
         patch('services.activity_feed_service.build_activity_feed', built):
        out = svc.feed(ME, scope='friends')
    assert out['items'] == [] and out['peer_count'] == 0
    built.assert_not_called()


def test_shared_classes_are_named():
    out = _page(_repo(), my_classes={'a', 'b'}, pal_classes={'b', 'c'})
    assert out['shared_classes'] == ['Class b']


def test_friends_on_a_quest_lists_only_those_on_it():
    repo = _repo({PAL: [_quest('q1', 'Zoo')], 'other': [_quest('q9', 'Else')]})
    with patch('repositories.peer_connection_repository.PeerConnectionRepository', return_value=repo), \
         patch.object(svc, 'active_peer_ids', return_value=[PAL, 'other']), \
         patch.object(svc, '_peer_profile', side_effect=lambda uid: {'id': uid, 'display_name': uid, 'avatar_url': None}), \
         patch.object(svc, 'friends_can_message', return_value=False):
        out = svc.friends_on_quest(ME, 'q1')
    assert [f['id'] for f in out] == [PAL]
    assert out[0]['can_message'] is False


def test_collaborate_goes_to_a_friend_from_someone_on_the_quest():
    repo = _repo(on_quest={(ME, 'q1')}, title='Zoo')
    with patch('repositories.peer_connection_repository.PeerConnectionRepository', return_value=repo), \
         patch.object(svc.pa, 'is_peer_of', return_value=True), \
         patch.object(svc, '_display_name', return_value='Me'), \
         patch.object(svc, '_notify') as notify:
        out = svc.collaborate(ME, PAL, 'q1')
    assert out == {'invited': True, 'already_on_quest': False}
    args, kwargs = notify.call_args
    assert args[0] == PAL and args[1] == 'quest_invitation'
    assert 'collaborate on Zoo' in args[2]
    assert kwargs['link'] == '/quests/q1'
    assert kwargs['metadata'] == {'kind': 'collaborate', 'quest_id': 'q1', 'from_user_id': ME}


def test_collaborate_says_so_when_the_friend_is_already_on_it():
    repo = _repo(on_quest={(ME, 'q1'), (PAL, 'q1')})
    with patch('repositories.peer_connection_repository.PeerConnectionRepository', return_value=repo), \
         patch.object(svc.pa, 'is_peer_of', return_value=True), \
         patch.object(svc, '_display_name', return_value='Me'), \
         patch.object(svc, '_notify') as notify:
        out = svc.collaborate(ME, PAL, 'q1')
    assert out['already_on_quest'] is True
    assert 'side by side' in notify.call_args.args[3]


def test_collaborate_refuses_a_stranger_and_a_bystander():
    repo = _repo(on_quest=set())
    with patch('repositories.peer_connection_repository.PeerConnectionRepository', return_value=repo), \
         patch.object(svc, '_notify') as notify:
        with patch.object(svc.pa, 'is_peer_of', return_value=False):
            with pytest.raises(svc.PeerConnectionError, match='only collaborate with a friend'):
                svc.collaborate(ME, STRANGER, 'q1')
        with patch.object(svc.pa, 'is_peer_of', return_value=True):
            with pytest.raises(svc.PeerConnectionError, match='Start the quest first'):
                svc.collaborate(ME, PAL, 'q1')
    notify.assert_not_called()


def test_the_invite_type_pushes_to_phones():
    from services.notification_service import MOBILE_PUSH_NOTIFICATION_TYPES
    assert 'quest_invitation' in MOBILE_PUSH_NOTIFICATION_TYPES
