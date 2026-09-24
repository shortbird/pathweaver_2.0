"""
The task center: one task, its thread, the office's Assigned view, templates
from a task, and recurring schedules (iCreate meeting 2026-09-23).

The access rule under all of it is sis_tasks_service.may_see_task: the
assignee, whoever assigned it, or an admin of that school. The request queue
this replaced answered "not an admin" to a teacher who was assigned a request
and sent a parent a comment notice pointing at a page they could not open;
both are pinned here so neither comes back.
"""

from datetime import date, datetime, timezone
from unittest.mock import MagicMock, Mock, patch
from zoneinfo import ZoneInfo

import pytest
from flask import Flask

from services import sis_onboarding_service as onboarding
from services import sis_task_schedule_service as schedules
from services import sis_tasks_service as tasks

ORG = 'org-1'
OTHER_ORG = 'org-2'


def _row(**over):
    base = {'id': 't1', 'organization_id': ORG, 'user_id': 'teacher', 'assigned_by': 'office',
            'audience': 'staff', 'kind': 'task', 'status': 'in_progress',
            'template_name': 'Printer in Room 3', 'batch_id': 'b1',
            'created_at': '2026-09-20T00:00:00Z',
            'items': [{'key': 'i1', 'title': 'Printer in Room 3', 'status': 'pending',
                       'required': True}]}
    base.update(over)
    return base


# ── Who may see a task ───────────────────────────────────────────────────────

@pytest.mark.unit
class TestWhoMaySeeATask:
    def test_the_assignee_and_the_assigner_may(self):
        assert tasks.may_see_task(_row(), ORG, 'teacher', is_admin=False)
        assert tasks.may_see_task(_row(), ORG, 'office', is_admin=False)

    def test_another_teacher_may_not(self):
        assert not tasks.may_see_task(_row(), ORG, 'someone-else', is_admin=False)

    def test_an_admin_of_the_school_may(self):
        assert tasks.may_see_task(_row(), ORG, 'someone-else', is_admin=True)

    def test_nobody_may_across_schools(self):
        """An admin of another school is an admin of THAT school."""
        assert not tasks.may_see_task(_row(), OTHER_ORG, 'teacher', is_admin=True)

    def test_no_row_is_no(self):
        assert not tasks.may_see_task(None, ORG, 'teacher', is_admin=True)


# ── Comments ─────────────────────────────────────────────────────────────────

def _comment_run(row, author, body, is_admin=False):
    repo = Mock()
    repo.get.return_value = row
    repo.add_comment.return_value = {'id': 'c1', 'body': body}
    with patch.object(tasks, '_repo', return_value=repo), \
         patch.object(tasks, '_names', return_value={}), \
         patch.object(tasks.sis_notifications, 'notify') as notify:
        result = tasks.add_comment(ORG, author, row['id'] if row else 'x', body, is_admin)
    return result, repo, notify


@pytest.mark.unit
class TestComments:
    def test_the_other_party_hears_about_it_the_author_does_not(self):
        result, repo, notify = _comment_run(_row(), 'teacher', 'On it')
        assert result['comment']['id'] == 'c1'
        repo.add_comment.assert_called_once_with(ORG, 't1', 'teacher', 'On it')
        assert [c.args[0] for c in notify.call_args_list] == ['office']
        assert notify.call_args.kwargs['link'] == '/tasks?tab=assigned&task=t1'

    def test_a_family_assignee_is_sent_to_a_page_they_can_open(self):
        """The request queue linked a parent to the staff console. A family's
        comment notice goes to their own To do."""
        row = _row(user_id='parent', audience='family')
        _, _, notify = _comment_run(row, 'office', 'We have your form')
        assert [c.args[0] for c in notify.call_args_list] == ['parent']
        assert notify.call_args.kwargs['link'] == '/family/forms?task=t1'

    def test_an_empty_comment_is_refused(self):
        result, repo, _ = _comment_run(_row(), 'teacher', '   ')
        assert result['status'] == 400
        repo.add_comment.assert_not_called()

    def test_a_stranger_cannot_comment(self):
        result, repo, notify = _comment_run(_row(), 'someone-else', 'hello')
        assert result['status'] == 404
        repo.add_comment.assert_not_called()
        notify.assert_not_called()


# ── The routes' access check ─────────────────────────────────────────────────

