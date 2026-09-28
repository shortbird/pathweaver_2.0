"""The notifications list pages, searches and filters by kind.

519f371d (iCreate, Marika): "When I click Load More on notifications, it just
keeps showing me the same notifications over and over, not going deeper to
find older ones." The web page sent ?page=N; the route never read it and the
service always returned the newest `limit` rows, so every page was page one.

04e24d8c (iCreate, approved): "Adding a search bar to notifications would be
helpful. And a way to sort what kind of notification it is." -> ?q= and ?type=.

The fake below is a small in-memory PostgREST: it really filters, orders and
slices, so "page 2 is older than page 1" is checked against rows rather than
against the shape of a call chain.
"""

import re
from unittest.mock import patch

import pytest
from flask import Flask

from services.notification_service import (
    MOBILE_PUSH_NOTIFICATION_TYPES,
    NOTIFICATION_TYPE_GROUPS,
    NotificationService,
    resolve_type_filter,
)
from utils.validation.sanitizers import pgrst_pattern

# The notifications.type CHECK constraint on prod, 2026-09-28.
CHECK_TYPES = {
    'quest_invitation', 'quest_started', 'task_approved', 'task_revision_requested',
    'announcement', 'observer_comment', 'observer_like', 'badge_earned',
    'friendship_request', 'message_received', 'advisor_note', 'system_alert',
    'parent_approval_required', 'bounty_submission', 'diploma_credit_approved',
    'diploma_credit_grow_this', 'class_submitted_for_review', 'bounty_posted',
    'bounty_claimed', 'diploma_credit_requested', 'observer_accepted',
    'observer_added', 'org_approved_credit', 'video_processing', 'treehouse_help',
    'treehouse_proud', 'treehouse_task_completed', 'treehouse_quest_completed',
    'treehouse_showcase_joined', 'student_absent', 'attendance_reminder',
    'peer_connection_request', 'peer_connection_needs_approval',
    'peer_connection_approved', 'peer_connection_declined', 'peer_comment',
    'peer_friend_added', 'peer_reaction', 'peer_text_held', 'class_quest_assigned',
    'child_task_reviewed', 'class_work_reminder', 'school_notice',
}


def _like(pattern, value):
    """SQL ILIKE with backslash escapes, enough for these tests."""
    out = ''
    i = 0
    while i < len(pattern):
        ch = pattern[i]
        if ch == '\\' and i + 1 < len(pattern):
            out += re.escape(pattern[i + 1])
            i += 2
            continue
        out += '.*' if ch == '%' else '.' if ch == '_' else re.escape(ch)
        i += 1
    return re.fullmatch(out, value or '', re.IGNORECASE | re.DOTALL) is not None


class _Query:
    def __init__(self, rows, calls):
        self.rows = list(rows)
        self.calls = calls
        self._range = None
        self._orders = []

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.calls.append(('eq', col, val))
        self.rows = [r for r in self.rows if r.get(col) == val]
        return self

    def in_(self, col, vals):
        self.calls.append(('in_', col, list(vals)))
        self.rows = [r for r in self.rows if r.get(col) in vals]
        return self

    def or_(self, expr):
        self.calls.append(('or_', expr))
        conds = []
        for part in expr.split(','):
            col, op, pat = part.split('.', 2)
            assert op == 'ilike'
            conds.append((col, pat))
        self.rows = [r for r in self.rows if any(_like(p, r.get(c)) for c, p in conds)]
        return self

    def order(self, col, desc=False):
        self._orders.append((col, desc))
        return self

    def limit(self, n):
        self._range = (0, n - 1)
        return self

    def range(self, start, end):
        self.calls.append(('range', start, end))
        self._range = (start, end)
        return self

    def execute(self):
        rows = self.rows
        for col, desc in reversed(self._orders):
            rows = sorted(rows, key=lambda r: r[col], reverse=desc)
        if self._range:
            rows = rows[self._range[0]:self._range[1] + 1]

        class R:
            data = rows
        return R()


class _Client:
    def __init__(self, rows):
        self._rows = rows
        self.calls = []

    def table(self, name):
        assert name == 'notifications'
        return _Query(self._rows, self.calls)


def _rows():
    rows = []
    for i in range(45):
        kind = 'message_received' if i % 3 else 'school_notice'
        rows.append({
            'id': f'n{i:02d}',
            'user_id': 'marika',
            'type': kind,
            'title': 'Student not accounted for' if kind == 'school_notice' else f'Message {i}',
            'message': f'body {i}',
            'is_read': i % 2 == 0,
            'created_at': f'2026-09-{1 + i // 2:02d}T{10 + i % 2}:00:00Z',
        })
    rows.append({'id': 'other', 'user_id': 'someone-else', 'type': 'message_received',
                 'title': 'Not yours', 'message': '', 'is_read': False,
                 'created_at': '2026-12-01T00:00:00Z'})
    return rows


def _service(rows):
    with patch('supabase.create_client', return_value=_Client(rows)):
        return NotificationService()


@pytest.mark.unit
class TestPaging:

    def test_page_two_is_the_next_older_rows_not_page_one_again(self):
        # 519f371d: "it just keeps showing me the same notifications over and over"
        svc = _service(_rows())
        p1 = svc.get_user_notifications('marika', limit=20, page=1)
        p2 = svc.get_user_notifications('marika', limit=20, page=2)
        p3 = svc.get_user_notifications('marika', limit=20, page=3)
        assert len(p1) == 20 and len(p2) == 20 and len(p3) == 5
        ids = [n['id'] for n in p1 + p2 + p3]
        assert len(set(ids)) == 45
        assert min(n['created_at'] for n in p1) >= max(n['created_at'] for n in p2)
        assert 'other' not in ids

    def test_default_is_the_newest_page(self):
        svc = _service(_rows())
        newest = svc.get_user_notifications('marika', limit=5)
        assert [n['id'] for n in newest] == ['n44', 'n43', 'n42', 'n41', 'n40']
        assert ('range', 0, 4) in svc.supabase.calls


