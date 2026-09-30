"""
Changing a task after it was sent: edit it, move it to someone else, take the
whole send back.

Three tickets, 2026-09-30:

    6eeaef78  "I would like to be able to edit tasks."
    35d879db  "Tasks can't be reassigned to someone else."
    a063cbd9  "Can't delete tasks"  (a campus coordinator)

Pinned here: all three are ADMIN_ROLES (org admin AND campus coordinator), a
teacher is refused with nothing written, nothing reaches across schools, and
the one judgment call -- what an edit does to the progress people already
made on its steps -- is written down as tests (sis_tasks_service.merge_steps).
"""

from unittest.mock import MagicMock, Mock, patch

import pytest

from services import sis_onboarding_service as onboarding
from services import sis_tasks_service as tasks

ORG = 'org-1'
OTHER_ORG = 'org-2'
BATCH = '3f1b6f1e-1111-4111-8111-111111111111'
KEY = f'batch:{BATCH}'


def _step(key, title, status='pending', **over):
    base = {'key': key, 'title': title, 'description': None, 'required': True,
            'needs_document': False, 'needs_signature': False, 'needs_approval': False,
            'due_date': None, 'link': None, 'document_id': None, 'status': status,
            'documents': [], 'document_url': None, 'submitted_at': None,
            'approved_by': None, 'approved_at': None, 'admin_notes': None, 'signature': None}
    base.update(over)
    return base


def _row(**over):
    base = {'id': 't1', 'organization_id': ORG, 'user_id': 'kate', 'assigned_by': 'office',
            'audience': 'staff', 'kind': 'task', 'status': 'in_progress',
            'template_name': 'New teacher onboarding', 'batch_id': BATCH,
            'template_id': None, 'schedule_id': None, 'due_date': '2026-10-01',
            'blocks_access': False, 'description': 'Before your first day',
            'created_at': '2026-09-20T00:00:00Z',
            'items': [_step('badge', 'Pick up your badge', 'complete',
                            submitted_at='2026-09-21T10:00:00Z', due_date='2026-10-01'),
                      _step('w4', 'W-4', 'pending', needs_document=True,
                            due_date='2026-10-01')]}
    base.update(over)
    return base


# ── What an edit does to progress ────────────────────────────────────────────

@pytest.mark.unit
class TestStepProgressOnEdit:
    """6eeaef78, "I would like to be able to edit tasks." The office edits to
    correct a task, so work people already did survives the correction."""

    def _edited(self, **badge_over):
        return [{**_step('badge', 'Pick up your badge'), **badge_over},
                _step('w4', 'W-4', needs_document=True)]

    def test_rewording_a_step_keeps_the_progress_on_it(self):
        out = tasks.merge_steps(_row()['items'], self._edited(title='Collect your badge'),
                                '2026-10-01', '2026-10-01')
        badge = out[0]
        assert badge['title'] == 'Collect your badge'
        assert badge['status'] == 'complete'
        assert badge['submitted_at'] == '2026-09-21T10:00:00Z'

    def test_making_a_step_ask_for_more_starts_it_over_but_keeps_the_files(self):
        """Done was an answer to a smaller question."""
        items = [_step('badge', 'Pick up your badge', 'approved', approved_by='office',
                       documents=[{'path': 'org-1/kate/badge.png'}])]
        edited = [{**_step('badge', 'Pick up your badge'), 'needs_signature': True}]
        out = tasks.merge_steps(items, edited, None, None)
        assert out[0]['status'] == 'pending'
        assert out[0]['approved_by'] is None
        assert out[0]['needs_signature'] is True
        assert out[0]['documents'] == [{'path': 'org-1/kate/badge.png'}]

    def test_asking_for_less_keeps_the_progress(self):
        items = [_step('w4', 'W-4', 'complete', needs_document=True, needs_approval=True)]
        edited = [_step('w4', 'W-4', needs_document=True, required=False)]
        out = tasks.merge_steps(items, edited, None, None)
        assert out[0]['status'] == 'complete'
        assert out[0]['needs_approval'] is False and out[0]['required'] is False

    def test_a_new_step_arrives_pending(self):
        edited = self._edited() + [{'key': 'new-1', 'title': 'Meet your mentor'}]
        out = tasks.merge_steps(_row()['items'], edited, '2026-10-01', '2026-10-01')
        assert out[2]['title'] == 'Meet your mentor' and out[2]['status'] == 'pending'

    def test_a_removed_untouched_step_goes_and_one_with_work_stays(self):
        items = [_step('badge', 'Badge', 'complete'), _step('w4', 'W-4'),
                 _step('i9', 'I-9', documents=[{'path': 'org-1/kate/i9.pdf'}])]
        out = tasks.merge_steps(items, [_step('new', 'Only this')], None, None)
        assert [i['key'] for i in out] == ['new', 'badge', 'i9']

    def test_a_step_on_the_tasks_due_date_follows_the_new_one(self):
        items = [_step('a', 'A', due_date='2026-10-01'), _step('b', 'B', due_date='2026-11-15')]
        edited = [_step('a', 'A', due_date='2026-10-01'), _step('b', 'B', due_date='2026-11-15')]
        out = tasks.merge_steps(items, edited, '2026-10-01', '2026-10-08')
        assert [i['due_date'] for i in out] == ['2026-10-08', '2026-11-15']

    def test_a_bound_document_stays_the_persons_own(self):
        items = [_step('sign', 'Sign your contract', document_id='kate-contract')]
        edited = [{**_step('sign', 'Sign your contract'), 'document_id': 'someone-else'}]
        assert tasks.merge_steps(items, edited, None, None)[0]['document_id'] == 'kate-contract'


