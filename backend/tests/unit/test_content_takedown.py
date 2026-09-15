"""'Action taken' has a consequence for a peer comment or a message.

What must stay true:

  * a peer comment is hidden (never deleted) with hidden_reason='report'
  * a message is soft-deleted the way its sender's own delete works, and the
    open thread is told
  * every other target is unchanged: the status is still the whole record
  * both are idempotent
  * the queue previews the text a moderator has to read
"""

from unittest.mock import Mock, patch

from services import content_takedown_service as td


def test_an_actioned_peer_comment_is_hidden_for_the_report():
    repo = Mock()
    repo.comment.return_value = {'id': 'c1', 'hidden_at': None}
    with patch.object(td, 'PeerTextScreenRepository', return_value=repo):
        out = td.take_down({'id': 'r1', 'target_type': 'peer_comment', 'target_id': 'c1'}, 'admin')
    assert out == {'taken_down': True}
    repo.hide_comment.assert_called_once_with('c1', hidden_by='admin', reason='report')


def test_a_comment_already_hidden_keeps_its_first_reason():
    repo = Mock()
    repo.comment.return_value = {'id': 'c1', 'hidden_at': '2026-09-17T00:00:00Z'}
    with patch.object(td, 'PeerTextScreenRepository', return_value=repo):
        out = td.take_down({'id': 'r1', 'target_type': 'peer_comment', 'target_id': 'c1'}, 'admin')
    assert out == {'taken_down': True}
    repo.hide_comment.assert_not_called()


def test_an_actioned_message_is_soft_deleted_and_the_thread_told():
    repo = Mock()
    repo.message.return_value = {'id': 'm1', 'conversation_id': 'cv', 'is_deleted': False}
    with patch.object(td, 'PeerTextScreenRepository', return_value=repo), \
         patch('services.messaging_extras_service._recompute_conversation_preview') as preview, \
         patch('services.messaging_extras_service.broadcast_dm') as bcast:
        out = td.take_down({'id': 'r1', 'target_type': 'message', 'target_id': 'm1'}, 'admin')
    assert out == {'taken_down': True}
    repo.hide_message.assert_called_once_with('m1')
    preview.assert_called_once()
    bcast.assert_called_once_with('cv', 'deleted', {'message_id': 'm1'})


def test_a_message_already_deleted_is_left_alone():
    repo = Mock()
    repo.message.return_value = {'id': 'm1', 'conversation_id': 'cv', 'is_deleted': True}
    with patch.object(td, 'PeerTextScreenRepository', return_value=repo):
        td.take_down({'id': 'r1', 'target_type': 'message', 'target_id': 'm1'}, 'admin')
    repo.hide_message.assert_not_called()


def test_other_targets_are_not_touched():
    repo = Mock()
    with patch.object(td, 'PeerTextScreenRepository', return_value=repo):
        out = td.take_down({'id': 'r1', 'target_type': 'learning_event', 'target_id': 'le1'}, 'admin')
    assert out['taken_down'] is False
    repo.hide_comment.assert_not_called()
    repo.hide_message.assert_not_called()


def test_a_missing_target_is_reported_not_raised():
    repo = Mock()
    repo.comment.return_value = None
    with patch.object(td, 'PeerTextScreenRepository', return_value=repo):
        out = td.take_down({'id': 'r1', 'target_type': 'peer_comment', 'target_id': 'gone'}, 'admin')
    assert out == {'taken_down': False, 'reason': 'not found'}


def test_the_queue_previews_peer_text_and_nothing_else():
    repo = Mock()
    repo.peer_comment_texts.return_value = {'c1': {'text': 'you are dumb', 'author_id': 'kid', 'hidden_at': None}}
    repo.message_texts.return_value = {'m1': {'text': 'hey', 'author_id': 'kid', 'hidden_at': True}}
    reports = [
        {'id': 'r1', 'target_type': 'peer_comment', 'target_id': 'c1'},
        {'id': 'r2', 'target_type': 'message', 'target_id': 'm1'},
        {'id': 'r3', 'target_type': 'learning_event', 'target_id': 'le1'},
        {'id': 'r4', 'target_type': 'peer_comment', 'target_id': 'deleted'},
    ]
    with patch.object(td, 'ContentReportRepository', return_value=repo):
        out = td.with_previews(reports)
    assert out[0]['preview'] == {'text': 'you are dumb', 'author_id': 'kid', 'hidden': False}
    assert out[1]['preview'] == {'text': 'hey', 'author_id': 'kid', 'hidden': True}
    assert 'preview' not in out[2]
    assert out[3]['preview']['gone'] is True
    repo.peer_comment_texts.assert_called_once_with(['c1', 'deleted'])
    repo.message_texts.assert_called_once_with(['m1'])
