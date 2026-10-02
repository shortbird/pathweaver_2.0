"""Bulk resolve for the teacher dashboard's Needs attention card.

Ticket 6e03f8c6 (iCreate, Marika -- org_admin, viewing as a teacher): "On needs
attention, can we have a search function, and a checkbox so teachers can
resolve multiple things at a time?"

POST /api/sis/engagement-alerts/resolve {ids, scope} applies the single
resolve's rule to each id. An id outside the caller's scope (another org, a
class they do not teach) is skipped and never written.
"""

import inspect
from unittest.mock import patch

import pytest
from flask import Flask

import app  # noqa: F401 -- import graph ordering
from routes.sis import engagement as routes
from services import sis_engagement_service as svc

ORG = 'org-1'

ALERTS = {
    'a-mine': {'id': 'a-mine', 'organization_id': ORG, 'class_id': 'class-a'},
    'a-mine-2': {'id': 'a-mine-2', 'organization_id': ORG, 'class_id': 'class-b'},
    'a-other-class': {'id': 'a-other-class', 'organization_id': ORG, 'class_id': 'class-z'},
    'a-other-org': {'id': 'a-other-org', 'organization_id': 'org-2', 'class_id': 'class-a'},
}


class _Query:
    def __init__(self, db):
        self.db, self.mode, self.ids, self.payload = db, None, [], None

    def select(self, *_a, **_k):
        self.mode = 'select'
        return self

    def update(self, payload):
        self.mode, self.payload = 'update', payload
        return self

    def in_(self, _col, ids):
        self.ids = list(ids)
        return self

    def execute(self):
        class R:
            pass
        r = R()
        if self.mode == 'select':
            r.data = [ALERTS[i] for i in self.ids if i in ALERTS]
        else:
            self.db.updated.extend(self.ids)
            r.data = []
        return r


class _Admin:
    def __init__(self):
        self.updated = []

    def table(self, name):
        assert name == 'sis_engagement_alerts'
        return _Query(self)


@pytest.fixture
def admin():
    db = _Admin()
    with patch.object(svc, '_admin', return_value=db):
        yield db


class TestResolveAlertsService:
    def test_resolves_in_scope_and_skips_the_rest_without_writing(self, admin):
        counts = svc.resolve_alerts(
            ORG, ['a-mine', 'a-mine-2', 'a-other-class', 'a-other-org', 'missing'],
            class_ids=['class-a', 'class-b'])
        assert counts == {'resolved': 2, 'skipped': 3}
        assert sorted(admin.updated) == ['a-mine', 'a-mine-2']

    def test_admin_scope_none_still_stops_at_the_org(self, admin):
        counts = svc.resolve_alerts(ORG, ['a-other-class', 'a-other-org'], class_ids=None)
        assert counts == {'resolved': 1, 'skipped': 1}
        assert admin.updated == ['a-other-class']

    def test_nothing_in_scope_writes_nothing(self, admin):
        counts = svc.resolve_alerts(ORG, ['a-other-org'], class_ids=['class-a'])
        assert counts == {'resolved': 0, 'skipped': 1}
        assert admin.updated == []

    def test_duplicate_ids_count_once(self, admin):
        assert svc.resolve_alerts(ORG, ['a-mine', 'a-mine'], class_ids=['class-a']) == \
            {'resolved': 1, 'skipped': 0}


def _post(body, query=''):
    view = inspect.unwrap(routes.resolve_engagement_alerts)
    flask_app = Flask(__name__)
    with flask_app.test_request_context(f'/api/sis/engagement-alerts/resolve{query}',
                                        method='POST', json=body), \
         patch.object(routes.sis_service, 'org_or_error', return_value=(ORG, None)), \
         patch('routes.sis.staff_portal._read_target', return_value='teacher-1'), \
         patch.object(routes.sis_service, 'advisor_class_ids', return_value=['class-a']), \
         patch.object(routes.sis_service, 'class_scope', return_value=None):
        out = view('teacher-1')
        resp, status = out if isinstance(out, tuple) else (out, 200)
        return status, resp.get_json()


class TestBulkResolveRoute:
    def test_scope_mine_in_body_resolves_only_my_classes(self, admin):
        status, body = _post({'ids': ['a-mine', 'a-mine-2', 'a-other-org'], 'scope': 'mine'})
        assert status == 200
        assert body == {'success': True, 'resolved': 1, 'skipped': 2}
        assert admin.updated == ['a-mine']

    def test_scope_mine_in_query_string_works_too(self, admin):
        status, body = _post({'ids': ['a-mine', 'a-mine-2']}, '?scope=mine')
        assert status == 200
        assert body['resolved'] == 1 and admin.updated == ['a-mine']

    def test_without_scope_an_admin_resolves_across_the_org(self, admin):
        status, body = _post({'ids': ['a-mine', 'a-other-class', 'a-other-org']})
        assert status == 200
        assert body == {'success': True, 'resolved': 2, 'skipped': 1}

    @pytest.mark.parametrize('body', [{'ids': []}, {}, {'ids': 'a-mine'}])
    def test_empty_or_malformed_list_is_400(self, admin, body):
        status, _ = _post(body)
        assert status == 400
        assert admin.updated == []

    def test_too_many_ids_is_400(self, admin):
        status, _ = _post({'ids': [f'x{i}' for i in range(svc.MAX_BULK_RESOLVE + 1)]})
        assert status == 400
        assert admin.updated == []


def test_bulk_rule_does_not_shadow_the_single_resolve():
    """CLAUDE.md "One route, one owner": each URL reaches its own handler."""
    m = app.app.url_map.bind('localhost')
    assert m.match('/api/sis/engagement-alerts/resolve', method='POST')[0] == \
        'sis_engagement.resolve_engagement_alerts'
    endpoint, args = m.match('/api/sis/engagement-alerts/abc/resolve', method='POST')
    assert endpoint == 'sis_engagement.resolve_engagement_alert'
    assert args == {'alert_id': 'abc'}


class TestSingleResolveSharesTheRule:
    """The single Resolve button goes through the same check as the bulk one."""

    def test_in_scope_alert_resolves(self, admin):
        assert svc.resolve_alert(ORG, 'a-mine', class_ids=['class-a']) is True
        assert admin.updated == ['a-mine']

    @pytest.mark.parametrize('alert_id', ['a-other-class', 'a-other-org', 'missing'])
    def test_out_of_scope_alert_is_refused_without_a_write(self, admin, alert_id):
        assert svc.resolve_alert(ORG, alert_id, class_ids=['class-a']) is False
        assert admin.updated == []
