"""
The Messages badge has to count class chats, not just direct messages.

`GET /api/messages/unread-count` drives the "Messages (n)" badge in the web
sidebar and the mobile tab. It counted `direct_messages` and nothing else, so
every group message was invisible to it: a parent with one unread DM and a
dozen unread class-chat messages saw "Messages (1)" and had no way to know the
rest were waiting. Class chats are where a school family gets most of its mail,
so the badge was wrong for exactly the people who lean on it hardest — and it
disagreed with the Messages screen, which has always listed both.

These tests pin the counting rule (messages from other people, not deleted,
newer than this member's last_read_at — the same rule get_user_groups uses, so
the badge and the list agree) and the best-effort behaviour: a failure counting
groups must not take the badge down with it.
"""

import pytest


class _Resp:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    """Fluent stand-in for a supabase-py table query, with real filtering."""

    def __init__(self, table, admin):
        self.table = table
        self.admin = admin
        self._filters = []
        self._count = None
        self._range = None

    def select(self, *a, **k):
        self._count = k.get('count')
        return self

    def eq(self, col, val):
        self._filters.append(lambda r: r.get(col) == val); return self

    def neq(self, col, val):
        self._filters.append(lambda r: r.get(col) != val); return self

    def gt(self, col, val):
        self._filters.append(lambda r: (r.get(col) or '') > val); return self

    def in_(self, col, vals):
        vals = list(vals)
        self._filters.append(lambda r: r.get(col) in vals); return self

    def order(self, *a, **k):
        return self

    def range(self, start, end):
        self._range = (start, end); return self

    def execute(self):
        self.admin.counted.append(self.table)
        rows = [r for r in self.admin.rows.get(self.table, [])
                if all(f(r) for f in self._filters)]
        if self._range:
            start, end = self._range
            rows = rows[start:end + 1]
        if self._count == 'exact':
            return _Resp(rows, count=len(rows))
        return _Resp(rows)


class _FakeAdmin:
    def __init__(self, rows):
        self.rows = rows
        self.counted = []

    def table(self, name):
        return _Query(name, self)


PARENT = 'parent-1'
READ_AT = '2026-09-08T12:00:00Z'


def _service(rows):
    from services.group_message_service import GroupMessageService
    admin = _FakeAdmin(rows)
    service = GroupMessageService()
    service._get_client = lambda: admin
    return service, admin


def _rows(memberships, groups, messages):
    return {
        'group_members': memberships,
        'group_conversations': groups,
        'group_messages': messages,
    }


def _member(group_id, last_read_at=None):
    return {'id': f'gm-{group_id}', 'group_id': group_id,
            'user_id': PARENT, 'last_read_at': last_read_at}


def _msg(mid, group_id, sender_id, created_at, is_deleted=False):
    return {'id': mid, 'group_id': group_id, 'sender_id': sender_id,
            'created_at': created_at, 'is_deleted': is_deleted}


