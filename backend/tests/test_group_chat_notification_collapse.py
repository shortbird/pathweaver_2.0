"""A group chat keeps one unread bell row per person, and a member can mute it.

Owner decision, 2026-10-01. A chat wrote one bell row and sent one push per
message per member. iCreate parents are in 13 class chats on average, and
6,456 of 7,641 message notifications in 30 days were these.

What this file pins:

  - the second message in a chat rewrites the member's unread row (a count,
    the newest preview, a new time) and neither pushes nor broadcasts;
  - once the member has read the row, the next message starts a new one and
    pushes again;
  - the office's rows for a school-owned group collapse the same way;
  - a muted chat writes the member nothing and pushes nothing, and unmuting
    brings both back;
  - muting is for members, through POST /api/groups/<id>/mute;
  - the list and the detail say whether the caller muted the chat, and the
    list asks once, not once per group.

The database is a small in-memory PostgREST double rather than a MagicMock
chain: what is being tested is which row gets rewritten and which filter
found it, and a chain that returns the same canned rows whatever it is asked
cannot tell a right filter from a wrong one.
"""

import inspect
import itertools
from unittest.mock import Mock, patch

import pytest
from flask import Flask

import routes.group_messages as routes
from repositories.notification_repository import NotificationRepository, chat_muted_key
from services import school_inbox_service
from services.group_message_service import GroupMessageService
from services.notification_service import NotificationService

GROUP = '22222222-2222-4222-8222-222222222222'
OTHER_GROUP = '33333333-3333-4333-8333-333333333333'
TEACHER = 'teacher-1'
MUM = 'mum-1'
DAD = 'dad-1'
INBOX = 'inbox-1'
OFFICE = 'office-1'
ORG = {'id': 'org-1', 'name': 'iCreate', 'is_active': True, 'inbox_user_id': INBOX}


def _field(row, column):
    """`metadata->>group_id` the way PostgREST reads it: text, or None."""
    if '->>' in column:
        base, key = column.split('->>')
        value = (row.get(base) or {}).get(key)
        return None if value is None else str(value)
    return row.get(column)


class _Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.op, self.payload = 'select', None
        self.filters, self.columns = [], ''
        self._single = False
        self._order = self._range = self._limit = None

    # -- verbs
    def select(self, columns='*', **_):
        self.columns = columns
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def upsert(self, payload, on_conflict=None):
        self.op, self.payload, self.on_conflict = 'upsert', payload, on_conflict
        return self

    def delete(self):
        self.op = 'delete'
        return self

    # -- filters
    def eq(self, column, value):
        self.filters.append(lambda r: _field(r, column) == value)
        return self

    def neq(self, column, value):
        self.filters.append(lambda r: _field(r, column) != value)
        return self

    def in_(self, column, values):
        values = list(values)
        self.filters.append(lambda r: _field(r, column) in values)
        return self

    def like(self, column, pattern):
        assert pattern.endswith('%') and '%' not in pattern[:-1]
        self.filters.append(lambda r: str(_field(r, column) or '').startswith(pattern[:-1]))
        return self

    # -- shaping
    def order(self, column, desc=False):
        self._order = (column, desc)
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def single(self):
        self._single = True
        return self

    def _matching(self):
        return [r for r in self.db.rows[self.table] if all(f(r) for f in self.filters)]

    def execute(self):
        self.db.calls.append((self.table, self.op))
        rows = self.db.rows.setdefault(self.table, [])
        if self.op == 'insert':
            new = [self.db.stamp(dict(p)) for p in
                   (self.payload if isinstance(self.payload, list) else [self.payload])]
            rows.extend(new)
            return Mock(data=[dict(r) for r in new], count=None)
        if self.op == 'upsert':
            keys = [k.strip() for k in self.on_conflict.split(',')]
            held = next((r for r in rows
                         if all(r.get(k) == self.payload.get(k) for k in keys)), None)
            if held is None:
                rows.append(self.db.stamp(dict(self.payload)))
            else:
                held.update(self.payload)
            return Mock(data=[dict(self.payload)], count=None)
        found = self._matching()
        if self.op == 'update':
            for r in found:
                r.update(self.payload)
            return Mock(data=[dict(r) for r in found], count=None)
        if self.op == 'delete':
            self.db.rows[self.table] = [r for r in rows if r not in found]
            return Mock(data=[dict(r) for r in found], count=None)
        if self._order:
            found.sort(key=lambda r: r.get(self._order[0]) or '', reverse=self._order[1])
        if self._range:
            found = found[self._range[0]:self._range[1] + 1]
        if self._limit is not None:
            found = found[:self._limit]
        out = []
        for r in found:
            row = dict(r)
            if 'count:metadata->count' in self.columns:
                row['count'] = (r.get('metadata') or {}).get('count')
            out.append(row)
        if self._single:
            return Mock(data=out[0] if out else None, count=None)
        return Mock(data=out, count=len(out))


