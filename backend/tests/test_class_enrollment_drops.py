"""
Every way a student leaves a class takes the class's quests back.

iCreate, 2026-10-01 (ticket d8a2a8d4, Marika, org_admin, on /overview): "how
does one get rid of quests that shouldn't be there. AJ should not have any
elementary classes/quests on his since he is in high school". Joining a class
enrolled the student in its quests; leaving it did nothing.

The first fix taught only the office's roster drop. The owner's rule
(2026-10-02): every path that drops a student from a class withdraws that
class's quests with the same rule (class_quest_enrollment.
withdraw_student_from_class_quests). So a seat now ends through one door,
services/class_enrollment_drops.withdraw_class_enrollments, and these pin
that each drop path goes through it:

  * the office archives a class (routes/sis/catalog.archive_class)
  * a parent drops a class in the Schedule Builder (sis_parent_service.drop_class)
  * an exception approval drops same-time classes (sis_exception_service.resolve)
  * a person or family leaves the school (sis_person_service._release_class_seats)
  * a cohort is archived, or a student withdrawn from one (class_service, treehouse)

The office's one-student drop (catalog.unenroll_student) is pinned in
tests/test_learning_snapshot_quests.py. Each path also proves a failed quest
step never fails the drop: the drop is what somebody asked for.
"""

from contextlib import contextmanager
from unittest.mock import patch

import pytest

from tests.test_class_quest_audience import _client
# The same fake plus upsert, which the exception approval's new seat uses.
from tests.test_class_quest_copy import _client as _upsert_client

ORG = 'org-1'
ART = 'class-art'
MUSIC = 'class-music'
NEW = 'class-new'
AJ = 'student-aj'
KID = 'student-kid'
OFFICE = 'user-office'
PARENT = 'user-parent'


def _db():
    return {
        'class_enrollments': [
            {'id': 'ce-1', 'class_id': ART, 'student_id': AJ, 'status': 'active'},
            {'id': 'ce-2', 'class_id': ART, 'student_id': KID, 'status': 'active'},
            {'id': 'ce-3', 'class_id': MUSIC, 'student_id': AJ, 'status': 'active'},
            {'id': 'ce-4', 'class_id': ART, 'student_id': 'student-gone', 'status': 'withdrawn'},
        ],
        'org_classes': [{'id': ART, 'organization_id': ORG, 'name': 'Art', 'status': 'active'},
                        {'id': MUSIC, 'organization_id': ORG, 'name': 'Music', 'status': 'active'}],
        'sis_waitlist_entries': [],
    }


@contextmanager
def _rule(db, fail=False):
    """Stand in for withdraw_student_from_class_quests. Records each call and
    the student's seat status at that moment (the rule asks which classes the
    student is still in, so the seat must already be withdrawn)."""
    calls = []

    def fake(_admin, class_id, student_id):
        seat = next((e['status'] for e in db['class_enrollments']
                     if e['class_id'] == class_id and e['student_id'] == student_id), None)
        calls.append((class_id, student_id, seat))
        if fail:
            raise RuntimeError('db down')
        return {'quests': 1, 'removed': 1, 'set_down': 0, 'kept': 0, 'shared': 0}

    with patch('services.class_quest_enrollment.withdraw_student_from_class_quests',
               side_effect=fake):
        yield calls


def _status(db, enrollment_id):
    return next(e['status'] for e in db['class_enrollments'] if e['id'] == enrollment_id)