def _access(row, caller, *, admin=False, caller_org=ORG):
    from routes.sis import tasks as routes
    repo = Mock()
    repo.get.return_value = row
    with patch('repositories.sis_task_repository.SisTaskRepository', return_value=repo), \
         patch.object(routes, 'get_supabase_admin_client'), \
         patch.object(routes.sis_service, 'caller_is_admin', return_value=admin), \
         patch.object(routes.sis_service, 'resolve_org_id', return_value=caller_org):
        return routes._access(caller, 't1')


@pytest.mark.unit
class TestRouteAccess:
    def test_a_teacher_assigned_a_task_can_open_it(self):
        """Non-admin assignees could not work a request (known breakage the
        merge must not carry over)."""
        row, is_admin = _access(_row(), 'teacher')
        assert row['id'] == 't1' and is_admin is False

    def test_an_admin_of_another_school_is_turned_away(self):
        row, _ = _access(_row(), 'admin-elsewhere', admin=True, caller_org=OTHER_ORG)
        assert row is None

    def test_an_admin_of_this_school_is_let_in_as_admin(self):
        row, is_admin = _access(_row(), 'the-admin', admin=True)
        assert row and is_admin is True

    def test_a_stranger_gets_nothing(self):
        assert _access(_row(), 'someone-else') == (None, None)


def _call_item_patch(row, caller, is_admin):
    from routes.sis import tasks as routes
    app = Flask(__name__)
    with app.test_request_context('/api/sis/tasks/t1/items/i1', method='PATCH',
                                  json={'status': 'complete'}), \
         patch.object(routes, '_access', return_value=(row, is_admin)), \
         patch.object(routes.portal_views, 'update_onboarding_item',
                      return_value=('ok', 200)) as update:
        out = routes.update_task_item.__wrapped__(caller, 't1', 'i1')
    return out, update


@pytest.mark.unit
class TestWorkingASteps:
    def test_the_assignee_works_their_own_step(self):
        _, update = _call_item_patch(_row(), 'teacher', False)
        update.assert_called_once_with(ORG, 'teacher', 't1', 'i1', is_admin=False)

    def test_the_assigner_who_is_not_an_admin_may_read_but_not_work_it(self):
        out, update = _call_item_patch(_row(), 'office', False)
        assert out[1] == 403
        update.assert_not_called()

    def test_an_expired_occurrence_cannot_be_ticked(self):
        client = Mock()
        with patch.object(onboarding, '_load_assignment',
                          return_value=_row(status='expired')), \
             patch.object(onboarding, '_admin', return_value=client):
            result = onboarding.update_item(ORG, 't1', 'i1', {'status': 'complete'},
                                            actor_id='teacher', is_admin=False)
        assert result == {'error': 'This task has expired'}


# ── The Assigned view ────────────────────────────────────────────────────────

def _batches(rows):
    with patch.object(tasks.onboarding, 'list_assignments', return_value=rows) as listed, \
         patch.object(tasks, '_names', return_value={'office': 'Molly'}):
        out = tasks.list_batches(ORG)
    assert listed.call_args.kwargs['kind'] == 'task'
    return out


@pytest.mark.unit
class TestAssignedCards:
    def test_one_card_per_send_counting_people_done(self):
        rows = [
            _row(id='a', user_id='u1', user_name='Ann', status='complete',
                 items=[{'key': 'i', 'status': 'complete', 'submitted_at': '2026-09-21T10:00:00Z'}]),
            _row(id='b', user_id='u2', user_name='Ben'),
            _row(id='c', user_id='u3', user_name='Cal', batch_id='b2'),
        ]
        out = {b['key']: b for b in _batches(rows)}
        assert set(out) == {'batch:b1', 'batch:b2'}
        b1 = out['batch:b1']
        assert (b1['done'], b1['total']) == (1, 2)
        assert [p['user_name'] for p in b1['people']] == ['Ann', 'Ben']
        ann = b1['people'][0]
        assert ann['status'] == 'done' and ann['finished_at'] == '2026-09-21T10:00:00Z'
        assert b1['assigned_by_name'] == 'Molly'

    def test_older_rows_group_by_template_or_stand_alone(self):
        rows = [_row(id='x', batch_id=None, template_id='tmpl'),
                _row(id='y', batch_id=None, template_id='tmpl', user_id='u2'),
                _row(id='z', batch_id=None, template_id=None)]
        keys = sorted(b['key'] for b in _batches(rows))
        assert keys == ['task:z', 'template:tmpl']

    def test_recurring_occurrences_are_not_cards(self):
        """A daily duty for 40 staff would add 40 cards a day; those live in
        the schedule's grid."""
        assert _batches([_row(schedule_id='s1')]) == []


