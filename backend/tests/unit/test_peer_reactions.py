"""Reactions -- encouragement, not a score.

What must stay true:

  * only a connected peer may react, and only with a key from the palette
  * one reaction per author per item; a second key replaces the first
  * the feed carries counts per key and the viewer's own, never a total
  * the palette is encouragement (no 'like', nothing negative)
"""

from unittest.mock import Mock, patch

import pytest

from services import peer_connection_service as svc


def test_the_palette_is_encouragement_only():
    keys = set(svc.REACTION_KEYS)
    assert keys == {'proud', 'inspired', 'curious', 'keep_going', 'thanks'}
    for forbidden in ('like', 'dislike', 'meh', 'boo', 'fire'):
        assert forbidden not in keys


def test_only_a_connected_peer_may_react():
    with patch.object(svc.pa, 'is_peer_of', return_value=False):
        with pytest.raises(svc.PeerConnectionError, match='not connected'):
            svc.set_reaction('a', 'b', 'proud', learning_event_id='le1')


def test_an_unknown_key_is_refused():
    with patch.object(svc.pa, 'is_peer_of', return_value=True):
        with pytest.raises(svc.PeerConnectionError, match='not one of the reactions'):
            svc.set_reaction('a', 'b', 'like', learning_event_id='le1')


def test_a_reaction_names_exactly_one_item():
    with patch.object(svc.pa, 'is_peer_of', return_value=True):
        with pytest.raises(svc.PeerConnectionError, match='exactly one item'):
            svc.set_reaction('a', 'b', 'proud')
        with pytest.raises(svc.PeerConnectionError, match='exactly one item'):
            svc.set_reaction('a', 'b', 'proud', learning_event_id='le1', quest_id='q1')


def test_setting_a_reaction_upserts_and_tells_the_owner():
    repo = Mock()
    repo.set.return_value = {'reaction': 'keep_going'}
    with patch.object(svc.pa, 'is_peer_of', return_value=True), \
         patch('repositories.peer_reaction_repository.PeerReactionRepository', return_value=repo), \
         patch.object(svc, '_display_name', return_value='Ada'), \
         patch.object(svc, '_notify') as notify:
        out = svc.set_reaction('a', 'b', 'keep_going', task_completion_id='tc1')

    assert out == {'reaction': 'keep_going'}
    args = repo.set.call_args.args
    assert args[:3] == ('a', 'b', 'keep_going')
    assert args[3] == {'learning_event_id': None, 'task_completion_id': 'tc1', 'quest_id': None}
    assert notify.call_args.args[0] == 'b'
    assert notify.call_args.args[1] == 'peer_reaction'
    assert 'Keep going' in notify.call_args.args[3]


def test_clearing_needs_no_peer_gate():
    """A friend who was just blocked must still be able to take back what
    they left; the row is theirs."""
    repo = Mock()
    with patch('repositories.peer_reaction_repository.PeerReactionRepository', return_value=repo), \
         patch.object(svc.pa, 'is_peer_of', return_value=False):
        svc.clear_reaction('a', learning_event_id='le1')
    repo.clear.assert_called_once_with(
        'a', {'learning_event_id': 'le1', 'task_completion_id': None, 'quest_id': None})


def test_the_repository_counts_per_key_and_marks_the_viewers_own():
    from repositories.peer_reaction_repository import PeerReactionRepository

    client = Mock()

    def table(name):
        t = Mock()
        rows_by_col = {
            'task_completion_id': [
                {'task_completion_id': 'tc1', 'reaction': 'proud', 'author_id': 'x'},
                {'task_completion_id': 'tc1', 'reaction': 'proud', 'author_id': 'me'},
                {'task_completion_id': 'tc1', 'reaction': 'thanks', 'author_id': 'y'},
            ],
            'learning_event_id': [
                {'learning_event_id': 'le1', 'reaction': 'curious', 'author_id': 'z'},
            ],
        }
        def select(cols):
            col = cols.split(',')[0].strip()
            m = Mock()
            m.in_.return_value.execute.return_value = Mock(data=rows_by_col[col])
            return m
        t.select.side_effect = select
        return t

    client.table.side_effect = table
    out = PeerReactionRepository(client=client).for_targets(['tc1'], ['le1'], viewer_id='me')

    assert out['tc1'] == {'by_key': {'proud': 2, 'thanks': 1}, 'mine': 'proud'}
    assert out['le1'] == {'by_key': {'curious': 1}, 'mine': None}
    assert 'total' not in out['tc1']


def test_a_failed_reactions_read_leaves_the_feed_standing():
    with patch('repositories.peer_reaction_repository.PeerReactionRepository',
               side_effect=RuntimeError('db down')):
        assert svc.reactions_for_feed(['tc1'], [], 'me') == {}