def _edit(rows, data):
    repo = Mock()
    repo.list_batch.return_value = rows
    with patch.object(tasks, '_repo', return_value=repo), \
         patch.object(onboarding, '_save_items', side_effect=lambda row, items, **kw: {
             **row, 'items': items, **kw}) as save:
        out = tasks.edit_batch(ORG, KEY, data)
    return out, repo, save


@pytest.mark.unit
class TestEditBatch:
    """6eeaef78, "I would like to be able to edit tasks." """

    def test_it_changes_everyone_on_the_card(self):
        rows = [_row(), _row(id='t2', user_id='sam', items=[
            _step('badge', 'Pick up your badge', due_date='2026-10-01'),
            _step('w4', 'W-4', needs_document=True, due_date='2026-10-01')])]
        out, repo, save = _edit(rows, {
            'title': 'Onboarding', 'description': 'Read first', 'due_date': '2026-10-08',
            'items': [_step('badge', 'Collect your badge'),
                      _step('w4', 'W-4', needs_document=True)]})
        assert out == {'updated': 2}
        repo.list_batch.assert_called_once_with(ORG, KEY)
        assert save.call_count == 2
        kate = save.call_args_list[0]
        assert kate.kwargs['extra'] == {'template_name': 'Onboarding', 'due_date': '2026-10-08'}
        assert kate.kwargs['description'] == 'Read first'
        assert kate.kwargs['update_description'] is True
        items = kate.args[1]
        assert items[0]['title'] == 'Collect your badge' and items[0]['status'] == 'complete'
        assert [i['due_date'] for i in items] == ['2026-10-08', '2026-10-08']

    def test_a_field_left_out_is_left_alone(self):
        out, _, save = _edit([_row()], {'priority': 'high'})
        assert save.call_args.kwargs['extra'] == {'priority': 'high'}
        assert save.call_args.kwargs['update_description'] is False
        assert save.call_args.args[1] == _row()['items']

    @pytest.mark.parametrize('bad, message', [
        ({'title': '  '}, 'The task needs a title'),
        ({'items': []}, 'Add at least one step'),
        ({'items': [{'title': ''}]}, 'Every step needs a title'),
        ({'priority': 'eventually'}, 'Invalid priority'),
        ({'due_date': 'next week'}, 'Invalid due date'),
    ])
    def test_it_refuses_what_it_cannot_save_and_writes_nothing(self, bad, message):
        out, _, save = _edit([_row()], bad)
        assert out == {'error': message, 'status': 400}
        save.assert_not_called()

    def test_a_card_from_another_school_is_not_found(self):
        """list_batch is org-scoped (TestRepository), so another school's
        card is an empty one here."""
        out, _, save = _edit([], {'title': 'Mine now'})
        assert out['status'] == 404
        save.assert_not_called()


# ── Reassign ─────────────────────────────────────────────────────────────────

