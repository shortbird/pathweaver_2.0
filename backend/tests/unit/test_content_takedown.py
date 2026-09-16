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


# ---------------------------------------------------------------------------
# What the moderator sees: the Holds tab and the daily digest
# ---------------------------------------------------------------------------

def test_holds_are_listed_with_the_peer_shape_of_both_students():
    repo = Mock()
    repo.recent_holds.return_value = [
        {'id': 'h1', 'author_id': 'kid', 'recipient_id': 'pal', 'surface': 'message',
         'stage': 'refused', 'text': 'x', 'reasons': ['r'], 'model': 'm', 'created_at': 't'},
    ]
    people = Mock()
    people.users_by_ids.return_value = {
        'kid': {'id': 'kid', 'display_name': 'Jane', 'first_name': 'Jane', 'organization_id': 'org1',
                'email': 'leak@example.com'},
    }
    with patch.object(td, 'PeerTextScreenRepository', return_value=repo), \
         patch('repositories.peer_policy_repository.PeerPolicyRepository', return_value=people):
        out = td.recent_holds(50)
    repo.recent_holds.assert_called_once_with(50)
    assert out[0]['author'] == {'id': 'kid', 'display_name': 'Jane', 'organization_id': 'org1'}
    assert out[0]['recipient']['display_name'] == 'A student'
    assert 'email' not in out[0]['author']


def test_the_digest_sends_nothing_when_nothing_is_waiting():
    reports = Mock()
    reports.count_pending.return_value = 0
    holds = Mock()
    holds.holds_since.return_value = 0
    with patch.object(td, 'ContentReportRepository', return_value=reports), \
         patch.object(td, 'PeerTextScreenRepository', return_value=holds), \
         patch('services.email_service.email_service') as email:
        out = td.daily_digest()
    assert out == {'sent': 0, 'pending_reports': 0, 'holds_24h': 0}
    email.send_templated_email.assert_not_called()


def test_the_digest_emails_every_superadmin_with_an_address():
    reports = Mock()
    reports.count_pending.return_value = 2
    holds = Mock()
    holds.holds_since.return_value = 1
    users = Mock()
    users.find_by_role.return_value = [
        {'id': 'a1', 'email': 'tanner@example.com', 'first_name': 'Tanner'},
        {'id': 'a2', 'email': None},
    ]
    email = Mock()
    email.send_templated_email.return_value = True
    with patch.object(td, 'ContentReportRepository', return_value=reports), \
         patch.object(td, 'PeerTextScreenRepository', return_value=holds), \
         patch('repositories.user_repository.UserRepository', return_value=users), \
         patch('services.email_service.email_service', email):
        out = td.daily_digest()
    assert out == {'sent': 1, 'pending_reports': 2, 'holds_24h': 1}
    users.find_by_role.assert_called_once_with('superadmin')
    kw = email.send_templated_email.call_args.kwargs
    assert kw['to_email'] == 'tanner@example.com'
    assert kw['template_name'] == 'moderation_daily_digest'
    assert kw['context']['pending_reports'] == 2 and kw['context']['holds_24h'] == 1
    assert kw['context']['queue_url'].endswith('/admin/moderation')


def test_the_cron_runs_the_digest_once_a_day():
    from pathlib import Path
    src = (Path(__file__).resolve().parents[2] / 'jobs' / 'cron_dispatch.py').read_text()
    block = src.split('moderation-daily-digest')[0].rsplit('if now.hour', 1)[1]
    assert 'now.minute < 10' in block
    assert '/api/admin/moderation/internal/daily-digest' in src


def test_a_class_chat_hold_names_the_room_not_a_child():
    repo = Mock()
    repo.recent_holds.return_value = [
        {'id': 'h1', 'author_id': 'kid', 'recipient_id': None, 'group_id': 'grp',
         'surface': 'group_message', 'stage': 'refused', 'text': 'x', 'reasons': ['r'],
         'model': 'm', 'created_at': 't'},
    ]
    repo.group_names.return_value = {'grp': 'Period 3 Biology'}
    people = Mock()
    people.users_by_ids.return_value = {'kid': {'id': 'kid', 'display_name': 'Jane'}}
    with patch.object(td, 'PeerTextScreenRepository', return_value=repo), \
         patch('repositories.peer_policy_repository.PeerPolicyRepository', return_value=people), \
         patch('services.messaging_extras_service.sign_attachments') as sign:
        out = td.recent_holds(50)
    assert out[0]['recipient'] is None
    assert out[0]['group'] == {'id': 'grp', 'name': 'Period 3 Biology'}
    # The pictures on a hold are signed for the moderator like any thread's.
    sign.assert_called_once_with(repo.recent_holds.return_value)


def test_actioning_a_class_chat_report_hides_the_message_and_tells_the_room():
    repo = Mock()
    repo.group_message.return_value = {'id': 'g1', 'sender_id': 'kid', 'group_id': 'grp',
                                       'message_content': 'x', 'is_deleted': False}
    with patch.object(td, 'PeerTextScreenRepository', return_value=repo), \
         patch('services.messaging_extras_service._recompute_conversation_preview') as preview, \
         patch('services.messaging_extras_service.broadcast_group') as bcast:
        out = td.take_down({'id': 'r1', 'target_type': 'group_message', 'target_id': 'g1'}, 'admin')
    assert out == {'taken_down': True}
    repo.hide_group_message.assert_called_once_with('g1')
    preview.assert_called_once()
    assert preview.call_args.args[0] == 'group'
    bcast.assert_called_once_with('grp', 'deleted', {'message_id': 'g1'})


def test_a_class_chat_report_carries_a_preview():
    reports = Mock()
    reports.peer_comment_texts.return_value = {}
    reports.message_texts.return_value = {}
    reports.group_message_texts.return_value = {'g1': {'text': 'you stink', 'author_id': 'kid', 'hidden_at': None}}
    with patch.object(td, 'ContentReportRepository', return_value=reports):
        out = td.with_previews([{'id': 'r1', 'target_type': 'group_message', 'target_id': 'g1'}])
    assert out[0]['preview'] == {'text': 'you stink', 'author_id': 'kid', 'hidden': False}