class _Db:
    """Tables as lists of dicts, with every request recorded as (table, verb)."""

    def __init__(self, **tables):
        self.rows = {'notifications': [], 'notification_preferences': [], **tables}
        self.calls = []
        self._ids = itertools.count(1)

    def stamp(self, row):
        n = next(self._ids)
        row.setdefault('id', f'row-{n}')
        # Postgres fills created_at; a later insert is a later time.
        row.setdefault('created_at', f'2026-10-01T09:00:{n:02d}+00:00')
        return row

    def table(self, name):
        self.rows.setdefault(name, [])
        return _Query(self, name)

    def bell(self, user_id):
        return [r for r in self.rows['notifications'] if r['user_id'] == user_id]


def _db(members=(MUM, DAD), created_by=TEACHER):
    return _Db(
        group_conversations=[{'id': GROUP, 'name': 'Art', 'organization_id': 'org-1',
                              'created_by': created_by}],
        group_members=[{'group_id': GROUP, 'user_id': uid}
                       for uid in (TEACHER, *members)],
    )


class _Chat:
    """The group service and the real NotificationService over one fake
    database, with the three ways a notification leaves the server recorded."""

    def __init__(self, db, school_org=None, office=()):
        self.db = db
        self.svc = GroupMessageService()
        self.svc._get_client = lambda: db
        self.svc._get_user_info = lambda uid: {'id': uid, 'display_name': 'Ms T'}
        self.notifier = NotificationService()
        self.notifier.supabase = db
        self.notifier._broadcast_realtime = Mock(return_value=True)
        self.notifier._send_push_notification = Mock(return_value=True)
        self.notifier._send_expo_push_notification = Mock(return_value=True)
        self.school_org, self.office = school_org, list(office)

    def say(self, text, sender=TEACHER, **kwargs):
        with patch('services.group_message_service.NotificationService',
                   return_value=self.notifier), \
             patch.object(school_inbox_service, 'org_for_inbox_user',
                          side_effect=lambda uid: self.school_org if uid == INBOX else None), \
             patch.object(school_inbox_service, 'admin_recipient_ids',
                          return_value=self.office):
            self.svc._notify_group_members(sender, GROUP, text, **kwargs)

    def read(self, user_id):
        NotificationRepository(client=self.db).mark_group_messages_read(user_id, GROUP)

    def pushed_to(self):
        return [c.kwargs['user_id'] for c in self.notifier._send_expo_push_notification.call_args_list]

    def web_pushed_to(self):
        return [c.kwargs['user_id'] for c in self.notifier._send_push_notification.call_args_list]

    def broadcast_to(self):
        return [c.args[0] for c in self.notifier._broadcast_realtime.call_args_list]


# ---------------------------------------------------------------------------
# One row per chat, one push until it is read
# ---------------------------------------------------------------------------

