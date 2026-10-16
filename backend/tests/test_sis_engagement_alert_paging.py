"""
Open engagement alerts are read in pages, never in one capped response.

Sentry OPTIO-BACKEND-A7, 2026-10-15: iCreate held 1,180 open alerts. PostgREST
returns at most 1,000 rows and says nothing about the rest, so the staff
"Needs attention" list stopped at 1,000 and the daily sweep's dedupe set was
missing 180 keys -- each of which it then tried to insert again.

The fake client below enforces the same cap PostgREST does: an unranged read
returns the first 1,000 rows and nothing else.
"""

import pytest

import app  # noqa: F401 — import graph ordering
from services import sis_engagement_service as engagement

ORG = 'org-icreate'
CAP = 1000
TOTAL = 1180


class _Capped:
    """A single-use query over an in-memory table, capped like PostgREST."""

    def __init__(self, rows):
        self._rows = list(rows)
        self._range = None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._rows = [r for r in self._rows if r.get(col) == val]
        return self

    def is_(self, col, val):
        assert val == 'null'
        self._rows = [r for r in self._rows if r.get(col) is None]
        return self

    def in_(self, col, vals):
        self._rows = [r for r in self._rows if r.get(col) in vals]
        return self

    def order(self, col, desc=False):
        self._rows.sort(key=lambda r: r.get(col) or '', reverse=desc)
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def execute(self):
        rows = self._rows
        if self._range:
            rows = rows[self._range[0]:self._range[1] + 1]
        return type('R', (), {'data': rows[:CAP]})()


class _Client:
    def __init__(self, tables):
        self._tables = tables

    def table(self, name):
        return _Capped(self._tables.get(name, []))


def _alerts(n):
    return [{
        'id': f'alert-{i:05d}',
        'organization_id': ORG,
        'class_id': 'class-1',
        'student_user_id': f'student-{i:05d}',
        'quest_id': 'quest-1',
        'alert_type': engagement.ALERT_INACTIVE,
        'resolved_at': None,
        'created_at': f'2026-10-{1 + i % 14:02d}T00:00:{i % 60:02d}+00:00',
        'details': {},
    } for i in range(n)]


@pytest.fixture
def client(monkeypatch):
    c = _Client({'sis_engagement_alerts': _alerts(TOTAL)})
    monkeypatch.setattr(engagement, '_admin', lambda: c)
    monkeypatch.setattr('utils.db_fetch._default_page_size', lambda: CAP)
    return c


def test_needs_attention_lists_every_open_alert_past_the_cap(client):
    alerts = engagement.list_open_alerts(ORG)
    assert len(alerts) == TOTAL
    assert len({a['id'] for a in alerts}) == TOTAL


def test_needs_attention_is_still_newest_first(client):
    created = [a['created_at'] for a in engagement.list_open_alerts(ORG)]
    assert created == sorted(created, reverse=True)


def test_a_class_scoped_reader_is_still_scoped(client):
    assert engagement.list_open_alerts(ORG, class_ids=['other-class']) == []
    assert engagement.list_open_alerts(ORG, class_ids=[]) == []
    assert len(engagement.list_open_alerts(ORG, class_ids=['class-1'])) == TOTAL