@pytest.mark.unit
class TestGroupUnreadTotal:
    def test_counts_unread_messages_across_every_class_chat(self):
        service, _ = _service(_rows(
            [_member('g1', READ_AT), _member('g2', READ_AT)],
            [{'id': 'g1', 'is_active': True, 'last_message_at': '2026-09-08T18:00:00Z'},
             {'id': 'g2', 'is_active': True, 'last_message_at': '2026-09-08T19:00:00Z'}],
            [_msg('m1', 'g1', 'teacher', '2026-09-08T18:00:00Z'),
             _msg('m2', 'g2', 'teacher', '2026-09-08T19:00:00Z'),
             _msg('m3', 'g2', 'other-parent', '2026-09-08T19:30:00Z')],
        ))
        assert service.get_unread_total(PARENT) == 3

    def test_counts_everything_when_a_chat_was_never_opened(self):
        service, _ = _service(_rows(
            [_member('g1')],
            [{'id': 'g1', 'is_active': True, 'last_message_at': '2026-09-08T18:00:00Z'}],
            [_msg('m1', 'g1', 'teacher', '2026-01-01T00:00:00Z'),
             _msg('m2', 'g1', 'teacher', '2026-09-08T18:00:00Z')],
        ))
        assert service.get_unread_total(PARENT) == 2

    def test_ignores_your_own_messages_and_deleted_ones(self):
        service, _ = _service(_rows(
            [_member('g1', READ_AT)],
            [{'id': 'g1', 'is_active': True, 'last_message_at': '2026-09-08T19:00:00Z'}],
            [_msg('m1', 'g1', PARENT, '2026-09-08T18:00:00Z'),
             _msg('m2', 'g1', 'teacher', '2026-09-08T18:30:00Z', is_deleted=True),
             _msg('m3', 'g1', 'teacher', '2026-09-08T19:00:00Z')],
        ))
        assert service.get_unread_total(PARENT) == 1

    def test_skips_the_count_query_for_a_chat_with_nothing_new(self):
        """The short circuit is the reason this is affordable on a 15s poll: a
        parent of three is in dozens of class chats and has read nearly all."""
        service, admin = _service(_rows(
            [_member('g1', READ_AT), _member('g2', READ_AT)],
            [{'id': 'g1', 'is_active': True, 'last_message_at': '2026-09-08T09:00:00Z'},
             {'id': 'g2', 'is_active': True, 'last_message_at': '2026-09-08T19:00:00Z'}],
            [_msg('m1', 'g2', 'teacher', '2026-09-08T19:00:00Z')],
        ))
        assert service.get_unread_total(PARENT) == 1
        assert admin.counted.count('group_messages') == 1

    def test_leaves_archived_groups_out(self):
        service, _ = _service(_rows(
            [_member('g1')],
            [{'id': 'g1', 'is_active': False, 'last_message_at': '2026-09-08T18:00:00Z'}],
            [_msg('m1', 'g1', 'teacher', '2026-09-08T18:00:00Z')],
        ))
        assert service.get_unread_total(PARENT) == 0

    def test_is_zero_for_someone_in_no_groups(self):
        service, admin = _service(_rows([], [], []))
        assert service.get_unread_total(PARENT) == 0
        assert 'group_conversations' not in admin.counted

    def test_a_failure_returns_zero_rather_than_breaking_the_badge(self):
        service, admin = _service(_rows([], [], []))
        admin.table = lambda name: (_ for _ in ()).throw(RuntimeError('down'))
        assert service.get_unread_total(PARENT) == 0


@pytest.mark.unit
class TestUnreadCountEndpoint:
    def _get(self, direct, group):
        from flask import Flask
        from unittest.mock import patch
        from routes import direct_messages as route
        from services.group_message_service import GroupMessageService
        from utils.auth import decorators as auth_decorators

        app = Flask(__name__)
        app.config['TESTING'] = True
        app.register_blueprint(route.bp)

        with patch.object(auth_decorators.session_manager, 'get_effective_user_id',
                          return_value=PARENT), \
             patch.object(route.message_service, 'get_unread_count', return_value=direct), \
             patch.object(GroupMessageService, 'get_unread_total', return_value=group):
            resp = app.test_client().get('/api/messages/unread-count')
        return resp.get_json()

    def test_badge_is_the_sum_of_both_kinds_of_mail(self):
        """The reported symptom: one unread DM and a pile of unread class-chat
        messages rendered as "Messages (1)" in the sidebar."""
        body = self._get(direct=1, group=12)
        assert body['data']['unread_count'] == 13

    def test_reports_each_half_so_a_wrong_badge_can_be_attributed(self):
        body = self._get(direct=1, group=12)
        assert body['data']['direct_unread'] == 1
        assert body['data']['group_unread'] == 12

    def test_class_chats_alone_still_light_the_badge(self):
        """A family whose whole conversation happens in class chats used to see
        no badge at all, however much mail was waiting."""
        assert self._get(direct=0, group=4)['data']['unread_count'] == 4