@pytest.mark.unit
class TestSaveAsTemplate:
    def test_the_steps_are_kept_and_the_progress_is_not(self):
        row = _row(description='Directions', audience='family', blocks_access=True, items=[
            {'key': 'k', 'title': 'Upload ID', 'needs_document': True, 'status': 'complete',
             'documents': [{'path': 'x'}], 'signature': {'name': 'Pat'}, 'document_id': 'd1',
             'submitted_at': 'now'}])
        repo = Mock()
        repo.get.return_value = row
        with patch.object(tasks, '_repo', return_value=repo), \
             patch.object(tasks.onboarding, 'save_template',
                          return_value={'template': {'id': 'new'}}) as save:
            out = tasks.save_as_template(ORG, 'office', 't1')
        assert out == {'template': {'id': 'new'}}
        data = save.call_args.args[1]
        assert data['name'] == 'Printer in Room 3'
        assert data['audience'] == 'family' and data['blocks_access'] is True
        assert data['items'] == [{'title': 'Upload ID', 'needs_document': True}]

    def test_a_task_from_another_school_is_not_found(self):
        repo = Mock()
        repo.get.return_value = _row(organization_id=OTHER_ORG)
        with patch.object(tasks, '_repo', return_value=repo):
            assert tasks.save_as_template(ORG, 'office', 't1')['status'] == 404


# ── Recurring schedules ──────────────────────────────────────────────────────

DENVER = ZoneInfo('America/Denver')


def _schedule(**over):
    base = {'id': 's1', 'organization_id': ORG, 'title': 'Lock the east doors',
            'description': None, 'items': [], 'recipients': [
                {'id': 'u1', 'audience': 'staff'}, {'id': 'u2', 'audience': 'student'}],
            'days_of_week': [0, 2, 4], 'start_date': '2026-09-01', 'end_date': None,
            'priority': None, 'active': True, 'created_by': 'office', 'last_run_on': None}
    base.update(over)
    return base


@pytest.mark.unit
class TestEndOfDay:
    def test_the_day_ends_at_the_orgs_midnight(self):
        # Denver is UTC-6 in September: 23:59:59 local is 05:59:59 UTC next day.
        assert schedules.end_of_day_utc(date(2026, 9, 23), DENVER) == '2026-09-24T05:59:59+00:00'

    def test_a_dst_change_day_is_still_its_own_length(self):
        # 2026-11-01 is 25 hours long in Denver; its end is 06:59:59 UTC next day.
        assert schedules.end_of_day_utc(date(2026, 11, 1), DENVER) == '2026-11-02T06:59:59+00:00'


def _run_schedule(row, today, have=()):
    repo = Mock()
    repo.occurrence_user_ids.return_value = set(have)
    with patch.object(schedules, '_repo', return_value=repo), \
         patch.object(schedules.onboarding, 'assign_task',
                      return_value={'assigned': 2 - len(have)}) as assign:
        out = schedules.run_schedule(row, today=today, tz=DENVER)
    return out, assign, repo


@pytest.mark.unit
class TestRunningASchedule:
    def test_a_scheduled_day_creates_that_days_task_for_each_person(self):
        out, assign, repo = _run_schedule(_schedule(), date(2026, 9, 23))  # a Wednesday
        assert out == {'created': 2}
        kwargs = assign.call_args.kwargs
        assert assign.call_args.args[2] == [{'id': 'u1', 'audience': 'staff'},
                                            {'id': 'u2', 'audience': 'student'}]
        assert kwargs['schedule_id'] == 's1' and kwargs['occurrence_date'] == '2026-09-23'
        assert kwargs['due_date'] == '2026-09-23'
        assert kwargs['expires_at'] == '2026-09-24T05:59:59+00:00'
        # A daily duty repeats: it is never "already held".
        assert kwargs['skip_held'] is False
        repo.update_schedule.assert_called_once_with('s1', {'last_run_on': '2026-09-23'})

    def test_an_off_day_creates_nothing(self):
        out, assign, _ = _run_schedule(_schedule(), date(2026, 9, 22))  # a Tuesday
        assert out == {'created': 0}
        assign.assert_not_called()

    def test_a_second_run_the_same_day_creates_only_whoever_is_missing(self):
        """Idempotent on (schedule, person, day)."""
        _, assign, _ = _run_schedule(_schedule(), date(2026, 9, 23), have=['u1'])
        assert assign.call_args.args[2] == [{'id': 'u2', 'audience': 'student'}]
        _, assign, _ = _run_schedule(_schedule(), date(2026, 9, 23), have=['u1', 'u2'])
        assign.assert_not_called()

    def test_every_run_on_one_day_files_into_one_batch(self):
        _, a1, _ = _run_schedule(_schedule(), date(2026, 9, 23))
        _, a2, _ = _run_schedule(_schedule(), date(2026, 9, 23), have=['u1'])
        _, a3, _ = _run_schedule(_schedule(), date(2026, 9, 25))
        assert a1.call_args.kwargs['batch_id'] == a2.call_args.kwargs['batch_id']
        assert a1.call_args.kwargs['batch_id'] != a3.call_args.kwargs['batch_id']

    def test_before_the_start_or_after_the_end_creates_nothing(self):
        out, assign, _ = _run_schedule(_schedule(start_date='2026-09-24'), date(2026, 9, 23))
        assert out == {'created': 0}
        out, assign, _ = _run_schedule(_schedule(end_date='2026-09-21'), date(2026, 9, 23))
        assert out == {'created': 0}
        assign.assert_not_called()

    def test_a_paused_schedule_creates_nothing(self):
        out, assign, _ = _run_schedule(_schedule(active=False), date(2026, 9, 23))
        assert out == {'created': 0}
        assign.assert_not_called()


