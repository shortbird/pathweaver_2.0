"""
Activity metrics for the superadmin home and the School Dashboard.

The counting is SQL (20261012200000_activity_dashboards.sql); what is tested
here is the part that is not: who counts as stuck at sign-in, that a school
only ever sees its own people, that an email with no account reaches the
superadmin and never a school, the window clamp, the cache, and that every
route is superadmin-gated.
"""
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from repositories.activity_metrics_repository import ActivityMetricsRepository
from services import activity_metrics_service as svc
from utils import cache

NOW = datetime(2026, 10, 12, 18, tzinfo=timezone.utc)


class _Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters = db, table, []

    def select(self, *_a, **_k):
        return self

    def gte(self, col, value):
        self.filters.append(('gte', col, value))
        return self

    def in_(self, col, values):
        self.filters.append(('in', col, list(values)))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a):
        return self

    def execute(self):
        rows = list(self.db.tables.get(self.table, []))
        for op, col, value in self.filters:
            if op == 'in':
                rows = [r for r in rows if r.get(col) in value]
            elif op == 'gte':
                rows = [r for r in rows if r.get(col) is not None and r[col] >= value]
        self.db.reads.append((self.table, self.filters))

        class R:
            data = rows
        return R()


class _Db:
    def __init__(self, **tables):
        self.tables, self.reads, self.rpcs = tables, [], []

    def table(self, name):
        return _Query(self, name)

    def rpc(self, name, params):
        self.rpcs.append((name, params))
        db = self

        class Q:
            def execute(self_inner):
                class R:
                    data = db.tables.get(f'rpc:{name}')
                return R()
        return Q()


SCHOOL = 'org-school'
OTHER = 'org-other'


def _db():
    return _Db(
        login_attempts=[
            # Locked out right now.
            {'email': 'mom@school.test', 'attempt_count': 5, 'lockout_count': 1,
             'locked_until': '2026-10-12T18:20:00', 'updated_at': '2026-10-12T18:05:00'},
            # Two failures, no lockout, a different school.
            {'email': 'kid@other.test', 'attempt_count': 2, 'lockout_count': 0,
             'locked_until': None, 'updated_at': '2026-10-11T09:00:00'},
            # A typo nobody has an account for.
            {'email': 'mom@shcool.test', 'attempt_count': 3, 'lockout_count': 0,
             'locked_until': None, 'updated_at': '2026-10-10T09:00:00'},
            # One failure: probably a typo they fixed another way.
            {'email': 'dad@school.test', 'attempt_count': 1, 'lockout_count': 0,
             'locked_until': None, 'updated_at': '2026-10-12T10:00:00'},
            # Older than the window.
            {'email': 'old@school.test', 'attempt_count': 4, 'lockout_count': 0,
             'locked_until': None, 'updated_at': '2026-09-01T10:00:00'},
        ],
        users=[
            {'id': 'u-mom', 'email': 'mom@school.test', 'first_name': 'Ana', 'last_name': 'Ruiz',
             'role': 'org_managed', 'org_role': 'parent', 'organization_id': SCHOOL},
            {'id': 'u-kid', 'email': 'kid@other.test', 'first_name': 'Bo', 'last_name': None,
             'role': 'org_managed', 'org_role': 'student', 'organization_id': OTHER},
            {'id': 'u-dad', 'email': 'dad@school.test', 'first_name': 'Cy',
             'role': 'org_managed', 'org_role': 'parent', 'organization_id': SCHOOL},
        ],
        organizations=[{'id': SCHOOL, 'name': 'School'}, {'id': OTHER, 'name': 'Other'}],
        household_members=[{'user_id': 'u-mom', 'household_id': 'hh-1'}],
    )


@pytest.fixture(autouse=True)
def _fresh_cache():
    cache.reset_for_tests()
    with patch.object(cache, '_get_redis', return_value=None):
        yield
    cache.reset_for_tests()


@pytest.mark.unit
class TestSignInTrouble:
    def test_superadmin_sees_every_school_and_the_unmatched_typo(self):
        db = _db()
        with patch.object(svc, '_repo', return_value=ActivityMetricsRepository(client=db)):
            people = svc.sign_in_trouble(now=NOW)
        assert [p['email'] for p in people] == [
            'mom@school.test', 'kid@other.test', 'mom@shcool.test']
        mom, kid, typo = people
        assert mom['name'] == 'Ana Ruiz' and mom['role'] == 'parent'
        assert mom['organization_name'] == 'School'
        assert mom['locked'] is True and mom['was_locked'] is True
        assert kid['locked'] is False and kid['failures'] == 2
        assert typo['has_account'] is False and typo['user_id'] is None

    def test_a_school_sees_only_its_own_people_and_never_a_bare_email(self):
        db = _db()
        with patch.object(svc, '_repo', return_value=ActivityMetricsRepository(client=db)):
            people = svc.sign_in_trouble(SCHOOL, now=NOW)
        assert [p['user_id'] for p in people] == ['u-mom']
        # The family door on the dashboard opens the household.
        assert people[0]['household_id'] == 'hh-1'
        # The school view never asks for other schools' names.
        assert 'organizations' not in [t for t, _ in db.reads]

    def test_one_failure_and_old_failures_are_not_trouble(self):
        db = _db()
        with patch.object(svc, '_repo', return_value=ActivityMetricsRepository(client=db)):
            emails = {p['email'] for p in svc.sign_in_trouble(now=NOW)}
        assert 'dad@school.test' not in emails
        assert 'old@school.test' not in emails

    def test_nobody_failing_reads_nothing_else(self):
        db = _Db(login_attempts=[])
        with patch.object(svc, '_repo', return_value=ActivityMetricsRepository(client=db)):
            assert svc.sign_in_trouble(now=NOW) == []
        assert [t for t, _ in db.reads] == ['login_attempts']


@pytest.mark.unit
class TestAggregates:
    def test_the_window_is_clamped(self):
        assert svc.clamp_days(400, 30) == 90
        assert svc.clamp_days(0, 30) == 1
        assert svc.clamp_days('x', 30) == 30

    def test_org_activity_is_cached_per_window(self):
        db = _Db(**{'rpc:admin_org_activity': [{'name': 'School'}]})
        with patch.object(svc, '_repo', return_value=ActivityMetricsRepository(client=db)):
            assert svc.org_activity(30) == [{'name': 'School'}]
            svc.org_activity(30)
            svc.org_activity(400)
        assert db.rpcs == [('admin_org_activity', {'p_days': 30}),
                           ('admin_org_activity', {'p_days': 90})]

    def test_school_activity_passes_the_org_through(self):
        db = _Db(**{'rpc:sis_org_activity': {'students': 3}})
        with patch.object(svc, '_repo', return_value=ActivityMetricsRepository(client=db)):
            assert svc.school_activity(SCHOOL, 7) == {'students': 3}
        assert db.rpcs == [('sis_org_activity', {'p_org_id': SCHOOL, 'p_days': 7})]


@pytest.mark.unit
@pytest.mark.parametrize('rule', ['/platform-metrics/orgs', '/platform-metrics/pipelines',
                                  '/platform-metrics/sign-in-trouble'])
def test_every_new_route_is_superadmin_only(rule):
    import inspect
    from routes.admin import platform_metrics as pm
    src = inspect.getsource(pm)
    at = src.index(f"@platform_metrics_bp.route('{rule}'")
    assert '@require_superadmin' in src[at:at + 120]