class TestCollapse:
    def test_the_first_message_is_a_row_and_a_push_as_before(self):
        chat = _Chat(_db())
        chat.say('Bring a smock on Friday')

        (row,) = chat.db.bell(MUM)
        assert row['title'] == 'New message in Art'
        assert row['message'] == 'Ms T: Bring a smock on Friday'
        assert row['link'] == f'/communication?group={GROUP}'
        assert row['metadata']['count'] == 1
        assert row['metadata']['full_content'] == 'Bring a smock on Friday'
        assert sorted(chat.pushed_to()) == [DAD, MUM]
        assert sorted(chat.web_pushed_to()) == [DAD, MUM]
        assert sorted(chat.broadcast_to()) == [DAD, MUM]

    def test_the_second_message_rewrites_the_row_and_does_not_push(self):
        chat = _Chat(_db())
        chat.say('Bring a smock on Friday')
        first = dict(chat.db.bell(MUM)[0])
        chat.say('And an old shirt')

        (row,) = chat.db.bell(MUM)
        assert row['id'] == first['id']
        assert row['title'] == '2 new messages in Art'
        assert row['message'] == 'Ms T: And an old shirt'
        assert row['metadata']['count'] == 2
        assert row['metadata']['full_content'] == 'And an old shirt'
        assert row['is_read'] is False
        # Moved to the top of the bell, which orders by created_at.
        assert row['created_at'] > first['created_at']
        # One push each from the first message, none from the second -- and no
        # broadcast either: mobile adds one to its badge per broadcast.
        assert sorted(chat.pushed_to()) == [DAD, MUM]
        assert sorted(chat.web_pushed_to()) == [DAD, MUM]
        assert sorted(chat.broadcast_to()) == [DAD, MUM]

    def test_the_count_keeps_climbing(self):
        chat = _Chat(_db())
        for text in ('one', 'two', 'three', 'four'):
            chat.say(text)

        (row,) = chat.db.bell(MUM)
        assert row['title'] == '4 new messages in Art'
        assert row['metadata']['count'] == 4
        assert chat.pushed_to().count(MUM) == 1

    def test_a_read_row_means_a_new_row_and_a_new_push(self):
        chat = _Chat(_db())
        chat.say('one')
        chat.say('two')
        chat.read(MUM)
        chat.say('three')

        old, new = chat.db.bell(MUM)
        assert old['is_read'] is True and old['title'] == '2 new messages in Art'
        assert new['is_read'] is False and new['title'] == 'New message in Art'
        assert new['metadata']['count'] == 1
        # Mum read hers, so she is pushed again; Dad did not, so he is not.
        assert chat.pushed_to().count(MUM) == 2
        assert chat.pushed_to().count(DAD) == 1
        assert chat.db.bell(DAD)[0]['title'] == '3 new messages in Art'

    def test_members_who_are_level_are_rewritten_in_one_request(self):
        chat = _Chat(_db())
        chat.say('one')
        chat.db.calls.clear()
        chat.say('two')

        assert chat.db.calls.count(('notifications', 'update')) == 1
        assert chat.db.calls.count(('notifications', 'select')) == 1
        assert chat.db.calls.count(('notifications', 'insert')) == 0

    def test_a_row_from_before_rows_counted_becomes_two(self):
        db = _db()
        db.table('notifications').insert({
            'user_id': MUM, 'type': 'message_received', 'is_read': False,
            'title': 'New message in Art', 'message': 'Ms T: old',
            'metadata': {'group_id': GROUP, 'sender_id': TEACHER},
        }).execute()
        chat = _Chat(db)
        chat.say('new')

        (row,) = chat.db.bell(MUM)
        assert row['title'] == '2 new messages in Art'
        assert row['metadata']['count'] == 2
        assert MUM not in chat.pushed_to()

    def test_the_newest_of_several_old_rows_is_the_one_rewritten(self):
        """Until this change a chat wrote a row per message, so a member who
        has not opened it holds several. One of them absorbs the new message;
        opening the chat clears them all, as it always did."""
        db = _db()
        for text in ('first', 'second'):
            db.table('notifications').insert({
                'user_id': MUM, 'type': 'message_received', 'is_read': False,
                'title': 'New message in Art', 'message': text,
                'metadata': {'group_id': GROUP},
            }).execute()
        chat = _Chat(db)
        chat.say('third')

        older, newer = chat.db.bell(MUM)
        assert older['message'] == 'first' and older['title'] == 'New message in Art'
        assert newer['message'] == 'Ms T: third' and newer['title'] == '2 new messages in Art'

    def test_another_chats_unread_row_is_left_alone(self):
        db = _db()
        db.table('notifications').insert({
            'user_id': MUM, 'type': 'message_received', 'is_read': False,
            'title': 'New message in Maths', 'message': 'x',
            'metadata': {'group_id': OTHER_GROUP, 'count': 5},
        }).execute()
        chat = _Chat(db)
        chat.say('hello')

        maths, art = chat.db.bell(MUM)
        assert maths['title'] == 'New message in Maths' and maths['metadata']['count'] == 5
        assert art['title'] == 'New message in Art'
        assert MUM in chat.pushed_to()

    def test_a_row_read_between_the_lookup_and_the_write_starts_a_new_one(self):
        """The member opened the chat in the moment between the two requests.
        Their row is read and stays read; the message they have not seen gets
        a row of its own, with its push."""
        chat = _Chat(_db(members=(MUM,)))
        chat.say('one')
        lookup = NotificationRepository.unread_group_message_rows

        def read_after_lookup(repo, group_id, user_ids):
            found = lookup(repo, group_id, user_ids)
            chat.read(MUM)
            return found

        with patch.object(NotificationRepository, 'unread_group_message_rows',
                          read_after_lookup):
            chat.say('two')

        old, new = chat.db.bell(MUM)
        assert old['is_read'] is True and old['title'] == 'New message in Art'
        assert new['is_read'] is False and new['message'] == 'Ms T: two'
        assert chat.pushed_to() == [MUM, MUM]

    def test_the_sender_hears_nothing(self):
        chat = _Chat(_db())
        chat.say('one')
        chat.say('two')
        assert chat.db.bell(TEACHER) == []

    def test_push_off_still_collapses_and_still_does_not_push(self):
        chat = _Chat(_db(members=(MUM,)))
        chat.say('one', push=False)
        chat.say('two', push=False)

        (row,) = chat.db.bell(MUM)
        assert row['title'] == '2 new messages in Art'
        assert chat.pushed_to() == [] and chat.web_pushed_to() == []

    def test_a_failed_lookup_falls_back_to_a_row_per_message(self):
        """Not to silence: a message nobody is told about is the worse failure."""
        chat = _Chat(_db(members=(MUM,)))
        chat.say('one')
        with patch.object(NotificationRepository, 'unread_group_message_rows',
                          side_effect=RuntimeError('postgrest down')), \
             patch.object(NotificationRepository, 'muted_member_ids',
                          side_effect=RuntimeError('postgrest down')):
            chat.say('two')

        assert [r['title'] for r in chat.db.bell(MUM)] == ['New message in Art'] * 2
        assert chat.pushed_to() == [MUM, MUM]

    def test_a_failed_rewrite_never_fails_the_send(self):
        chat = _Chat(_db(members=(MUM,)))
        chat.say('one')
        with patch.object(NotificationRepository, 'bump_group_message_rows',
                          side_effect=RuntimeError('postgrest down')):
            chat.say('two')  # does not raise
        assert len(chat.db.bell(MUM)) == 1