@pytest.mark.unit
class TestTheCron:
    def test_it_runs_each_schedule_in_its_orgs_day_and_then_expires(self):
        """05:00 UTC on Thursday is still Wednesday evening in Denver: a
        Wednesday schedule runs, a Thursday-only one does not."""
        repo = Mock()
        repo.active_schedules.return_value = [
            _schedule(id='wed', days_of_week=[2]),
            _schedule(id='thu', days_of_week=[3]),
        ]
        repo.org_timezones.return_value = {ORG: 'America/Denver'}
        repo.expire_before.return_value = 4
        seen = []
        with patch.object(schedules, '_repo', return_value=repo), \
             patch.object(schedules, 'run_schedule',
                          side_effect=lambda s, today, tz: seen.append((s['id'], today))
                          or {'created': 1 if s['id'] == 'wed' and today.weekday() == 2 else 0}):
            out = schedules.run_due(now=datetime(2026, 9, 24, 5, 0, tzinfo=timezone.utc))
        assert ('wed', date(2026, 9, 23)) in seen
        assert out['created'] == 1 and out['expired'] == 4
        repo.expire_before.assert_called_once_with('2026-09-24T05:00:00+00:00')

    def test_a_schedule_that_already_ran_today_is_skipped(self):
        repo = Mock()
        repo.active_schedules.return_value = [_schedule(last_run_on='2026-09-23')]
        repo.org_timezones.return_value = {ORG: 'America/Denver'}
        repo.expire_before.return_value = 0
        with patch.object(schedules, '_repo', return_value=repo), \
             patch.object(schedules, 'run_schedule') as run:
            schedules.run_due(now=datetime(2026, 9, 23, 18, 0, tzinfo=timezone.utc))
        run.assert_not_called()

    def test_a_schedule_past_its_end_is_switched_off(self):
        repo = Mock()
        repo.active_schedules.return_value = [_schedule(end_date='2026-09-20')]
        repo.org_timezones.return_value = {}
        repo.expire_before.return_value = 0
        with patch.object(schedules, '_repo', return_value=repo), \
             patch.object(schedules, 'run_schedule') as run:
            schedules.run_due(now=datetime(2026, 9, 23, 18, 0, tzinfo=timezone.utc))
        run.assert_not_called()
        repo.update_schedule.assert_called_once_with('s1', {'active': False})

    def test_the_sweep_is_a_cron_route(self):
        from routes.sis import internal
        assert 'task-occurrences' in internal.CRON_SWEEPS