def _reassign(row, target, *, batch=None, in_org=True):
    repo = Mock()
    repo.get.return_value = row
    repo.list_batch.return_value = batch if batch is not None else [row]
    repo.insert_task.side_effect = lambda r: {**r, 'id': 't-new'}
    in_org_check = Mock(side_effect=None if in_org else onboarding.RecipientNotInOrg(
        'That person is not part of this organization'))
    with patch.object(tasks, '_repo', return_value=repo), \
         patch.object(tasks, '_names', return_value={}), \
         patch.object(onboarding, 'assert_recipients_in_org', in_org_check), \
         patch.object(onboarding.sis_access_gate, 'clear_cache') as gate, \
         patch.object(onboarding, '_notify_assigned') as notify:
        out = tasks.reassign_task(ORG, 'coordinator', 't1', target)
    return out, repo, notify, gate


@pytest.mark.unit
class TestReassign:
    """35d879db, "Tasks can't be reassigned to someone else." """

    def test_the_new_person_gets_a_fresh_copy_on_the_same_card(self):
        row = _row(items=[_step('sign', 'Sign your contract', 'complete',
                                needs_signature=True, document_id='kate-contract',
                                signature={'name': 'Kate'}, sign_docs=[{'id': 'd'}])])
        out, repo, notify, _ = _reassign(row, 'sam')
        new = repo.insert_task.call_args.args[0]
        assert new['user_id'] == 'sam' and new['batch_id'] == BATCH
        assert new['assigned_by'] == 'office'  # still the send of whoever sent it
        assert new['status'] == 'in_progress' and 'id' not in new
        step = new['items'][0]
        assert step['status'] == 'pending' and step['signature'] is None
        # Kate's own contract is not Sam's to sign.
        assert step['document_id'] is None and 'sign_docs' not in step
        repo.delete_tasks.assert_called_once_with(ORG, ['t1'])
        notify.assert_called_once()
        assert notify.call_args.args[1]['user_id'] == 'sam'
        assert out['task']['user_id'] == 'sam' and out['from_user_id'] == 'kate'

    def test_someone_outside_the_school_is_refused(self):
        out, repo, notify, _ = _reassign(_row(), 'stranger', in_org=False)
        assert out['status'] == 400
        repo.insert_task.assert_not_called()
        repo.delete_tasks.assert_not_called()
        notify.assert_not_called()

    def test_someone_who_already_has_it_on_this_card_is_refused(self):
        batch = [_row(), _row(id='t2', user_id='sam')]
        out, repo, _, _ = _reassign(_row(), 'sam', batch=batch)
        assert out == {'error': 'That person already has this task', 'status': 409}
        repo.list_batch.assert_called_once_with(ORG, KEY)
        repo.insert_task.assert_not_called()
        repo.delete_tasks.assert_not_called()

    def test_a_task_from_another_school_is_not_found(self):
        out, repo, _, _ = _reassign(_row(organization_id=OTHER_ORG), 'sam')
        assert out['status'] == 404
        repo.insert_task.assert_not_called()

    def test_the_same_person_and_nobody_are_refused(self):
        assert _reassign(_row(), 'kate')[0]['status'] == 400
        assert _reassign(_row(), '')[0]['status'] == 400

    def test_a_repeating_occurrence_is_changed_from_its_schedule(self):
        out, repo, _, _ = _reassign(_row(schedule_id='s1'), 'sam')
        assert out['status'] == 400
        repo.insert_task.assert_not_called()

    def test_a_hold_moves_with_the_task(self):
        _, _, _, gate = _reassign(_row(audience='family', blocks_access=True), 'fam2')
        assert {c.args[0] for c in gate.call_args_list} == {'kate', 'fam2'}

    def test_the_old_row_stays_if_the_new_one_could_not_be_written(self):
        repo = Mock()
        repo.get.return_value = _row()
        repo.list_batch.return_value = [_row()]
        repo.insert_task.return_value = None
        with patch.object(tasks, '_repo', return_value=repo), \
             patch.object(onboarding, 'assert_recipients_in_org'):
            out = tasks.reassign_task(ORG, 'coordinator', 't1', 'sam')
        assert out['status'] == 500
        repo.delete_tasks.assert_not_called()


# ── Delete a whole card ──────────────────────────────────────────────────────