# ---------------------------------------------------------------------------
# The office's rows for a school-owned group
# ---------------------------------------------------------------------------

class TestOfficeRows:
    def _chat(self):
        return _Chat(_db(members=(INBOX, MUM), created_by=INBOX),
                     school_org=ORG, office=[OFFICE])

    def test_the_office_row_collapses_too(self):
        chat = self._chat()
        chat.say('Can someone cover Tuesday?')
        chat.say('Never mind, sorted')

        (row,) = chat.db.bell(OFFICE)
        assert row['title'] == 'iCreate inbox: 2 new messages in Art'
        assert row['message'] == 'Ms T: Never mind, sorted'
        assert row['link'] == f'/inbox?tab=school&group={GROUP}'
        assert row['metadata']['school_inbox'] is True
        assert row['metadata']['count'] == 2
        # One alert until it is read -- in the browser. The phone gets none:
        # the mobile app has no school inbox to open it in (owner, 2026-10-01;
        # this pinned a phone push until then, see
        # test_school_inbox_stays_off_the_phone.py).
        assert chat.web_pushed_to().count(OFFICE) == 1
        assert OFFICE not in chat.pushed_to()
        # The inbox account is a member nobody logs in as.
        assert chat.db.bell(INBOX) == []

    def test_a_mute_does_not_reach_the_office(self):
        """The office is not in the room, so a mute row under its id -- which
        nothing in the product writes -- must not silence the school inbox."""
        chat = self._chat()
        NotificationRepository(client=chat.db).set_chat_muted(OFFICE, GROUP, True)
        chat.say('Can someone cover Tuesday?')

        assert len(chat.db.bell(OFFICE)) == 1
        # The browser push is the office's alert; the phone never gets one.
        assert OFFICE in chat.web_pushed_to()
        assert OFFICE not in chat.pushed_to()


