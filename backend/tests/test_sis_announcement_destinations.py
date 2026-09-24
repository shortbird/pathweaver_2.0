"""Where a notice goes, beside who it is for.

Ticket 214bbc12 (iCreate, Molly, 2026-09-22): "I really think this needs to be
bulk messaging and not just announcements. I want to be able to message just
SOME of the teachers, not all of them. (and to filter people.) I think it would
be better if we could see options of where it could go: Community Announcement
Board; Teacher & Staff Announcement board (I think we have one of these); Optio
Message inbox; Email."

The findings behind the shape: announcement_service.publish already narrowed
by advisor_ids and nothing passed them; there was no inbox channel at all; and
the "Teacher & Staff board" is the staff audience of the one board, not a
second table. So one composer, four destinations, one board row at most, and
the inbox is staff only -- families are messaged from Compose on the Messaging page.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_audiences
from services import sis_community_service as svc

ORG = 'org-1'
AUTHOR = 'office'
STAFF = [{'id': 'ada'}, {'id': 'sam'}, {'id': 'kim'}, {'id': AUTHOR}]


def _client():
    tables = {}

    def _table(name):
        if name in tables:
            return tables[name]
        t = Mock()
        for chained in ('select', 'eq', 'limit', 'insert', 'update', 'order'):
            getattr(t, chained).return_value = t
        if name == 'organizations':
            t.execute.return_value = Mock(data=[{'feature_flags': {'sis_settings': {}}}])
        else:
            t.execute.return_value = Mock(data=[{'id': 'board-1'}])
        tables[name] = t
        return t

    client = Mock()
    client.table.side_effect = _table
    return client


def _send(data, staff=STAFF):
    """Run create_announcement with every writer stubbed; return what each
    writer was asked to do."""
    client = _client()
    with patch.object(svc, '_admin', return_value=client), \
            patch('services.sis_messaging_service.staff_recipients', return_value=staff), \
            patch('services.sis_messaging_service.compose',
                  return_value={'sent': 2, 'skipped': []}) as compose, \
            patch('services.announcement_service.publish',
                  return_value={'sent': 0, 'recipients': 3, 'emailed': True}) as publish:
        result = svc.create_announcement(ORG, AUTHOR, {'title': 'Gate code', **data})
    board = client.table('sis_announcements').insert.call_args_list
    return result, board, publish, compose


@pytest.mark.unit
class TestEachDestinationAlone:
    def test_the_community_board_alone_posts_and_sends_nothing(self):
        result, board, publish, compose = _send(
            {'audience': 'families', 'destinations': ['community_board']})
        assert board[0][0][0]['audience'] == 'families'
        publish.assert_not_called()
        compose.assert_not_called()
        assert result['announcement'] == {'id': 'board-1'}

    def test_the_staff_board_is_the_staff_audience_of_the_same_board(self):
        _, board, publish, compose = _send(
            {'audience': 'teachers', 'destinations': ['staff_board']})
        assert len(board) == 1
        assert board[0][0][0]['audience'] == 'teachers'
        publish.assert_not_called()
        compose.assert_not_called()

    def test_the_inbox_alone_messages_every_staff_member_and_posts_nothing(self):
        result, board, publish, compose = _send(
            {'audience': 'teachers', 'destinations': ['inbox'], 'body': '<p>It is 4321</p>'})
        assert board == []
        publish.assert_not_called()
        kwargs = compose.call_args.kwargs
        # Everyone on the staff but the sender, one private thread each.
        assert kwargs['recipient_ids'] == ['ada', 'kim', 'sam']
        assert kwargs['mode'] == 'separate'
        assert kwargs['subject'] == 'Gate code'
        assert kwargs['body'] == 'It is 4321'
        assert result['messaged'] == {'sent': 2, 'skipped': []}
        assert result['announcement'] is None

    def test_email_alone_sends_the_email_and_no_app_notification(self):
        _, board, publish, compose = _send({'audience': 'school', 'destinations': ['email']})
        assert board == []
        compose.assert_not_called()
        assert set(publish.call_args.args[4]) == {'parents', 'students', 'advisors'}
        assert publish.call_args.kwargs['send_email'] is True
        assert publish.call_args.kwargs['send_app'] is False
        assert publish.call_args.kwargs['advisor_ids'] is None


@pytest.mark.unit
class TestCombined:
    def test_board_inbox_and_email_together(self):
        result, board, publish, compose = _send({
            'audience': 'school', 'destinations': ['community_board', 'inbox', 'email'],
            'notify_app': True})
        assert len(board) == 1
        assert publish.call_args.kwargs['send_app'] is True
        assert publish.call_args.kwargs['send_email'] is True
        # The send is tied to the post, so an edit or delete reaches both.
        assert publish.call_args.kwargs['source_announcement_id'] == 'board-1'
        # The inbox half is staff only even for a whole-school notice.
        assert compose.call_args.kwargs['recipient_ids'] == ['ada', 'kim', 'sam']
        assert result['notified']['emailed'] is True

    def test_both_boards_for_everyone_is_one_row(self):
        """A whole-school post is on the staff board already; two rows for one
        notice is the double-write the 2026-09-17 audit named (D1)."""
        _, board, _, _ = _send({'audience': 'school',
                                'destinations': ['community_board', 'staff_board']})
        assert len(board) == 1
        assert board[0][0][0]['audience'] == 'school'

    def test_the_app_notification_needs_a_board_post(self):
        _, _, publish, _ = _send({'audience': 'teachers', 'destinations': ['email'],
                                  'notify_app': True})
        assert publish.call_args.kwargs['send_app'] is False


@pytest.mark.unit
class TestNarrowingToPeople:
    def test_the_chosen_staff_ids_reach_the_inbox_and_the_email(self):
        _, board, publish, compose = _send({
            'audience': 'teachers', 'destinations': ['inbox', 'email'],
            'staff_ids': ['ada', 'kim']})
        assert board == []
        assert compose.call_args.kwargs['recipient_ids'] == ['ada', 'kim']
        assert publish.call_args.kwargs['advisor_ids'] == {'ada', 'kim'}
        assert publish.call_args.args[4] == ['advisors']

    def test_someone_from_another_org_is_refused_and_nothing_is_written(self):
        result, board, publish, compose = _send({
            'audience': 'teachers', 'destinations': ['staff_board', 'inbox'],
            'staff_ids': ['ada', 'someone-elsewhere']})
        assert result == {'error': 'Everyone you choose has to be staff at this school'}
        assert board == []
        publish.assert_not_called()
        compose.assert_not_called()

    def test_narrowing_is_for_staff_sends_only(self):
        result, board, _, _ = _send({'audience': 'families', 'destinations': ['email'],
                                     'staff_ids': ['ada']})
        assert 'staff-only' in result['error']
        assert board == []

    def test_an_empty_pick_is_refused(self):
        result, _, _, _ = _send({'audience': 'teachers', 'destinations': ['inbox'],
                                 'staff_ids': []})
        assert result['error'].startswith('Choose at least one person')

    def test_a_narrowed_board_only_post_is_refused(self):
        """Every staff member reads the staff board, so picking three people
        and posting there only would promise something it cannot do."""
        result, board, _, _ = _send({'audience': 'teachers', 'destinations': ['staff_board'],
                                     'staff_ids': ['ada']})
        assert 'Every staff member reads the staff board' in result['error']
        assert board == []


@pytest.mark.unit
class TestRefusals:
    @pytest.mark.parametrize('destinations', [[], None])
    def test_no_destination_is_refused(self, destinations):
        result, board, publish, compose = _send({'audience': 'school',
                                                 'destinations': destinations})
        assert result == {'error': 'Choose at least one place to send it'}
        assert board == []
        publish.assert_not_called()
        compose.assert_not_called()

    def test_an_unknown_destination_is_refused(self):
        result, board, _, _ = _send({'audience': 'school', 'destinations': ['sms']})
        assert 'sms' in result['error']
        assert board == []

    def test_the_inbox_never_messages_families(self):
        result, board, _, compose = _send({'audience': 'families',
                                           'destinations': ['inbox']})
        assert 'Compose' in result['error']
        compose.assert_not_called()
        assert board == []

    def test_a_staff_post_does_not_go_on_the_community_board(self):
        result, _, _, _ = _send({'audience': 'teachers', 'destinations': ['community_board']})
        assert 'staff board' in result['error']

    def test_families_do_not_read_the_staff_board(self):
        result, _, _, _ = _send({'audience': 'families', 'destinations': ['staff_board']})
        assert 'Families do not read the staff board' in result['error']

    def test_the_staff_board_alone_does_not_widen_to_everyone(self):
        result, board, _, _ = _send({'audience': 'school', 'destinations': ['staff_board']})
        assert 'community board' in result['error']
        assert board == []

    def test_an_inbox_message_over_the_limit_is_refused_before_the_post(self):
        result, board, _, compose = _send({
            'audience': 'teachers', 'destinations': ['staff_board', 'inbox'],
            'body': 'x' * 2001})
        assert 'limited to 2000' in result['error']
        assert board == []
        compose.assert_not_called()


@pytest.mark.unit
class TestBestEffortAfterTheFirstWrite:
    def test_a_failed_inbox_send_keeps_the_post(self):
        client = _client()
        with patch.object(svc, '_admin', return_value=client), \
                patch('services.sis_messaging_service.staff_recipients', return_value=STAFF), \
                patch('services.sis_messaging_service.compose', side_effect=RuntimeError('down')):
            result = svc.create_announcement(ORG, AUTHOR, {
                'title': 'x', 'audience': 'teachers', 'destinations': ['staff_board', 'inbox']})
        assert result['announcement'] == {'id': 'board-1'}
        assert result['inbox_error'] == 'The inbox messages did not go out.'


@pytest.mark.unit
class TestOlderCallersUnchanged:
    def test_a_payload_without_destinations_keeps_the_board_and_notify_path(self):
        """The mobile app and anything older post without `destinations`."""
        _, board, publish, compose = _send({'audience': 'teachers', 'notify': True})
        assert len(board) == 1
        assert publish.call_args.args[4] == ['advisors']
        assert 'advisor_ids' not in publish.call_args.kwargs
        compose.assert_not_called()


@pytest.mark.unit
class TestDestinationVocabulary:
    def test_every_destination_has_a_label(self):
        assert set(sis_audiences.DESTINATION_LABELS) == set(sis_audiences.DESTINATIONS)

    def test_a_valid_combination_has_no_error(self):
        assert sis_audiences.destination_error(
            ['staff_board', 'inbox', 'email'], 'teachers', narrowed=True) is None
        assert sis_audiences.destination_error(['community_board'], 'families') is None


@pytest.mark.unit
class TestRoute:
    def test_posting_stays_office_only(self):
        """Posting is still ADMIN_ROLES: bulk messaging staff from here is an
        office act, not a teacher one."""
        import inspect
        from routes.sis import community
        lines = inspect.getsource(community).split('\n')
        at = lines.index('def create_announcement(user_id):')
        assert lines[at - 1] == '@require_role(*ADMIN_ROLES)'
