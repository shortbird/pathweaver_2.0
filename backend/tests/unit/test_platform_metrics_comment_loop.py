"""The daily metrics RPC learns who Optio is, and survives the deploy window.

The 20260914120000 migration adds the comment-loop columns and a second
parameter, p_platform_emails. Migrations are applied by hand and prod deploys
on green tests, so the backend can be ahead of the function for a while; the
route must not turn every chart on the superadmin home blank for that window.
"""

import pytest

from routes.admin.platform_metrics import _daily_series


class _Rpc:
    def __init__(self, answers):
        self.answers = answers  # list of exceptions or results, consumed in order
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        outer = self

        class _Q:
            def execute(self_inner):
                answer = outer.answers.pop(0)
                if isinstance(answer, Exception):
                    raise answer
                return answer
        return _Q()


class _Result:
    data = [{'day': '2026-09-14'}]


@pytest.fixture(autouse=True)
def _staff(monkeypatch):
    monkeypatch.setattr('utils.platform_staff._staff_emails',
                        lambda: frozenset({'Root@Optio.test', 'cofounder@optio.test', ''}))


def test_the_staff_emails_reach_the_database_lowercased():
    """The SQL compares lower(email); Config is documented lowercase but not enforced."""
    db = _Rpc([_Result()])
    assert _daily_series(db, 30).data == _Result.data
    assert db.calls == [('admin_platform_metrics_daily',
                         {'p_days': 30, 'p_platform_emails': ['cofounder@optio.test', 'root@optio.test']})]


def test_a_function_without_the_parameter_gets_the_old_call():
    """PGRST202: PostgREST could not find a function with that signature."""
    db = _Rpc([RuntimeError('{"code":"PGRST202","message":"Could not find the function '
                            'public.admin_platform_metrics_daily(p_days, p_platform_emails)"}'),
               _Result()])
    assert _daily_series(db, 7).data == _Result.data
    assert [params for _, params in db.calls] == [
        {'p_days': 7, 'p_platform_emails': ['cofounder@optio.test', 'root@optio.test']},
        {'p_days': 7},
    ]


def test_any_other_failure_is_not_swallowed():
    db = _Rpc([RuntimeError('connection reset')])
    with pytest.raises(RuntimeError, match='connection reset'):
        _daily_series(db, 7)
    assert len(db.calls) == 1