# ---------------------------------------------------------------------------
# Mute
# ---------------------------------------------------------------------------

class TestMute:
    def test_a_muted_chat_writes_no_row_and_sends_no_push(self):
        chat = _Chat(_db())
        assert chat.svc.set_muted(MUM, GROUP, True) is True
        chat.say('one')
        chat.say('two')

        assert chat.db.bell(MUM) == []
        assert MUM not in chat.pushed_to()
        assert MUM not in chat.web_pushed_to()
        assert MUM not in chat.broadcast_to()
        # Nobody else is affected.
        assert chat.db.bell(DAD)[0]['title'] == '2 new messages in Art'
        assert chat.pushed_to() == [DAD]

    def test_the_mute_is_a_preference_row_keyed_by_the_chat(self):
        chat = _Chat(_db())
        chat.svc.set_muted(MUM, GROUP, True)
        chat.svc.set_muted(MUM, GROUP, True)  # twice is still one row

        (pref,) = chat.db.rows['notification_preferences']
        assert pref['user_id'] == MUM
        assert pref['notification_type'] == f'chat_muted:{GROUP}' == chat_muted_key(GROUP)
        assert pref['enabled'] is False

    def test_muting_one_chat_leaves_the_others_alone(self):
        chat = _Chat(_db())
        NotificationRepository(client=chat.db).set_chat_muted(MUM, OTHER_GROUP, True)
        chat.say('one')
        assert len(chat.db.bell(MUM)) == 1

    def test_unmuting_brings_the_row_and_the_push_back(self):
        chat = _Chat(_db())
        chat.svc.set_muted(MUM, GROUP, True)
        chat.say('one')
        assert chat.svc.set_muted(MUM, GROUP, False) is False
        chat.say('two')

        assert chat.db.rows['notification_preferences'] == []
        (row,) = chat.db.bell(MUM)
        assert row['title'] == 'New message in Art'
        assert chat.pushed_to().count(MUM) == 1

    def test_a_preference_row_switched_back_on_is_not_a_mute(self):
        """PUT /api/notifications/preferences can write any key with any
        value; only enabled = false mutes."""
        chat = _Chat(_db())
        chat.db.table('notification_preferences').insert({
            'user_id': MUM, 'notification_type': chat_muted_key(GROUP), 'enabled': True,
        }).execute()
        repo = NotificationRepository(client=chat.db)

        assert repo.is_chat_muted(MUM, GROUP) is False
        assert repo.muted_member_ids(GROUP, [MUM, DAD]) == set()
        assert repo.muted_group_ids(MUM, [GROUP]) == set()

    def test_only_a_member_may_mute(self):
        chat = _Chat(_db())
        with pytest.raises(ValueError, match='not a member'):
            chat.svc.set_muted('stranger', GROUP, True)
        assert chat.db.rows['notification_preferences'] == []


# ---------------------------------------------------------------------------
# An open chat is a read chat
# ---------------------------------------------------------------------------

def test_fetching_the_messages_reads_the_bell_row():
    """The clients post /read once, on opening. A message that arrives while
    the chat is open leaves an unread row, and an unread row is what holds the
    next push back -- so the poll that shows the message clears it."""
    db = _db(members=(MUM,))
    db.rows['group_messages'] = []
    chat = _Chat(db)
    chat.say('one')
    assert chat.db.bell(MUM)[0]['is_read'] is False

    with patch('services.messaging_extras_service.enrich_messages', return_value=[]):
        chat.svc.get_messages(MUM, GROUP)

    assert chat.db.bell(MUM)[0]['is_read'] is True
    chat.say('two')
    assert chat.pushed_to() == [MUM, MUM]


# ---------------------------------------------------------------------------
# POST /api/groups/<id>/mute
# ---------------------------------------------------------------------------

