"""
The Messages contact list must not stop at PostgREST's row cap.

Two branches of `get_contacts` read a whole population of users in one request:
the superadmin branch reads every account on the platform, and the org_admin
branch reads every member of the school. Both grow without bound, and PostgREST
truncates a response at `Config.POSTGREST_MAX_ROWS` while reporting nothing the
supabase-py client exposes -- so the tail of the list simply vanished, and the
people in it could not be messaged at all. There was no error to notice: the
picker just did not have them (Sentry OPTIO-BACKEND-8B, production, 2026-09-08).

The fake client below reproduces the cap exactly: a read that does not bound
itself with an in-cap `limit` gets at most 1000 rows back, the way the real
Data API answers. A single unpaged `.execute()` therefore cannot pass these
tests, which is the point of writing them against a capped fake rather than a
list.
"""

from unittest.mock import Mock, patch

import pytest

from app_config import Config


CAP = Config.POSTGREST_MAX_ROWS or 1000


class _CappedQuery:
    """Enough of a supabase-py builder to answer these reads, with PostgREST's
    row cap applied on the way out."""

    def __init__(self, table, tables):
        self._table = table
        self._tables = tables
        self._filters = []
        self._order = None
        self._range = None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._filters.append(lambda r: r.get(col) == val)
        return self

    def neq(self, col, val):
        self._filters.append(lambda r: r.get(col) != val)
        return self

    def in_(self, col, vals):
        wanted = set(vals)
        self._filters.append(lambda r: r.get(col) in wanted)
        return self

    def order(self, col, *_a, **_k):
        self._order = col
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def limit(self, n):
        self._range = (0, n - 1)
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        rows = [r for r in self._tables.get(self._table, [])
                if all(f(r) for f in self._filters)]
        if self._order:
            rows.sort(key=lambda r: str(r.get(self._order) or ''))
        if getattr(self, '_single', False):
            return Mock(data=rows[0] if rows else None)
        if self._range:
            start, end = self._range
            rows = rows[start:end + 1]
        # The cap. Applied after the caller's own window, exactly as PostgREST
        # does: a request that asked for at most CAP rows is unaffected, and one
        # that asked for everything is silently cut here.
        return Mock(data=rows[:CAP])


def _client(tables):
    c = Mock()
    c.table.side_effect = lambda name: _CappedQuery(name, tables)
    return c


# Comfortably past the cap, and named so that sorting by display_name is NOT the
# same as sorting by id -- the paged read orders by id for correctness, so the
# display ordering has to be reapplied afterwards or the picker's list arrives
# shuffled.
POPULATION = 1500


def _people(organization_id):
    return [{
        'id': f'user-{i:05d}',
        'display_name': f'Person {POPULATION - i:05d}',
        'first_name': 'Person', 'last_name': str(i),
        'avatar_url': None, 'email': f'p{i}@example.com',
        'role': 'org_managed', 'org_role': 'student',
        'organization_id': organization_id,
    } for i in range(POPULATION)]


def _run_get_contacts(actor, people):
    """Call the view past its auth decorator, with storage signing stubbed.

    An app context only so `success_response` can jsonify; nothing here touches
    a request or a real database.
    """
    from flask import Flask
    from routes import direct_messages

    tables = {'users': [actor] + people, 'organizations': []}
    with Flask(__name__).app_context(), \
         patch('database.get_supabase_admin_client', return_value=_client(tables)), \
         patch.object(direct_messages, 'sign_thumbs_in_place', lambda *_a, **_k: None):
        body, status = direct_messages.get_contacts.__wrapped__(actor['id'])
        assert status == 200, body.get_json()
        return body.get_json()['data']


@pytest.mark.unit
class TestContactListPaging:

    def test_a_superadmin_sees_every_account_not_the_first_thousand(self):
        actor = {'id': 'super-1', 'role': 'superadmin',
                 'org_role': None, 'organization_id': None}
        data = _run_get_contacts(actor, _people(None))
        assert data['total'] == POPULATION
        assert len(data['contacts']) == POPULATION

    def test_an_org_admin_sees_every_member_of_their_school(self):
        actor = {'id': 'admin-1', 'role': 'org_managed',
                 'org_role': 'org_admin', 'organization_id': 'org-1'}
        data = _run_get_contacts(actor, _people('org-1'))
        ids = {c['id'] for c in data['contacts']}
        assert len(ids) == POPULATION

    def test_the_list_is_still_ordered_by_display_name(self):
        """Paging reads in id order because it must -- LIMIT/OFFSET over a
        non-unique ordering skips rows. The picker's ordering is a separate
        concern and has to survive the change."""
        actor = {'id': 'super-1', 'role': 'superadmin',
                 'org_role': None, 'organization_id': None}
        names = [c['display_name'] for c in _run_get_contacts(actor, _people(None))['contacts']]
        assert names == sorted(names, key=str.lower)
