"""A parent's read-only view of a child's conversations lists only threads
with a message in them.

Opening a DM creates the message_conversations row before anything is said,
so a child who tapped two contacts and typed nothing had two "conversations"
on the parent's view, both empty (Paige Hanna reading Banks's, 2026-09-15).
The same holds for a group nobody has posted in and a tutor chat with no
turns.
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from routes.parent import communications


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
TYLER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'


def _innermost(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


class _Query:
    def __init__(self, table, answers):
        self._table, self._answers = table, answers
        self.filters = {}

    def __getattr__(self, name):
        def chain(*args, **kwargs):
            if name in ('eq', 'gt') and len(args) == 2:
                self.filters[(name, args[0])] = args[1]
            return self
        return chain

    def execute(self):
        result = MagicMock()
        answer = self._answers.get(self._table, [])
        result.data = answer(self.filters) if callable(answer) else answer
        return result


def _client(answers):
    client = MagicMock()
    client.table.side_effect = lambda name: _Query(name, answers)
    return client


@pytest.fixture
def app():
    return Flask(__name__)


def _dm(id_, last_message_at, preview=''):
    return {'id': id_, 'participant_1_id': KID, 'participant_2_id': TYLER,
            'last_message_at': last_message_at, 'last_message_preview': preview, 'created_at': '2026-03-23'}


def test_empty_dm_threads_and_silent_groups_are_left_out(app):
    def message_conversations(filters):
        if ('eq', 'participant_1_id') in filters:
            return [_dm('dm-real', '2026-09-01T00:00:00Z', 'hey'), _dm('dm-empty', None)]
        return []

    def tutor_conversations(filters):
        # The route asks the database for message_count > 0; the double
        # honours the filter so an unfiltered query would show up here.
        assert filters.get(('gt', 'message_count')) == 0
        return [{'id': 'tutor-1', 'title': 'Fractions', 'conversation_mode': 'tutor',
                 'created_at': '2026-09-02', 'updated_at': '2026-09-02', 'last_message_at': '2026-09-02T00:00:00Z', 'message_count': 4}]

    answers = {
        'message_conversations': message_conversations,
        'group_members': [
            {'group_id': 'g-live', 'group_conversations': {'id': 'g-live', 'name': 'Peak Play', 'last_message_at': '2026-09-03T00:00:00Z', 'last_message_preview': 'see you'}},
            {'group_id': 'g-quiet', 'group_conversations': {'id': 'g-quiet', 'name': 'Chess club', 'last_message_at': None, 'last_message_preview': ''}},
        ],
        'tutor_conversations': tutor_conversations,
    }
    with app.test_request_context(f'/api/parent/student/{KID}/conversations/all'), \
            patch.object(communications, 'get_supabase_admin_client', return_value=_client(answers)), \
            patch.object(communications, '_get_user_display_info', return_value={'display_name': 'Tyler', 'avatar_url': None}), \
            patch.object(communications, 'sign_in_place'):
        body = _innermost(communications.get_all_student_conversations)(PARENT, KID)[0].get_json()

    ids = {c['id'] for c in body['conversations']}
    assert ids == {'dm-real', 'g-live', 'tutor-1'}
    assert body['counts'] == {'dm': 1, 'group': 1, 'tutor': 1}


def test_the_dm_only_list_applies_the_same_rule(app):
    def message_conversations(filters):
        if ('eq', 'participant_1_id') in filters:
            return [_dm('dm-real', '2026-09-01T00:00:00Z', 'hey'), _dm('dm-empty', None)]
        return []

    answers = {'message_conversations': message_conversations}
    with app.test_request_context(f'/api/parent/student/{KID}/dm-conversations'), \
            patch.object(communications, 'get_supabase_admin_client', return_value=_client(answers)), \
            patch.object(communications, '_get_user_display_info', return_value={'display_name': 'Tyler', 'avatar_url': None}), \
            patch.object(communications, 'sign_in_place'):
        body = _innermost(communications.get_student_dm_conversations)(PARENT, KID)[0].get_json()

    assert [c['id'] for c in body['conversations']] == ['dm-real']
    assert body['total'] == 1