@pytest.mark.unit
class TestDeleteBatch:
    """a063cbd9, "Can't delete tasks." """

    def _delete(self, rows):
        repo = Mock()
        repo.list_batch.return_value = rows
        repo.delete_tasks.return_value = len(rows)
        with patch.object(tasks, '_repo', return_value=repo), \
             patch.object(onboarding.sis_access_gate, 'clear_cache') as gate:
            out = tasks.delete_batch(ORG, KEY)
        return out, repo, gate

    def test_it_deletes_everyone_on_the_card_and_keeps_their_files(self):
        rows = [_row(items=[_step('w4', 'W-4', 'complete', documents=[{'path': 'p'}])]),
                _row(id='t2', user_id='sam', audience='family', blocks_access=True)]
        out, repo, gate = self._delete(rows)
        repo.delete_tasks.assert_called_once_with(ORG, ['t1', 't2'])
        assert out == {'deleted': 2, 'documents_kept': 1}
        # Taking the paperwork back takes the hold with it.
        gate.assert_called_once_with('sam')

    def test_a_card_from_another_school_is_not_found(self):
        out, repo, _ = self._delete([])
        assert out['status'] == 404
        repo.delete_tasks.assert_not_called()


# ── The repository: which rows a card is ─────────────────────────────────────

def _client():
    client = MagicMock()
    q = client.table.return_value
    for m in ('select', 'eq', 'in_', 'is_', 'delete', 'range', 'order', 'limit'):
        getattr(q, m).return_value = q
    q.execute.return_value = Mock(data=[{'id': 't1'}])
    return client, q


@pytest.mark.unit
class TestRepository:
    def test_a_card_is_read_in_the_callers_school_only(self):
        from repositories.sis_task_repository import SisTaskRepository
        client, q = _client()
        SisTaskRepository(client=client).list_batch(ORG, KEY)
        eqs = [c.args for c in q.eq.call_args_list]
        assert ('organization_id', ORG) in eqs and ('batch_id', BATCH) in eqs
        # Never a recurring occurrence: those are not cards.
        assert ('schedule_id', 'null') in [c.args for c in q.is_.call_args_list]

    def test_an_older_template_card_is_its_template_rows_without_a_batch(self):
        from repositories.sis_task_repository import SisTaskRepository
        client, q = _client()
        SisTaskRepository(client=client).list_batch(ORG, f'template:{BATCH}')
        assert ('template_id', BATCH) in [c.args for c in q.eq.call_args_list]
        assert ('batch_id', 'null') in [c.args for c in q.is_.call_args_list]

    @pytest.mark.parametrize('key', ['', 'batch:', 'batch:not-a-uuid', f'people:{BATCH}'])
    def test_an_unreadable_key_is_an_empty_card_without_a_query(self, key):
        from repositories.sis_task_repository import SisTaskRepository
        client, _ = _client()
        assert SisTaskRepository(client=client).list_batch(ORG, key) == []
        client.table.assert_not_called()

    def test_a_delete_is_scoped_to_the_school_in_the_statement(self):
        from repositories.sis_task_repository import SisTaskRepository
        client, q = _client()
        SisTaskRepository(client=client).delete_tasks(ORG, ['t1'])
        assert ('organization_id', ORG) in [c.args for c in q.eq.call_args_list]


# ── The routes: who may ──────────────────────────────────────────────────────

def _role_client(role, org_role=None):
    """An admin client that answers require_role's users read."""
    admin = Mock()
    table = Mock()
    admin.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{
        'role': role, 'org_role': org_role, 'org_roles': [org_role] if org_role else None}])
    return admin


ADMINS = [('org_managed', 'org_admin'), ('org_managed', 'campus_coordinator')]
NOT_ADMINS = [('org_managed', 'advisor'), ('student', None), ('parent', None)]

CALLS = {
    'edit': ('patch', f'/api/sis/tasks/batches/{KEY}', {'title': 'Fixed typo'},
             'edit_batch', {'updated': 3}),
    'delete': ('delete', f'/api/sis/tasks/batches/{KEY}', None,
               'delete_batch', {'deleted': 3, 'documents_kept': 0}),
    'reassign': ('post', '/api/sis/tasks/t1/reassign', {'user_id': 'sam'},
                 'reassign_task', {'task': {'id': 't-new'}}),
}