@pytest.mark.unit
class TestCreatingASchedule:
    def _create(self, data, today=date(2026, 9, 23)):
        repo = Mock()
        repo.insert_schedule.side_effect = lambda row: {**row, 'id': 's-new'}
        with patch.object(schedules, '_repo', return_value=repo), \
             patch.object(schedules.onboarding, 'assert_recipients_in_org'), \
             patch.object(schedules, 'run_schedule', return_value={'created': 2}) as run:
            out = schedules.create_schedule(ORG, 'office', data, today=today)
        return out, repo, run

    BASE = {'title': 'Lock the east doors', 'days_of_week': [0, 2, 4],
            'start_date': '2026-09-23', 'recipients': [{'id': 'u1', 'audience': 'staff'}]}

    def test_it_saves_and_makes_todays_occurrence_at_once(self):
        out, repo, run = self._create(dict(self.BASE))
        saved = repo.insert_schedule.call_args.args[0]
        assert saved['days_of_week'] == [0, 2, 4] and saved['active'] is True
        assert out['created_today'] == 2
        assert out['schedule']['days_label'] == 'Mon, Wed, Fri'
        run.assert_called_once()

    @pytest.mark.parametrize('bad, message', [
        ({'days_of_week': []}, 'Pick at least one day'),
        ({'days_of_week': [7]}, 'Pick at least one day'),
        ({'start_date': ''}, 'Pick a start date'),
        ({'end_date': '2026-09-01'}, 'The end date is before the start date'),
        ({'recipients': []}, 'Pick at least one person'),
        ({'title': ''}, 'The task needs a title'),
        ({'priority': 'eventually'}, 'Invalid priority'),
    ])
    def test_it_refuses_what_it_cannot_run(self, bad, message):
        out, repo, _ = self._create({**self.BASE, **bad})
        assert out == {'error': message}
        repo.insert_schedule.assert_not_called()

    def test_labels(self):
        assert schedules.describe_days(list(range(7))) == 'Every day'
        assert schedules.describe_days([0, 1, 2, 3, 4]) == 'Weekdays'


@pytest.mark.unit
class TestChangingASchedule:
    def _update(self, row, data):
        repo = Mock()
        repo.get_schedule.return_value = row
        repo.update_schedule.side_effect = lambda sid, fields: {**row, **fields}
        with patch.object(schedules, '_repo', return_value=repo), \
             patch.object(schedules, 'run_schedule') as run:
            out = schedules.update_schedule(ORG, 's1', data, today=date(2026, 9, 23))
        return out, repo, run

    def test_end_stops_it_as_of_today(self):
        out, repo, _ = self._update(_schedule(), {'end': True})
        fields = repo.update_schedule.call_args.args[1]
        assert fields['active'] is False and fields['end_date'] == '2026-09-23'

    def test_pause_and_resume(self):
        out, repo, run = self._update(_schedule(), {'active': False})
        assert repo.update_schedule.call_args.args[1]['active'] is False
        run.assert_not_called()
        out, repo, run = self._update(_schedule(active=False), {'active': True})
        # Resuming makes today's occurrence now rather than at the next run.
        run.assert_called_once()

    def test_another_schools_schedule_is_not_found(self):
        out, repo, _ = self._update(_schedule(organization_id=OTHER_ORG), {'active': False})
        assert out['status'] == 404
        repo.update_schedule.assert_not_called()


@pytest.mark.unit
class TestTheGrid:
    def test_dates_by_people_with_each_days_state(self):
        repo = Mock()
        repo.get_schedule.return_value = _schedule(days_of_week=[0, 2])
        repo.org_timezones.return_value = {ORG: 'America/Denver'}
        repo.list_for_schedule.return_value = [
            {'id': 'o1', 'user_id': 'u1', 'occurrence_date': '2026-09-21', 'status': 'complete',
             'items': [{'status': 'complete', 'submitted_at': '2026-09-21T15:00:00Z'}]},
            {'id': 'o2', 'user_id': 'u2', 'occurrence_date': '2026-09-21', 'status': 'expired',
             'items': [{'status': 'pending'}]},
        ]
        with patch.object(schedules, '_repo', return_value=repo), \
             patch('services.sis_tasks_service._names', return_value={'u1': 'Ann', 'u2': 'Ben'}):
            out = schedules.grid(ORG, 's1', since='2026-09-20', until='2026-09-23')
        assert out['dates'] == ['2026-09-21', '2026-09-23']
        assert [p['name'] for p in out['people']] == ['Ann', 'Ben']
        assert out['cells']['u1:2026-09-21'] == {
            'task_id': 'o1', 'status': 'done', 'finished_at': '2026-09-21T15:00:00Z'}
        assert out['cells']['u2:2026-09-21']['status'] == 'expired'


@pytest.mark.unit
class TestRepositoryCounts:
    def test_counts_are_exact_counts_on_open_tasks(self):
        from repositories.sis_task_repository import SisTaskRepository
        client = MagicMock()
        q = client.table.return_value
        for m in ('select', 'eq', 'in_', 'lt', 'limit'):
            getattr(q, m).return_value = q
        q.execute.return_value = Mock(count=12)
        repo = SisTaskRepository(client=client)
        assert repo.count_overdue(ORG, '2026-09-23') == 12
        assert q.select.call_args.kwargs == {'count': 'exact'}
        assert ('status', 'in_progress') in [c.args for c in q.eq.call_args_list]
        assert ('due_date', '2026-09-23') in [c.args for c in q.lt.call_args_list]