@pytest.mark.unit
class TestFilters:

    def test_no_filters_sends_no_filter_clauses(self):
        svc = _service(_rows())
        svc.get_user_notifications('marika', limit=100)
        kinds = {c[0] for c in svc.supabase.calls}
        assert 'or_' not in kinds and 'in_' not in kinds

    def test_search_matches_title_or_message_case_insensitively(self):
        svc = _service(_rows())
        found = svc.get_user_notifications('marika', limit=100, q='NOT ACCOUNTED')
        assert found and all(n['title'] == 'Student not accounted for' for n in found)
        assert len(found) == 15
        by_body = svc.get_user_notifications('marika', limit=100, q='body 7')
        assert [n['id'] for n in by_body] == ['n07']

    def test_type_group_filters_and_pages(self):
        svc = _service(_rows())
        school = resolve_type_filter('school')
        p1 = svc.get_user_notifications('marika', limit=10, page=1, types=school)
        p2 = svc.get_user_notifications('marika', limit=10, page=2, types=school)
        assert len(p1) == 10 and len(p2) == 5
        assert all(n['type'] == 'school_notice' for n in p1 + p2)
        assert not {n['id'] for n in p1} & {n['id'] for n in p2}

    def test_search_and_type_combine_with_unread(self):
        svc = _service(_rows())
        found = svc.get_user_notifications(
            'marika', limit=100, unread_only=True, q='message', types=['message_received'])
        assert found
        assert all(not n['is_read'] and n['type'] == 'message_received' for n in found)


@pytest.mark.unit
class TestSearchTerm:
    """The search box goes through the shared pgrst_pattern sanitizer, which
    test_postgrest_filter_injection requires of every value in a filter string.
    Filter-grammar characters and wildcards are removed, not escaped."""

    def test_filter_grammar_cannot_be_injected(self):
        # A comma would open a new or=() condition; parens would regroup it.
        term = pgrst_pattern('x,is_read.eq.true)')
        assert ',' not in term and ')' not in term and '(' not in term

    def test_wildcards_cannot_widen_the_search(self):
        assert '%' not in pgrst_pattern('50%') and '*' not in pgrst_pattern('a*b')

    def test_words_are_kept_whole(self):
        # 04e24d8c: Marika's example search must survive intact.
        assert pgrst_pattern('Student not accounted for') == 'Student not accounted for'

    def test_blank_is_no_search(self):
        svc = _service(_rows())
        everything = svc.get_user_notifications('marika', limit=100)
        assert svc.get_user_notifications('marika', limit=100, q='  ,, ') == everything


@pytest.mark.unit
class TestTypeGroups:

    def test_every_allowed_type_is_in_exactly_one_group(self):
        seen = [t for _k, _l, types in NOTIFICATION_TYPE_GROUPS for t in types]
        assert len(seen) == len(set(seen)), 'a type is in two groups'
        assert set(seen) == CHECK_TYPES
        assert MOBILE_PUSH_NOTIFICATION_TYPES <= set(seen)

    def test_resolve(self):
        assert resolve_type_filter(None) is None
        assert resolve_type_filter('held') == ['peer_text_held']
        assert resolve_type_filter('task_approved') == ['task_approved']
        with pytest.raises(ValueError):
            resolve_type_filter('nonsense')


def _call(view, *args):
    fn = view.__wrapped__ if hasattr(view, '__wrapped__') else view
    return fn(*args)


@pytest.mark.unit
class TestRoute:

    def _get(self, qs):
        import routes.notifications as r
        app = Flask(__name__)
        with app.test_request_context(f'/api/notifications{qs}'), \
             patch.object(r, 'get_supabase_admin_client'), \
             patch.object(r, 'NotificationService') as Svc:
            Svc.return_value.get_user_notifications.return_value = []
            Svc.return_value.get_unread_count.return_value = 0
            resp = _call(r.get_notifications, 'marika')
        return resp, Svc.return_value.get_user_notifications

    def test_page_reaches_the_service(self):
        # 519f371d: the route dropped ?page= on the floor.
        (resp, status), svc = self._get('?page=3&limit=20')
        assert status == 200
        kwargs = svc.call_args.kwargs
        assert kwargs['page'] == 3 and kwargs['limit'] == 20
        assert kwargs['q'] is None and kwargs['types'] is None

    def test_search_and_type_reach_the_service(self):
        (resp, status), svc = self._get('?q=%20late%20&type=school')
        assert status == 200
        kwargs = svc.call_args.kwargs
        assert kwargs['q'] == 'late'
        assert kwargs['types'] == resolve_type_filter('school')

    def test_unknown_type_and_bad_page_are_400(self):
        (resp, status), svc = self._get('?type=nonsense')
        assert status == 400
        svc.assert_not_called()
        (resp, status), svc = self._get('?page=0')
        assert status == 400

    def test_types_endpoint_lists_groups(self):
        import routes.notifications as r
        app = Flask(__name__)
        with app.test_request_context('/api/notifications/types'):
            resp, status = _call(r.get_notification_types, 'marika')
        body = resp.get_json()
        assert status == 200
        keys = [t['key'] for t in body['types']]
        assert keys[:4] == ['messages', 'school', 'announcements', 'held']
        assert all(t['label'] for t in body['types'])