def _call(client, headers, which, role, org_role, result=None):
    method, url, body, service_fn, ok = CALLS[which]
    with patch('database.get_supabase_admin_client', return_value=_role_client(role, org_role)), \
         patch('modules.gate.check_module', return_value=None), \
         patch('services.sis_service.resolve_org_id', return_value=ORG), \
         patch.object(tasks, service_fn, return_value=result or ok) as svc:
        kwargs = {'headers': headers}
        if body is not None:
            kwargs['json'] = body
        resp = getattr(client, method)(url, **kwargs)
    return resp, svc


@pytest.mark.unit
class TestWhoMayChangeASentTask:
    """6eeaef78 / 35d879db / a063cbd9. a063cbd9 came from a campus
    coordinator, so a coordinator being let in is the point, not a detail."""

    @pytest.mark.parametrize('which', list(CALLS))
    @pytest.mark.parametrize('role, org_role', ADMINS)
    def test_an_org_admin_and_a_coordinator_may(self, client, auth_headers, mock_verify_token,
                                                which, role, org_role):
        resp, svc = _call(client, auth_headers, which, role, org_role)
        assert resp.status_code == 200, resp.get_json()
        svc.assert_called_once()
        assert svc.call_args.args[0] == ORG  # always the caller's own school

    @pytest.mark.parametrize('which', list(CALLS))
    @pytest.mark.parametrize('role, org_role', NOT_ADMINS)
    def test_anyone_else_is_refused_and_nothing_is_written(self, client, auth_headers,
                                                          mock_verify_token, which, role, org_role):
        resp, svc = _call(client, auth_headers, which, role, org_role)
        assert resp.status_code == 403
        svc.assert_not_called()

    def test_the_route_hands_the_card_key_and_body_through(self, client, auth_headers,
                                                         mock_verify_token):
        _, svc = _call(client, auth_headers, 'edit', 'org_managed', 'org_admin')
        assert svc.call_args.args == (ORG, KEY, {'title': 'Fixed typo'})
        _, svc = _call(client, auth_headers, 'reassign', 'org_managed', 'campus_coordinator')
        assert svc.call_args.args == (ORG, 'test-user-123', 't1', 'sam')

    @pytest.mark.parametrize('which', list(CALLS))
    def test_a_service_refusal_is_the_response(self, client, auth_headers, mock_verify_token,
                                               which):
        resp, _ = _call(client, auth_headers, which, 'org_managed', 'org_admin',
                        result={'error': 'Task not found', 'status': 404})
        assert resp.status_code == 404
        assert resp.get_json() == {'success': False, 'error': 'Task not found'}


@pytest.mark.unit
class TestCrossSchoolThroughTheRoute:
    """The service itself, behind the route, for an id from another school."""

    def _through(self, client, headers, method, url, body, repo):
        with patch('database.get_supabase_admin_client',
                   return_value=_role_client('org_managed', 'org_admin')), \
             patch('modules.gate.check_module', return_value=None), \
             patch('services.sis_service.resolve_org_id', return_value=ORG), \
             patch.object(tasks, '_repo', return_value=repo), \
             patch.object(onboarding, '_save_items') as save:
            kwargs = {'headers': headers}
            if body is not None:
                kwargs['json'] = body
            resp = getattr(client, method)(url, **kwargs)
        return resp, save

    def test_reassigning_another_schools_task_is_not_found(self, client, auth_headers,
                                                          mock_verify_token):
        repo = Mock()
        repo.get.return_value = _row(organization_id=OTHER_ORG)
        resp, _ = self._through(client, auth_headers, 'post', '/api/sis/tasks/t1/reassign',
                                {'user_id': 'sam'}, repo)
        assert resp.status_code == 404
        repo.insert_task.assert_not_called()
        repo.delete_tasks.assert_not_called()

    def test_editing_or_deleting_another_schools_card_is_not_found(self, client, auth_headers,
                                                                  mock_verify_token):
        repo = Mock()
        repo.list_batch.return_value = []
        resp, save = self._through(client, auth_headers, 'patch',
                                   f'/api/sis/tasks/batches/{KEY}', {'title': 'x'}, repo)
        assert resp.status_code == 404
        save.assert_not_called()
        resp, _ = self._through(client, auth_headers, 'delete',
                                f'/api/sis/tasks/batches/{KEY}', None, repo)
        assert resp.status_code == 404
        repo.delete_tasks.assert_not_called()
        assert all(c.args[0] == ORG for c in repo.list_batch.call_args_list)
