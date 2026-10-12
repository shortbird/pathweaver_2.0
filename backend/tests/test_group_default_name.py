"""A group chat can be made without a name.

Ticket 9c774b30 (iCreate, campus coordinator, web /messages): "is there a way
we can have a group chat without making a whole GROUP thread? I would like to
just send a message to two other people." The New Group form required a name,
so a quick three-person chat meant inventing a title first.

A blank name is now named on the server from the members' first names, by the
one helper Compose already uses for its unnamed groups
(message_compose_service.default_group_name -> _default_name), so the client
never builds a name of its own.
"""

from unittest.mock import Mock, patch

import pytest

from services.group_message_service import GroupMessageService


class _Table:
    def __init__(self, db, name):
        self.db, self.name, self._payload = db, name, None

    def __getattr__(self, attr):
        return lambda *a, **k: self

    def insert(self, payload):
        self._payload = payload
        self.db.inserts.append((self.name, payload))
        return self

    def execute(self):
        if self._payload is not None:
            rows = self._payload if isinstance(self._payload, list) else [self._payload]
            return Mock(data=rows)
        if self.name == 'users':
            return Mock(data={'organization_id': 'org-1', 'role': 'org_managed'})
        return Mock(data=[])


class _Db:
    def __init__(self):
        self.inserts = []

    def table(self, name):
        return _Table(self, name)


NAMES = {'ada': {'first_name': 'Ada'}, 'sam': {'preferred_name': 'Sammy', 'first_name': 'Sam'},
         'me': {'first_name': 'Molly'}}


def _create(name, members=('ada', 'sam')):
    db = _Db()
    svc = GroupMessageService()
    with patch.object(svc, '_get_client', return_value=db), \
         patch.object(svc, 'can_create_group', return_value=True), \
         patch.object(svc, '_audience_for_members', return_value='staff'), \
         patch('repositories.school_thread_repository.SchoolThreadRepository.user_names',
               side_effect=lambda ids: {i: NAMES[i] for i in ids if i in NAMES}):
        svc.create_group('me', name, member_ids=list(members))
    return next(p for t, p in db.inserts if t == 'group_conversations')


@pytest.mark.unit
class TestUnnamedGroup:
    def test_a_blank_name_is_named_from_the_members(self):
        assert _create('')['name'] == 'Ada, Sammy'

    def test_no_name_at_all_works_too(self):
        assert _create(None)['name'] == 'Ada, Sammy'

    def test_the_creator_is_not_in_their_own_default_name(self):
        assert _create('  ', members=('me', 'ada'))['name'] == 'Ada'

    def test_a_typed_name_still_wins(self):
        assert _create('Tuesday cover')['name'] == 'Tuesday cover'


@pytest.mark.unit
class TestRoute:
    def test_the_route_accepts_a_group_without_a_name(self, client, auth_headers,
                                                       mock_verify_token):
        svc = Mock()
        svc.create_group.return_value = {'id': 'g-1', 'name': 'Ada, Sammy'}
        with patch('routes.group_messages.group_service', svc):
            resp = client.post('/api/groups', headers=auth_headers,
                               json={'member_ids': ['ada', 'sam']})
        assert resp.status_code == 201
        assert svc.create_group.call_args.kwargs['name'] == ''
