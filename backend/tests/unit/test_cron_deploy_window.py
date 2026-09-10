"""A 404 during the deploy window is not a cron failure.

The cron service auto-deploys on every push to `main`. The prod backend deploys
only from release.yml's `deploy` job, on green tests. So a single commit that
adds both a dispatch call and the route it calls ships the CALLER without the
CALLEE the moment it lands, and the gap lasts as long as the release is red.

Seen twice: parent-weekly-digest on 2026-09-08 (release failed on mypy), and
credit-ai-review-sweep on 2026-09-10 (release failed, backend stayed on the
previous SHA). Both times every other sweep returned 200, the run exited 1 every
ten minutes, and there was nothing wrong with the job.

The commit comparison is what keeps this from hiding real bugs: a 404 on the
SAME commit the backend is serving is a routing bug and still fails the run.
"""

from unittest.mock import MagicMock

import pytest

import jobs.cron_dispatch as dispatch


CRON_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
BACKEND_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'


def _response(status, body='{}'):
    r = MagicMock()
    r.status_code = status
    r.text = body
    return r


def _health(commit):
    r = MagicMock()
    r.status_code = 200
    r.json.return_value = {'status': 'healthy', 'commit': commit}
    return r


@pytest.fixture(autouse=True)
def _no_sleeping(monkeypatch):
    """The retry sleeps 30 s. Nothing here needs to wait for it."""
    monkeypatch.setattr(dispatch.time, 'sleep', lambda *_: None)


def _run_once(monkeypatch, *, post_status, backend_commit, cron_commit=CRON_SHA):
    monkeypatch.setattr(dispatch, '_post', lambda url, secret: _response(post_status))
    monkeypatch.setattr(dispatch.requests, 'get',
                        lambda url, timeout=None: _health(backend_commit))
    if cron_commit is None:
        monkeypatch.delenv('RENDER_GIT_COMMIT', raising=False)
    else:
        monkeypatch.setenv('RENDER_GIT_COMMIT', cron_commit)
    failures = []
    dispatch._run('a-sweep', 'https://api.example.com/api/x/sweep', 'sekret',
                  failures, base='https://api.example.com')
    return failures


@pytest.mark.unit
class TestTheDeployWindow:
    def test_a_404_against_a_different_commit_is_not_a_failure(self, monkeypatch):
        """THE ONE THAT MATTERS. The route ships in this cron's commit and the
        backend has not deployed it yet."""
        assert _run_once(monkeypatch, post_status=404, backend_commit=BACKEND_SHA) == []

    def test_a_404_against_the_same_commit_still_fails(self, monkeypatch):
        """Both are running the code that declares this route, so a 404 means
        the route is wrong. Tolerating this would let a deleted or misspelled
        endpoint sit silent forever."""
        assert _run_once(monkeypatch, post_status=404,
                         backend_commit=CRON_SHA) == ['a-sweep']

    def test_an_unreadable_health_check_still_fails(self, monkeypatch):
        """No evidence of a deploy window is not evidence of one."""
        monkeypatch.setattr(dispatch, '_post', lambda url, secret: _response(404))
        monkeypatch.setattr(dispatch.requests, 'get',
                            MagicMock(side_effect=dispatch.requests.RequestException('down')))
        monkeypatch.setenv('RENDER_GIT_COMMIT', CRON_SHA)
        failures = []
        dispatch._run('a-sweep', 'https://api.example.com/api/x/sweep', 'sekret',
                      failures, base='https://api.example.com')
        assert failures == ['a-sweep']

    def test_a_cron_with_no_commit_of_its_own_still_fails(self, monkeypatch):
        """Outside Render there is no RENDER_GIT_COMMIT, so there is nothing to
        compare and the tolerance must not apply."""
        assert _run_once(monkeypatch, post_status=404, backend_commit=BACKEND_SHA,
                         cron_commit=None) == ['a-sweep']


@pytest.mark.unit
class TestEverythingElseIsUnchanged:
    def test_200_succeeds(self, monkeypatch):
        assert _run_once(monkeypatch, post_status=200, backend_commit=BACKEND_SHA) == []

    def test_403_fails_without_consulting_health(self, monkeypatch):
        """A bad CRON_SECRET is not a deploy window, and retrying cannot help."""
        health = MagicMock()
        monkeypatch.setattr(dispatch, '_post', lambda url, secret: _response(403))
        monkeypatch.setattr(dispatch.requests, 'get', health)
        monkeypatch.setenv('RENDER_GIT_COMMIT', CRON_SHA)
        failures = []
        dispatch._run('a-sweep', 'https://api.example.com/api/x/sweep', 'sekret',
                      failures, base='https://api.example.com')
        assert failures == ['a-sweep']
        health.assert_not_called()

    def test_500_is_retried_then_fails(self, monkeypatch):
        posts = []

        def _post(url, secret):
            posts.append(url)
            return _response(500)

        monkeypatch.setattr(dispatch, '_post', _post)
        monkeypatch.setenv('RENDER_GIT_COMMIT', CRON_SHA)
        failures = []
        dispatch._run('a-sweep', 'https://api.example.com/api/x/sweep', 'sekret',
                      failures, base='https://api.example.com')
        assert len(posts) == 2
        assert failures == ['a-sweep']


@pytest.mark.unit
class TestEverySweepCanUseIt:
    def test_no_dispatch_call_forgets_the_base_url(self, monkeypatch):
        """The tolerance only runs when _run is told where /api/health is. A
        call site that omits `base` opts itself back into the outage."""
        from datetime import datetime as _dt, timezone

        calls = []
        monkeypatch.setenv('BACKEND_URL', 'https://api.example.com')
        monkeypatch.setenv('CRON_SECRET', 'sekret')
        monkeypatch.setattr(dispatch, '_run',
                            lambda name, url, secret, failures, **kw: calls.append((name, kw)))

        class _Clock(_dt):
            @classmethod
            def now(cls, tz=None):
                # An hour and minute that fires every daily job as well.
                return _dt(2026, 9, 10, 9, 3, tzinfo=timezone.utc)

        monkeypatch.setattr(dispatch, 'datetime', _Clock)
        with pytest.raises(SystemExit):
            dispatch.main()

        assert calls, 'main() dispatched nothing'
        missing = [name for name, kw in calls if not kw.get('base')]
        assert not missing, f'these sweeps cannot tell a deploy window from a 404: {missing}'
