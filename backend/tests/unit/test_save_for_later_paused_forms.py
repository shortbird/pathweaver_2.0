"""Save for later, Resume, "I'm done with it" and Mark done -- ticket e17134c6.

Ticket e17134c6-4d17-432d-a075-4e6e89174282 (iCreate org admin, 2026-10-06):
"You have 'End Quest' but that's not super clear what that means. And I
didn't dare select that because I was worried I might end the quest on
accident and I didn't know what would happen."

The owner's contract for the follow-up (Tanner, 2026-10-07), pinned here
against an in-memory user_quests table so the filters are exercised on real
rows rather than read back off a mock:

  - Saved for Later lists every PAUSED enrollment (inactive, not completed),
    in all three forms prod holds: archived_at set (90 rows), status set_down
    (43), neither (131). archive_reason 'lost_interest' ("I'm done with it")
    is hidden from it.
  - Resume (/unarchive) revives any of those three forms: active, archive
    cleared, status picked_up.
  - /archive with reason lost_interest works on an already-paused row (the
    "Remove" on a Saved for Later row).
  - /archive works on any enrollment the quest page treats as active, which
    includes is_active=True with a stale completed_at (routes/quest/detail.py:
    "a quest can have both is_active=True AND completed_at set when
    restarted"). It used to filter completed_at IS NULL and answered 404 "No
    active enrollment to archive". A quest truly marked done (inactive +
    completed_at) still cannot be archived.
  - Mark done (/end) on a quest with no XP finish line needs at least one
    completed task on the current enrollment.
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

import routes.quest_lifecycle as lifecycle

USER = '22222222-2222-4222-8222-222222222222'
QUEST = '44444444-4444-4444-8444-444444444444'


# ── an in-memory PostgREST table ────────────────────────────────────────────

class _Query:
    def __init__(self, store, name):
        self.store, self.name = store, name
        self.preds, self.payload, self._negate = [], None, False

    def select(self, *_a, **_k):
        return self

    def update(self, payload):
        self.payload = payload
        return self

    def _add(self, pred):
        negate, self._negate = self._negate, False
        self.preds.append((lambda r: not pred(r)) if negate else pred)
        return self

    @property
    def not_(self):
        self._negate = True
        return self

    def eq(self, col, val):
        return self._add(lambda r: r.get(col) == val)

    def is_(self, col, val):
        assert val == 'null'
        return self._add(lambda r: r.get(col) is None)

    def in_(self, col, vals):
        return self._add(lambda r: r.get(col) in vals)

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        rows = [r for r in self.store[self.name] if all(p(r) for p in self.preds)]
        if self.payload is not None:
            for r in rows:
                r.update(self.payload)
        return MagicMock(data=[dict(r) for r in rows])


class _Db:
    def __init__(self, **tables):
        self.store = tables

    def table(self, name):
        return _Query(self.store, name)


def _row(**kw):
    base = {'id': kw.pop('id'), 'user_id': USER, 'quest_id': QUEST, 'is_active': False,
            'completed_at': None, 'archived_at': None, 'archive_reason': None,
            'archive_feedback': None, 'status': 'picked_up',
            'last_set_down_at': None, 'last_picked_up_at': None, 'started_at': None,
            'quests': {'id': QUEST, 'title': 'Birdhouse'}}
    base.update(kw)
    return base


ARCHIVED = dict(id='uq-archived', archived_at='2026-10-01T00:00:00Z', archive_reason='break')
SET_DOWN = dict(id='uq-setdown', status='set_down', last_set_down_at='2026-09-20T00:00:00Z')
UNMARKED = dict(id='uq-unmarked', started_at='2026-09-01T00:00:00Z')
HIDDEN = dict(id='uq-hidden', archived_at='2026-10-02T00:00:00Z', archive_reason='lost_interest')
DONE = dict(id='uq-done', completed_at='2026-09-30T00:00:00Z')
ACTIVE = dict(id='uq-active', is_active=True)


def _call(handler, db, json=None):
    """The route below @require_auth; @student_scope still runs (no
    student_id, so the caller's own rows)."""
    app = Flask(__name__)
    with app.test_request_context('/', method='POST', json=json or {}):
        with patch.object(lifecycle, 'get_supabase_admin_client', return_value=db):
            resp = handler.__wrapped__(USER, QUEST)
    body, status = resp if isinstance(resp, tuple) else (resp, 200)
    return body.get_json(), status


def _by_id(db):
    return {r['id']: r for r in db.store['user_quests']}


# ── Saved for Later lists all three paused forms ────────────────────────────

class TestSavedForLaterList:

    def _listed(self, *rows):
        from services.dashboard_service import DashboardService
        db = _Db(user_quests=[_row(**r) for r in rows])
        return [r['id'] for r in DashboardService(client=db).get_archived_quests(USER)]

    def test_lists_archived_set_down_and_unmarked(self):
        """e17134c6: only archived_at rows were listed; set_down and unmarked
        rows had left the active list with no way back from the dashboard."""
        listed = self._listed(ARCHIVED, SET_DOWN, UNMARKED)
        assert set(listed) == {'uq-archived', 'uq-setdown', 'uq-unmarked'}
        # Newest pause first, whichever column dated it.
        assert listed == ['uq-archived', 'uq-setdown', 'uq-unmarked']

    def test_excludes_done_with_it_finished_and_active(self):
        """e17134c6: "I'm done with it" (lost_interest) is hidden everywhere;
        a finished quest and an active one are not paused."""
        assert self._listed(HIDDEN, DONE, ACTIVE, ARCHIVED) == ['uq-archived']

    def test_each_row_carries_the_date_it_was_paused(self):
        from services.dashboard_service import DashboardService
        db = _Db(user_quests=[_row(**SET_DOWN)])
        row = DashboardService(client=db).get_archived_quests(USER)[0]
        assert row['saved_at'] == '2026-09-20T00:00:00Z'


# ── Resume revives every paused form ────────────────────────────────────────

class TestResume:

    @pytest.mark.parametrize('form', [SET_DOWN, UNMARKED, ARCHIVED], ids=['set_down', 'unmarked', 'archived'])
    def test_resume_revives_the_paused_form(self, form):
        """e17134c6: /unarchive matched archived_at only, so Resume on a
        set_down or unmarked row in Saved for Later answered 404."""
        db = _Db(user_quests=[_row(**form)])
        body, status = _call(lifecycle.unarchive_enrollment, db)
        assert status == 200 and body['restored'] == 1
        row = _by_id(db)[form['id']]
        assert row['is_active'] is True
        assert row['status'] == 'picked_up'
        assert row['archived_at'] is None and row['archive_reason'] is None

    def test_resume_leaves_a_finished_quest_finished(self):
        db = _Db(user_quests=[_row(**DONE)])
        _body, status = _call(lifecycle.unarchive_enrollment, db)
        assert status == 404
        assert _by_id(db)['uq-done']['is_active'] is False


# ── Save for later / "I'm done with it" ─────────────────────────────────────

class TestArchive:

    def test_done_with_it_on_an_already_paused_row(self):
        """e17134c6: "Remove" on a Saved for Later row is archive with reason
        lost_interest on a row that is already inactive."""
        for form in (SET_DOWN, UNMARKED):
            db = _Db(user_quests=[_row(**form)])
            body, status = _call(lifecycle.archive_enrollment, db, json={'reason': 'lost_interest'})
            assert status == 200 and body['archived'] == 1
            row = _by_id(db)[form['id']]
            assert row['archive_reason'] == 'lost_interest' and row['archived_at']
            assert row['is_active'] is False and row['completed_at'] is None

    def test_restarted_quest_with_a_stale_completed_at_can_be_saved(self):
        """e17134c6: the quest page treats is_active=True as active even with
        completed_at set; /archive filtered completed_at IS NULL and answered
        404 "No active enrollment to archive". Saving for later marks nothing
        complete, so the stale stamp is cleared: left in place, the inactive
        row would read as a finished quest."""
        db = _Db(user_quests=[_row(id='uq-restarted', is_active=True,
                                   completed_at='2026-08-01T00:00:00Z')])
        body, status = _call(lifecycle.archive_enrollment, db)
        assert status == 200 and body['archived'] == 1
        row = _by_id(db)['uq-restarted']
        assert row['is_active'] is False and row['archived_at']
        assert row['completed_at'] is None

    def test_a_quest_marked_done_still_cannot_be_archived(self):
        """e17134c6: only an inactive row WITH completed_at is truly ended."""
        db = _Db(user_quests=[_row(**DONE)])
        body, status = _call(lifecycle.archive_enrollment, db)
        assert status == 404
        assert body['error'] == 'No active enrollment to archive'
        row = _by_id(db)['uq-done']
        assert row['archived_at'] is None and row['completed_at']

    def test_an_ended_copy_beside_the_live_row_is_left_alone(self):
        db = _Db(user_quests=[_row(**DONE), _row(**ACTIVE)])
        _body, status = _call(lifecycle.archive_enrollment, db)
        assert status == 200
        assert _by_id(db)['uq-done']['archived_at'] is None
        assert _by_id(db)['uq-active']['archived_at']


# ── Mark done needs one finished task when there is no XP line ──────────────

def _table(data=None):
    t = MagicMock()
    for m in ('select', 'eq', 'insert', 'update', 'order', 'limit', 'single', 'is_'):
        getattr(t, m).return_value = t
    t.execute.return_value = MagicMock(data=data)
    return t


def _end(client, completions, threshold=None, lms_platform=None):
    tables = {
        'quests': _table({'xp_threshold': threshold, 'lms_platform': lms_platform, 'title': 'Birdhouse'}),
        'user_quests': _table([{'id': 'uq-1', 'is_active': True, 'completed_at': None}]),
        'quest_task_completions': _table(completions),
        'users': _table({'organization_id': None}),
    }
    admin = MagicMock()
    admin.table.side_effect = lambda name: tables[name]
    with patch('routes.quest.completion.get_supabase_admin_client', return_value=admin), \
         patch('routes.quest.completion.WebhookService'), \
         patch('services.lti_grade_sync_service.enqueue_for_quest_completion'):
        resp = client.post(f'/api/quests/{QUEST}/end', json={}, headers={'Authorization': 'Bearer t'})
    return resp, tables


@pytest.mark.unit
class TestMarkDoneNeedsOneTask:

    def test_refused_with_no_completed_task_and_no_xp_line(self, client, mock_verify_token):
        """e17134c6: Mark done on an empty quest marked it finished."""
        resp, tables = _end(client, completions=[])
        assert resp.status_code == 400
        body = resp.get_json()
        assert body['reason'] == 'NO_COMPLETED_TASKS'
        assert body['message'] == 'Finish at least one task to mark this quest done.'
        tables['user_quests'].update.assert_not_called()

    def test_allowed_with_one_completed_task(self, client, mock_verify_token):
        done = [{'id': 'c1', 'user_quest_task_id': 't1',
                 'user_quest_tasks': {'xp_value': 25, 'user_quest_id': 'uq-1'}}]
        resp, tables = _end(client, completions=done)
        assert resp.status_code == 200
        written = tables['user_quests'].update.call_args[0][0]
        assert written['is_active'] is False and written['completed_at']
        # Counted on the current enrollment, not across every attempt.
        tables['quest_task_completions'].eq.assert_any_call('user_quest_tasks.user_quest_id', 'uq-1')

    def test_an_lti_quest_keeps_its_own_rule(self, client, mock_verify_token):
        resp, _ = _end(client, completions=[], lms_platform='canvas')
        assert resp.status_code == 200


# ── Family lists carry what Mark done's rule needs ──────────────────────────

class TestFamilyQuestsCarryTheFinishLine:
    """e17134c6: the family cards (web FamilyQuestsSection, mobile
    FamilyQuestsSection) apply the quest page's Mark done rule, so GET
    /api/family/quests sends each quest's xp_threshold (null when none) and
    each member's earned_xp on that enrollment beside progress.completed_tasks.
    """

    def _body(self, threshold_for):
        from flask import Flask
        from tests.unit.test_family_quests_list import _answers, _call, ROMNEY, SIBLING, TRIP
        answers = _answers()
        base_quests = answers['quests']

        def quests(filters):
            return [dict(r, xp_threshold=threshold_for.get(r['id'])) for r in base_quests(filters)]
        answers['quests'] = quests
        answers['user_quest_tasks'] = [
            {'id': 't1', 'user_quest_id': 'uq-trip-r', 'xp_value': 75},
            {'id': 't2', 'user_quest_id': 'uq-trip-r', 'xp_value': 50},
            {'id': 't3', 'user_quest_id': 'uq-trip-s', 'xp_value': 40},
        ]
        body = _call(Flask(__name__), answers, [ROMNEY, SIBLING])
        return {q['id']: q for q in body['quests']}, TRIP, ROMNEY, SIBLING

    def test_threshold_and_earned_xp_are_sent(self):
        from tests.unit.test_family_quests_list import TRIP as trip_id
        by_id, trip, romney, sibling = self._body({trip_id: 300})
        assert by_id[trip]['xp_threshold'] == 300
        members = {m['user_id']: m for m in by_id[trip]['members']}
        # Romney finished t1 (75 XP) of t1 + t2; the sibling finished nothing.
        assert members[romney]['earned_xp'] == 75
        assert members[romney]['progress']['completed_tasks'] == 1
        assert members[sibling]['earned_xp'] == 0
        assert members[sibling]['progress']['completed_tasks'] == 0

    def test_a_quest_with_no_finish_line_sends_null(self):
        by_id, trip, _romney, _sibling = self._body({})
        assert 'xp_threshold' in by_id[trip]
        assert by_id[trip]['xp_threshold'] is None


class TestSchoolQuestsForFamilies:
    """e17134c6: the To do page's school quests (sis_parent_service.
    school_quests) hide one the parent said "I'm done with it" to, and carry
    the finish line and earned XP the Mark done rule needs."""

    def _out(self, rows):
        from tests.test_sis_family_quests import _school_quests, _quest_row
        rows = dict(rows)
        quest_row = _quest_row()
        quest_row['quests']['xp_threshold'] = rows.pop('xp_threshold', None)
        rows['sis_staff_training'] = [quest_row]
        out, _ = _school_quests(rows)
        return out

    def test_done_with_it_hides_the_quest(self):
        out = self._out({'user_quests': [{'id': 'uq1', 'quest_id': 'q1', 'completed_at': None,
                                          'is_active': False, 'archive_reason': 'lost_interest'}]})
        assert out == []

    def test_saved_for_later_stays_listed(self):
        out = self._out({'user_quests': [{'id': 'uq1', 'quest_id': 'q1', 'completed_at': None,
                                          'is_active': False, 'archive_reason': 'break'}]})
        assert [q['quest_id'] for q in out] == ['q1']

    def test_carries_the_finish_line_and_earned_xp(self):
        out = self._out({
            'xp_threshold': 400,
            'user_quests': [{'id': 'uq1', 'quest_id': 'q1', 'completed_at': None, 'is_active': True}],
            'user_quest_tasks': [{'id': 't1', 'user_quest_id': 'uq1', 'xp_value': 50},
                                 {'id': 't2', 'user_quest_id': 'uq1', 'xp_value': 100}],
            'quest_task_completions': [{'task_id': 't1'}],
        })
        assert out[0]['xp_threshold'] == 400
        assert out[0]['earned_xp'] == 50
