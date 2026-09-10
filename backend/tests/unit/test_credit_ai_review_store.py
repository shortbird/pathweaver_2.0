"""The queue, and the claim that stops two workers doing the same review twice.

There is no job queue in this codebase, so the table is the queue. Two things
arrive within seconds of each other -- the thread the student's submission
started, and the cron sweep -- and without a conditional claim both would read
the same submission, pay for the same multimodal call twice, and race to write
two different answers into one row.

The token is the second half. A worker killed mid-review by a deploy can come
back long enough to overwrite an answer a later worker already stored, and the
later answer is the one that was actually reviewed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from services.credit_ai_review import store

ROUND_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
REVIEW_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'


class _Query:
    """Records the filters applied, and answers with whatever it was given."""

    def __init__(self, rows, log):
        self._rows = rows
        self._log = log
        self._filters = {}
        self._payload = None
        self._op = None

    def update(self, payload):
        self._op, self._payload = 'update', payload
        return self

    def insert(self, payload):
        self._op, self._payload = 'insert', payload
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    def execute(self):
        if self._op:
            self._log.append({'op': self._op, 'payload': self._payload,
                              'filters': dict(self._filters)})
            # A conditional update answers with no rows when the filter misses.
            expected = self._filters.get('status')
            if expected and expected != self._rows_status():
                return SimpleNamespace(data=[], count=0)
            token = self._filters.get('claim_token')
            if token and token != self._rows_token():
                return SimpleNamespace(data=[], count=0)
        return SimpleNamespace(data=self._rows, count=len(self._rows))

    def _rows_status(self):
        return (self._rows[0] if self._rows else {}).get('status')

    def _rows_token(self):
        return (self._rows[0] if self._rows else {}).get('claim_token')

    def __getattr__(self, name):
        return lambda *a, **k: self


def _client(rows=None):
    log = []
    rows = rows if rows is not None else []
    client = MagicMock()
    client.table.side_effect = lambda name: _Query(rows, log)
    client._log = log
    return client


def _row(**overrides):
    base = {'id': REVIEW_ID, 'round_id': ROUND_ID, 'completion_id': COMPLETION_ID,
            'status': 'queued', 'attempts': 0, 'claim_token': None}
    base.update(overrides)
    return base


@pytest.mark.unit
class TestQueueing:
    def test_a_new_round_is_queued(self):
        client = _client([])
        store.queue_review(client, round_id=ROUND_ID, completion_id=COMPLETION_ID)
        inserted = [e for e in client._log if e['op'] == 'insert']
        assert inserted[0]['payload']['status'] == 'queued'

    def test_an_already_queued_round_is_left_alone(self):
        """The submission has not changed, so neither should the review."""
        client = _client([_row(status='queued')])
        store.queue_review(client, round_id=ROUND_ID, completion_id=COMPLETION_ID)
        assert [e for e in client._log if e['op'] == 'insert'] == []

    def test_a_running_round_is_left_alone(self):
        client = _client([_row(status='running')])
        store.queue_review(client, round_id=ROUND_ID, completion_id=COMPLETION_ID)
        assert client._log == []

    def test_a_finished_round_is_reset_on_a_forced_rerun(self):
        client = _client([_row(status='complete', attempts=2)])
        store.queue_review(client, round_id=ROUND_ID, completion_id=COMPLETION_ID,
                           requested_by='super-1', force=True)
        payload = [e for e in client._log if e['op'] == 'update'][0]['payload']
        assert payload['status'] == 'queued'
        assert payload['requested_by'] == 'super-1'

    def test_a_forced_rerun_starts_the_attempt_budget_over(self):
        """A human asking again is not the same as an automatic retry."""
        client = _client([_row(status='failed', attempts=3)])
        store.queue_review(client, round_id=ROUND_ID, completion_id=COMPLETION_ID, force=True)
        assert [e for e in client._log if e['op'] == 'update'][0]['payload']['attempts'] == 0

    def test_forcing_over_a_live_worker_is_refused(self):
        """Two owners for one row is the thing the claim exists to prevent."""
        client = _client([_row(status='running', started_at=_now_iso())])
        with pytest.raises(store.AlreadyRunning):
            store.queue_review(client, round_id=ROUND_ID, completion_id=COMPLETION_ID,
                               force=True)

    def test_forcing_over_an_abandoned_worker_is_allowed(self):
        client = _client([_row(status='running', started_at=_ago_iso(minutes=60))])
        store.queue_review(client, round_id=ROUND_ID, completion_id=COMPLETION_ID, force=True)
        assert [e for e in client._log if e['op'] == 'update']


@pytest.mark.unit
class TestClaiming:
    def test_claiming_a_queued_row_returns_a_token(self):
        client = _client([_row(status='queued')])
        assert store.claim(client, REVIEW_ID)

    def test_claiming_filters_on_the_status_it_expects_to_find(self):
        client = _client([_row(status='queued')])
        store.claim(client, REVIEW_ID)
        assert client._log[0]['filters']['status'] == 'queued'

    def test_losing_the_race_returns_nothing(self):
        """An ordinary outcome: somebody else has it, so there is nothing to do."""
        client = _client([_row(status='running')])
        assert store.claim(client, REVIEW_ID) is None

    def test_two_claims_get_different_tokens(self):
        client = _client([_row(status='queued')])
        assert store.claim(client, REVIEW_ID) != store.claim(client, REVIEW_ID)


@pytest.mark.unit
class TestWritingResults:
    def test_a_result_is_written_only_by_the_worker_that_holds_the_claim(self):
        client = _client([_row(status='running', claim_token='tok')])
        assert store.store_complete(client, REVIEW_ID, 'tok', review={'x': 1},
                                    model='m', prompt_version='v') is True

    def test_a_zombie_worker_cannot_overwrite_a_newer_answer(self):
        client = _client([_row(status='running', claim_token='newer-token')])
        assert store.store_complete(client, REVIEW_ID, 'stale-token', review={'x': 1},
                                    model='m', prompt_version='v') is False

    def test_a_retryable_failure_goes_back_in_the_queue(self):
        client = _client([_row(status='running', claim_token='tok')])
        store.store_failure(client, REVIEW_ID, 'tok', error='503', retryable=True, attempts=1)
        assert client._log[0]['payload']['status'] == 'queued'

    def test_a_retryable_failure_out_of_budget_is_final(self):
        client = _client([_row(status='running', claim_token='tok')])
        store.store_failure(client, REVIEW_ID, 'tok', error='503', retryable=True,
                            attempts=store.MAX_ATTEMPTS)
        assert client._log[0]['payload']['status'] == 'failed'

    def test_a_retry_keeps_the_error_text(self):
        client = _client([_row(status='running', claim_token='tok')])
        store.store_failure(client, REVIEW_ID, 'tok', error='model overloaded',
                            retryable=True, attempts=1)
        assert 'overloaded' in client._log[0]['payload']['error']

    def test_skipped_is_recorded_with_its_reason(self):
        client = _client([_row(status='running', claim_token='tok')])
        store.store_skipped(client, REVIEW_ID, 'tok', reason='ai_disabled_for_student')
        payload = client._log[0]['payload']
        assert payload['status'] == 'skipped'
        assert payload['skip_reason'] == 'ai_disabled_for_student'

    def test_every_terminal_write_clears_the_claim(self):
        for write in (
            lambda c: store.store_complete(c, REVIEW_ID, 'tok', review={}, model='m',
                                           prompt_version='v'),
            lambda c: store.store_failure(c, REVIEW_ID, 'tok', error='x', retryable=False,
                                          attempts=1),
            lambda c: store.store_skipped(c, REVIEW_ID, 'tok', reason='x'),
        ):
            client = _client([_row(status='running', claim_token='tok')])
            write(client)
            assert client._log[0]['payload']['claim_token'] is None


@pytest.mark.unit
class TestAbandonedWork:
    """A worker does not get to say it died."""

    def test_a_row_stuck_running_goes_back_in_the_queue(self):
        client = _client([{'id': REVIEW_ID, 'attempts': 0}])
        assert store.requeue_stale(client) == 1
        assert client._log[0]['payload']['status'] == 'queued'

    def test_the_attempt_is_counted_so_it_cannot_loop_forever(self):
        client = _client([{'id': REVIEW_ID, 'attempts': 0}])
        store.requeue_stale(client)
        assert client._log[0]['payload']['attempts'] == 1

    def test_three_deaths_is_not_bad_luck(self):
        client = _client([{'id': REVIEW_ID, 'attempts': store.MAX_ATTEMPTS - 1}])
        store.requeue_stale(client)
        assert client._log[0]['payload']['status'] == 'failed'


@pytest.mark.unit
class TestReadingBack:
    def test_the_newest_review_per_completion_wins(self):
        """A resubmitted task has a row per round; the current one is the answer."""
        client = MagicMock()
        rows = [
            {'completion_id': COMPLETION_ID, 'status': 'failed', 'created_at': '2026-01-01'},
            {'completion_id': COMPLETION_ID, 'status': 'complete', 'created_at': '2026-02-01'},
        ]
        client.table.return_value = _Query(rows, [])
        latest = store.latest_for_completions(client, [COMPLETION_ID])
        assert latest[COMPLETION_ID]['status'] == 'complete'

    def test_no_ids_means_no_query(self):
        client = MagicMock()
        assert store.latest_for_completions(client, []) == {}
        assert client.table.called is False


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _ago_iso(minutes):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