class TestMuteRoute:
    def _call(self, body, service):
        fn = inspect.unwrap(routes.mute_group)
        app = Flask(__name__)
        with app.test_request_context('/', method='POST', json=body):
            with patch.object(routes, 'group_service', service):
                resp = fn(MUM, GROUP)
        body, status = resp if isinstance(resp, tuple) else (resp, 200)
        return status, body.get_json()

    @pytest.mark.parametrize('muted', [True, False])
    def test_it_sets_the_mute_and_answers_with_it(self, muted):
        service = Mock()
        service.set_muted.return_value = muted
        status, body = self._call({'muted': muted}, service)

        assert status == 200
        assert body['data'] == {'muted': muted}
        service.set_muted.assert_called_once_with(MUM, GROUP, muted)

    def test_someone_outside_the_chat_gets_403(self):
        service = Mock()
        service.set_muted.side_effect = ValueError('You are not a member of this group')
        status, body = self._call({'muted': True}, service)

        assert status == 403
        assert 'not a member' in body['error']

    @pytest.mark.parametrize('body', [{}, {'muted': 'false'}, {'muted': 1}, {'muted': None}])
    def test_anything_but_a_boolean_is_refused_before_it_is_stored(self, body):
        service = Mock()
        status, _ = self._call(body, service)

        assert status == 400
        service.set_muted.assert_not_called()

    def test_the_route_needs_a_session(self, client):
        resp = client.post(f'/api/groups/{GROUP}/mute', json={'muted': True})
        assert resp.status_code == 401

    def test_one_route_one_owner(self, app):
        endpoint, args = app.url_map.bind('localhost').match(
            f'/api/groups/{GROUP}/mute', method='POST')
        assert endpoint == 'group_messages.mute_group'
        assert args == {'group_id': GROUP}


# ---------------------------------------------------------------------------
# The list and the detail carry `muted`
# ---------------------------------------------------------------------------

class TestMutedOnReads:
    def _db(self):
        db = _Db(
            group_conversations=[
                {'id': GROUP, 'name': 'Art', 'is_active': True,
                 'last_message_at': '2026-09-30T10:00:00+00:00'},
                {'id': OTHER_GROUP, 'name': 'Maths', 'is_active': True,
                 'last_message_at': '2026-09-30T09:00:00+00:00'},
            ],
            group_members=[
                {'id': 'gm-1', 'group_id': GROUP, 'user_id': MUM,
                 'last_read_at': '2026-10-01T00:00:00+00:00'},
                {'id': 'gm-2', 'group_id': OTHER_GROUP, 'user_id': MUM,
                 'last_read_at': '2026-10-01T00:00:00+00:00'},
            ],
        )
        NotificationRepository(client=db).set_chat_muted(MUM, GROUP, True)
        # Somebody else's mute of the other chat is not Mum's.
        NotificationRepository(client=db).set_chat_muted(DAD, OTHER_GROUP, True)
        db.calls.clear()
        return db

    def _service(self, db):
        svc = GroupMessageService()
        svc._get_client = lambda: db
        svc._get_user_info = lambda uid: {'id': uid, 'display_name': uid}
        svc._guardian_class_context = lambda user_id, rows: {}
        return svc

    def test_the_list_says_which_chats_the_caller_muted(self):
        db = self._db()
        groups = self._service(db).get_user_groups(MUM)

        assert {g['name']: g['muted'] for g in groups} == {'Art': True, 'Maths': False}
        # One request for the whole list, however many chats are in it.
        assert db.calls.count(('notification_preferences', 'select')) == 1

    def test_the_detail_says_whether_the_caller_muted_it(self):
        db = self._db()
        svc = self._service(db)
        with patch('utils.storage_urls.sign_in_place'):
            assert svc.get_group(MUM, GROUP)['muted'] is True
            assert svc.get_group(MUM, OTHER_GROUP)['muted'] is False

    def test_a_failed_mute_lookup_does_not_take_the_list_down(self):
        db = self._db()
        with patch.object(NotificationRepository, 'muted_group_ids',
                          side_effect=RuntimeError('postgrest down')):
            groups = self._service(db).get_user_groups(MUM)
        assert [g['muted'] for g in groups] == [False, False]