def _unwrap(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


# ── The door itself ──────────────────────────────────────────────────────────

@pytest.mark.unit
class TestTheDoor:

    def test_a_drop_withdraws_the_seat_then_the_quests(self):
        from services.class_enrollment_drops import withdraw_class_enrollments
        db = _db()
        with _rule(db) as calls:
            rows = withdraw_class_enrollments(_client(db, []), actor_id=OFFICE,
                                              class_ids=[ART], student_id=AJ)
        assert _status(db, 'ce-1') == 'withdrawn'
        assert db['class_enrollments'][0]['status_changed_by'] == OFFICE
        assert _status(db, 'ce-3') == 'active'   # their other class is not touched
        assert calls == [(ART, AJ, 'withdrawn')]
        assert rows[0]['quests']['removed'] == 1

    def test_a_failed_quest_step_still_drops_and_says_none(self):
        from services.class_enrollment_drops import withdraw_class_enrollments
        db = _db()
        with _rule(db, fail=True):
            rows = withdraw_class_enrollments(_client(db, []), actor_id=OFFICE,
                                              enrollment_ids=['ce-1'], student_id=AJ)
        assert _status(db, 'ce-1') == 'withdrawn'
        assert rows[0]['quests'] is None

    @pytest.mark.parametrize('filters', [{}, {'class_ids': []}, {'enrollment_ids': []},
                                         {'student_id': AJ, 'class_ids': []}])
    def test_no_filter_or_an_empty_one_writes_nothing(self, filters):
        """An unfiltered update would withdraw the whole school."""
        from services.class_enrollment_drops import withdraw_class_enrollments
        db, log = _db(), []
        with _rule(db) as calls:
            assert withdraw_class_enrollments(_client(db, log), actor_id=OFFICE, **filters) == []
        assert log == [] and calls == []

    def test_a_seat_already_withdrawn_is_not_dropped_again(self):
        from services.class_enrollment_drops import withdraw_class_enrollments
        db = _db()
        with _rule(db) as calls:
            withdraw_class_enrollments(_client(db, []), class_ids=[ART], student_id='student-gone')
        assert calls == []


# ── Each drop path ───────────────────────────────────────────────────────────

def _archive_sis_class(db):
    import app as _real_app  # noqa: F401 — import graph ordering
    from flask import Flask
    from routes.sis import catalog
    fake = _client(db, [])
    with Flask(__name__).test_request_context('/x', method='DELETE'), \
         patch.object(catalog.sis_service, 'org_or_error', return_value=(ORG, None)), \
         patch.object(catalog, 'get_supabase_admin_client', return_value=fake), \
         patch.object(catalog.SisClassRepository, 'find_by_id',
                      return_value={'id': ART, 'organization_id': ORG}), \
         patch.object(catalog.SisClassRepository, 'archive', return_value={'id': ART}), \
         patch('services.sis_waitlist_service.restore_entry_for_withdrawal'), \
         patch('services.class_group_sync_service.sync_class_group'):
        resp = _unwrap(catalog.archive_class)(OFFICE, ART)
    body = resp[0] if isinstance(resp, tuple) else resp
    return body.get_json()


def _parent_drop(db):
    from services import sis_parent_service
    with patch('services.sis_parent_service._admin', return_value=_client(db, [])), \
         patch('services.sis_parent_service._can_register', return_value=True), \
         patch('services.sis_parent_service._changes_locked', return_value=False), \
         patch('services.class_group_sync_service.sync_class_group'), \
         patch('services.sis_waitlist_service.restore_entry_for_withdrawal'), \
         patch('services.sis_waitlist_service.alert_admins_seat_opened'), \
         patch('services.sis_parent_service._reprice_after_change'):
        return sis_parent_service.drop_class(PARENT, ORG, AJ, ART)


def _exception_approval(db):
    from services import sis_exception_service as exceptions
    db[exceptions.TABLE] = [{'id': 'r1', 'organization_id': ORG, 'status': 'pending',
                             'student_user_id': AJ, 'class_id': NEW}]
    with patch('services.sis_exception_service._admin', return_value=_upsert_client(db, [])), \
         patch('services.sis_exception_service._same_time_conflicts',
               return_value=[{'class_id': ART, 'class_name': 'Art'}]), \
         patch('services.sis_exception_service._enroll_in_class_quests'), \
         patch('services.class_group_sync_service.sync_class_group'), \
         patch('services.sis_waitlist_service.restore_entry_for_withdrawal'), \
         patch('services.sis_waitlist_service.clear_entry_for_enrollment'):
        return exceptions.resolve(ORG, 'r1', 'approve', resolved_by=OFFICE, drop_conflicting=True)


def _person_leaves(db):
    from services import sis_person_service
    with patch('services.sis_person_service._admin', return_value=_client(db, [])), \
         patch('services.class_group_sync_service.sync_class_group'):
        return sis_person_service._release_class_seats(ORG, AJ, OFFICE)


def _class_service_archive(db):
    from services.class_service import ClassService
    with patch('repositories.class_repository.get_supabase_admin_client',
               return_value=_client(db, [])):
        return ClassService().archive_class(ART, OFFICE)


def _class_service_withdraw(db):
    from services.class_service import ClassService
    with patch('repositories.class_repository.get_supabase_admin_client',
               return_value=_client(db, [])):
        return ClassService().withdraw_student(ART, AJ, OFFICE)


def _treehouse(view_name, *args):
    def run(db):
        import app as _real_app  # noqa: F401 — import graph ordering
        from flask import Flask
        from routes import treehouse
        with Flask(__name__).test_request_context('/x', method='DELETE'), \
             patch('repositories.class_repository.get_supabase_admin_client',
                   return_value=_client(db, [])), \
             patch.object(treehouse, '_context', return_value={'org_id': ORG}), \
             patch.object(treehouse, '_is_admin', return_value=True), \
             patch.object(treehouse, '_verify_cohort_in_org', return_value=True):
            resp = _unwrap(getattr(treehouse, view_name))(OFFICE, *args)
        body = resp[0] if isinstance(resp, tuple) else resp
        return body.get_json()
    return run


# (path, run, the drops it must make, the seats that must end withdrawn)
PATHS = [
    ('office archives a class', _archive_sis_class,
     [(ART, AJ), (ART, KID)], ['ce-1', 'ce-2']),
    ('parent drops in the Schedule Builder', _parent_drop, [(ART, AJ)], ['ce-1']),
    ('exception approval drops a same-time class', _exception_approval, [(ART, AJ)], ['ce-1']),
    ('a person or family leaves the school', _person_leaves,
     [(ART, AJ), (MUSIC, AJ)], ['ce-1', 'ce-3']),
    ('a cohort is archived', _class_service_archive, [(ART, AJ), (ART, KID)], ['ce-1', 'ce-2']),
    ('a student is withdrawn from a cohort', _class_service_withdraw, [(ART, AJ)], ['ce-1']),
    ('treehouse archives a cohort', _treehouse('delete_cohort', ART),
     [(ART, AJ), (ART, KID)], ['ce-1', 'ce-2']),
    ('treehouse withdraws a cohort student', _treehouse('withdraw_cohort_student', ART, AJ),
     [(ART, AJ)], ['ce-1']),
]


@pytest.mark.unit
@pytest.mark.parametrize('name, run, drops, seats', PATHS, ids=[p[0] for p in PATHS])
class TestEveryDropPath:

    def test_the_drop_takes_the_class_quests_back(self, name, run, drops, seats):
        db = _db()
        with _rule(db) as calls:
            run(db)
        for s in seats:
            assert _status(db, s) == 'withdrawn', s
        # Once per dropped seat, each after that seat was withdrawn.
        assert sorted((c, s) for c, s, _ in calls) == sorted(drops)
        assert all(seat == 'withdrawn' for _, _, seat in calls)

    def test_a_failed_quest_step_never_fails_the_drop(self, name, run, drops, seats):
        db = _db()
        with _rule(db, fail=True) as calls:
            out = run(db)
        for s in seats:
            assert _status(db, s) == 'withdrawn', s
        assert len(calls) == len(drops)
        assert out not in (None, False) and not (isinstance(out, dict) and out.get('error'))


@pytest.mark.unit
def test_the_exception_approval_drops_after_the_new_seat():
    """A quest the new class also carries counts as still theirs only once
    they are in the new class, so the old seats end after the new one exists."""
    db = _db()
    seen = []

    def fake(_admin, class_id, student_id):
        seen.append(next((e['status'] for e in db['class_enrollments']
                          if e['class_id'] == NEW and e['student_id'] == student_id), None))
        return {}

    with patch('services.class_quest_enrollment.withdraw_student_from_class_quests',
               side_effect=fake):
        out = _exception_approval(db)
    assert out['request']['status'] == 'approved'
    assert seen == ['active']
