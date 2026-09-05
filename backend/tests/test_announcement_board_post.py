"""
One notice, three places it can land.

iCreate, 2026-09-02 (ce12a041): "Messaging would really just mean any time we
want to communicate — whether it be to make a school wide announcement, a class
message but only for half the class 14+, or a message to an individual ... I
think we may be getting confused with messaging and announcements?"

The board and the send were two composers for the same act: the office wrote a
notice on the Community page to have it SIT somewhere, then wrote it again in
the messaging composer to have it ARRIVE. `post_to_board` folds the first into
the second.

The board is a place, not a channel — it stacks with app and email rather than
replacing either. And the board row is written FIRST, so its id anchors the
send, which is what makes a later edit or delete on the board reach both halves
of what a family sees as one notice.
"""

import json
from unittest.mock import Mock, patch

import pytest
from flask import Flask

from routes import announcements as routes


def _view():
    fn = routes.create_announcement
    return getattr(fn, '__wrapped__', fn)


ADMIN = {'id': 'adm-1', 'role': 'org_managed', 'org_role': 'org_admin',
         'org_roles': ['org_admin'], 'organization_id': 'org-1'}

BODY = {'title': 'Early dismissal Friday', 'message': '<p>We finish at noon.</p>',
        'audiences': ['parents'], 'organization_id': 'org-1'}


def _admin_client():
    admin = Mock()
    table = Mock()
    for chained in ('select', 'eq', 'single', 'in_', 'limit', 'order'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=ADMIN)
    admin.table.return_value = table
    return admin


def _send(board_result=None, board_raises=False, **over):
    """POST the composer's body; return (json body, publish mock, board mock)."""
    # None sentinel rather than a dict literal default (ruff B006): the
    # default is only ever read here, but a shared mutable default is one
    # edit away from leaking state between tests.
    if board_result is None:
        board_result = {'announcement': {'id': 'board-1'}}
    body = {**BODY, **over}
    board = Mock(side_effect=RuntimeError('board is down')) if board_raises \
        else Mock(return_value=board_result)
    app = Flask(__name__)
    with app.test_request_context('/api/announcements', method='POST',
                                  data=json.dumps(body),
                                  content_type='application/json'), \
         patch.object(routes, 'get_supabase_admin_client', return_value=_admin_client()), \
         patch('services.sis_service.class_scope', return_value=None), \
         patch.object(routes.announcement_service, 'targeted_student_ids',
                      return_value=None), \
         patch.object(routes.announcement_service, 'targeted_advisor_ids',
                      return_value=None), \
         patch('services.sis_community_service.create_announcement', board), \
         patch.object(routes.announcement_service, 'publish',
                      return_value={'recipients': 3}) as publish:
        resp = _view()(ADMIN['id'])
    payload = resp[0] if isinstance(resp, tuple) else resp
    return json.loads(payload.get_data(as_text=True)), publish, board


@pytest.mark.unit
class TestPostToBoard:
    def test_the_board_row_anchors_the_send(self):
        """Written first, so its id can be the send's source_announcement_id —
        created after, there would be nothing to anchor to."""
        _, publish, board = _send(post_to_board=True)
        assert board.called
        assert publish.call_args.kwargs['source_announcement_id'] == 'board-1'

    def test_the_board_copy_is_not_delivered_a_second_time(self):
        """create_announcement fans out on its own when handed notify_audiences.
        Passing it here would send the same notice twice."""
        _, _publish, board = _send(post_to_board=True)
        assert 'notify_audiences' not in board.call_args.args[2]

    def test_the_board_gets_the_title_and_body_that_were_sent(self):
        _, _publish, board = _send(post_to_board=True)
        posted = board.call_args.args[2]
        assert posted['title'] == 'Early dismissal Friday'
        assert posted['body'] == '<p>We finish at noon.</p>'

    def test_pinning_is_carried_through(self):
        _, _publish, board = _send(post_to_board=True, pin_on_board=True)
        assert board.call_args.args[2]['pinned'] is True

    def test_pinning_without_posting_does_nothing(self):
        _, _publish, board = _send(pin_on_board=True)
        assert not board.called

    def test_a_send_that_did_not_ask_for_the_board_never_touches_it(self):
        data, publish, board = _send()
        assert not board.called
        assert publish.call_args.kwargs['source_announcement_id'] is None
        assert data['posted_to_board'] is False

    def test_a_board_failure_does_not_swallow_the_send(self):
        """The delivery is the point; the board is the extra. A board that
        refuses must not turn a sent announcement into an error the office
        reads as 'nothing went out'."""
        data, publish, _board = _send(post_to_board=True, board_raises=True)
        assert publish.called
        assert data['success'] is True
        assert data['posted_to_board'] is False

    def test_the_reply_says_whether_it_reached_the_board(self):
        data, _publish, _board = _send(post_to_board=True)
        assert data['posted_to_board'] is True
