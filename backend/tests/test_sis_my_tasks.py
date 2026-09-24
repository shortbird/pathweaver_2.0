"""
One person's task list.

Every task the school assigns is one row of sis_onboarding_assignments, and the
list is one entry per task, its steps inside it (iCreate meeting 2026-09-23:
requests and checklists stopped being separate things). Policies to
acknowledge are the one other source. The interesting behaviour is what the
list must not do: leak a guardian's tasks into a staff list (a bug this
codebase shipped once already, 2026-08-05), report a stale acknowledgment as
done, call an expired daily duty "to do", or go blank because one source
failed.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_tasks_service as tasks


ORG = 'org-1'
ME = 'kate'


def _item(**over):
    base = {'key': 'contract', 'title': 'Sign: Handbook', 'status': 'pending',
            'needs_signature': True, 'needs_document': False, 'needs_approval': False,
            'required': True, 'due_date': None, 'admin_notes': None, 'sign_docs': []}
    base.update(over)
    return base


def _assignment(items=None, kind='checklist', **over):
    base = {'id': 'a1', 'template_name': 'Employee onboarding', 'kind': kind,
            'status': 'in_progress', 'audience': 'staff', 'assigned_by': 'boss',
            'created_at': '2026-08-02T00:00:00Z', 'items': items or [_item()]}
    base.update(over)
    return base


def _run(assignments=None, resources=None, acks=None, audience='staff',
         include_done=False, comment_counts=None, today='2026-08-10'):
    """Run the list with each source stubbed."""
    resources = resources or []
    acks = acks or []

    def _table(name):
        t = Mock()
        for chained in ('select', 'eq', 'in_', 'order'):
            getattr(t, chained).return_value = t
        t.execute.return_value = Mock(
            data=resources if name == 'org_resources' else acks)
        return t

    admin = Mock()
    admin.table.side_effect = _table
    repo = Mock()
    repo.comment_counts.return_value = comment_counts or {}

    with patch.object(tasks, '_admin', return_value=admin), \
         patch.object(tasks, '_repo', return_value=repo), \
         patch.object(tasks, '_names', return_value={'boss': 'Molly'}), \
         patch.object(tasks, '_today', return_value=today), \
         patch.object(tasks.onboarding, 'list_assignments',
                      return_value=assignments or []) as listed, \
         patch.object(tasks.sis_service, 'filter_role_visible', side_effect=lambda _u, rows: rows):
        out = tasks.list_my_tasks(ORG, ME, audience=audience, include_done=include_done)
    out['_listed'] = listed
    return out


@pytest.mark.unit
class TestOneEntryPerTask:

    def test_a_multi_step_task_is_one_entry_with_its_steps(self):
        out = _run(assignments=[_assignment(items=[_item(key='a'), _item(key='b')])])
        assert len(out['tasks']) == 1
        t = out['tasks'][0]
        assert t['id'] == 'a1'
        assert [i['key'] for i in t['items']] == ['a', 'b']
        assert (t['done_count'], t['total_count']) == (0, 2)
        assert t['assigned_by_name'] == 'Molly'

    def test_a_task_links_to_its_own_page(self):
        out = _run(assignments=[_assignment(id='a9')])
        assert out['tasks'][0]['link'] == '/tasks?task=a9'

    def test_family_and_student_tasks_link_to_their_to_do(self):
        out = _run(assignments=[_assignment(id='a9', audience='family')], audience='family')
        assert out['tasks'][0]['link'] == '/family/forms?task=a9'
        out = _run(assignments=[_assignment(id='a9', audience='student')], audience='student')
        assert out['tasks'][0]['link'] == '/school?task=a9'

    def test_a_document_sent_for_signature_is_just_another_task(self):
        out = _run(assignments=[_assignment(kind='signature_request')])
        assert out['tasks'][0]['type'] == 'signature'

    def test_a_reply_task_carries_its_thread_link(self):
        """A task made from a message links back to the thread it answers
        (the messaging stream's single-thread view)."""
        out = _run(assignments=[_assignment(action='reply', source_conversation_id='c1',
                                            source_message_id='m1')])
        t = out['tasks'][0]
        assert t['action'] == 'reply'
        assert t['thread_link'] == '/inbox?tab=school&conversation=c1'
        out = _run(assignments=[_assignment(action='reply', source_group_id='g1')])
        assert out['tasks'][0]['thread_link'] == '/inbox?tab=school&group=g1'

    def test_comment_counts_ride_along(self):
        out = _run(assignments=[_assignment()], comment_counts={'a1': 3})
        assert out['tasks'][0]['comment_count'] == 3


@pytest.mark.unit
class TestStatus:
    def test_nothing_done_is_todo_and_something_done_is_in_progress(self):
        out = _run(assignments=[
            _assignment(id='a', items=[_item(key='x'), _item(key='y')]),
            _assignment(id='b', items=[_item(key='x', status='complete'), _item(key='y')]),
        ])
        assert {t['id']: t['status'] for t in out['tasks']} == {'a': 'todo', 'b': 'in_progress'}

    def test_a_finished_step_awaiting_approval_is_with_the_office(self):
        out = _run(assignments=[_assignment(
            status='complete', items=[_item(status='complete', needs_approval=True)])])
        assert out['tasks'][0]['status'] == 'waiting_on_admin'

    def test_a_finished_task_needing_no_approval_is_done(self):
        out = _run(assignments=[_assignment(status='complete',
                                            items=[_item(status='complete')])],
                   include_done=True)
        assert out['tasks'][0]['status'] == 'done'

    def test_a_rejected_step_comes_back_as_something_to_do(self):
        out = _run(assignments=[_assignment(items=[_item(status='rejected'),
                                                   _item(key='b', status='complete')])])
        assert out['tasks'][0]['status'] == 'todo'

    def test_an_expired_occurrence_is_expired_not_todo(self):
        """A daily duty nobody did on its day did not happen; it is not still
        owed (owner's answer 5, 2026-09-23)."""
        out = _run(assignments=[_assignment(status='expired', schedule_id='s1')],
                   include_done=True)
        assert out['tasks'][0]['status'] == 'expired'
        out = _run(assignments=[_assignment(status='expired', schedule_id='s1')])
        assert out['tasks'] == []
        assert out['counts']['open'] == 0


@pytest.mark.unit
class TestAcknowledgments:
    def _resource(self, **over):
        base = {'id': 'r1', 'title': 'Handbook', 'audience': 'staff', 'requires_ack': True,
                'version_date': '2026-08-01', 'updated_at': '2026-08-01T00:00:00Z'}
        base.update(over)
        return base

    def test_an_unacknowledged_policy_is_a_task(self):
        out = _run(resources=[self._resource()])
        assert out['tasks'][0]['type'] == 'ack'
        assert out['tasks'][0]['status'] == 'todo'

    def test_acknowledging_the_current_version_clears_it(self):
        out = _run(resources=[self._resource()],
                   acks=[{'resource_id': 'r1', 'version_date': '2026-08-01'}])
        assert out['tasks'] == []

    def test_a_new_version_asks_again(self):
        out = _run(resources=[self._resource(version_date='2026-08-05')],
                   acks=[{'resource_id': 'r1', 'version_date': '2026-08-01'}])
        assert [t['type'] for t in out['tasks']] == ['ack']

    def test_families_are_not_asked_to_acknowledge_staff_resources(self):
        out = _run(resources=[self._resource()], audience='family')
        assert out['tasks'] == []


@pytest.mark.unit
class TestAudienceSeparation:
    def test_the_audience_is_passed_down(self):
        out = _run(audience='family')
        assert out['_listed'].call_args.kwargs['audience'] == 'family'

    def test_a_student_list_is_the_student_audience(self):
        out = _run(audience='student')
        assert out['_listed'].call_args.kwargs['audience'] == 'student'

    def test_an_unknown_audience_falls_back_to_staff(self):
        out = _run(audience='hacker')
        assert out['_listed'].call_args.kwargs['audience'] == 'staff'


@pytest.mark.unit
class TestCountsAndOrdering:
    def test_done_is_counted_but_not_listed(self):
        out = _run(assignments=[_assignment(status='complete', items=[_item(status='complete')])])
        assert out['tasks'] == []
        assert out['counts']['done'] == 1

    def test_show_completed_puts_them_back(self):
        out = _run(assignments=[_assignment(status='complete', items=[_item(status='complete')])],
                   include_done=True)
        assert len(out['tasks']) == 1

    def test_open_counts_everything_still_in_flight(self):
        out = _run(assignments=[
            _assignment(id='a'),
            _assignment(id='b', status='complete',
                        items=[_item(status='complete', needs_approval=True)]),
        ])
        assert out['counts']['open'] == 2

    def test_an_overdue_task_is_flagged_and_sorts_first(self):
        out = _run(assignments=[
            _assignment(id='later', created_at='2026-08-01T00:00:00Z'),
            _assignment(id='late', due_date='2026-08-05', created_at='2026-08-09T00:00:00Z'),
        ])
        assert [t['id'] for t in out['tasks']] == ['late', 'later']
        assert out['tasks'][0]['overdue'] is True
        assert out['counts']['overdue'] == 1

    def test_urgent_sorts_before_normal(self):
        out = _run(assignments=[
            _assignment(id='normal', created_at='2026-08-01T00:00:00Z'),
            _assignment(id='urgent', priority='urgent', created_at='2026-08-09T00:00:00Z'),
        ])
        assert [t['id'] for t in out['tasks']] == ['urgent', 'normal']

    def test_a_step_due_date_counts_when_the_task_has_none(self):
        out = _run(assignments=[_assignment(items=[_item(due_date='2026-08-01')])])
        assert out['tasks'][0]['due_date'] == '2026-08-01'
        assert out['tasks'][0]['overdue'] is True

    def test_a_finished_task_is_never_overdue(self):
        out = _run(assignments=[_assignment(status='complete', due_date='2026-08-01',
                                            items=[_item(status='complete')])],
                   include_done=True)
        assert out['tasks'][0]['overdue'] is False


@pytest.mark.unit
class TestOneBrokenSourceDoesNotEmptyTheList:
    def test_a_failing_task_read_still_shows_acknowledgments(self):
        with patch.object(tasks.onboarding, 'list_assignments', side_effect=RuntimeError('down')):
            admin = Mock()

            def _table(name):
                t = Mock()
                for chained in ('select', 'eq', 'in_', 'order'):
                    getattr(t, chained).return_value = t
                t.execute.return_value = Mock(data=[{
                    'id': 'r1', 'title': 'Handbook', 'audience': 'staff',
                    'version_date': '2026-08-01'}] if name == 'org_resources' else [])
                return t
            admin.table.side_effect = _table
            with patch.object(tasks, '_admin', return_value=admin), \
                 patch.object(tasks.sis_service, 'filter_role_visible',
                              side_effect=lambda _u, rows: rows):
                out = tasks.list_my_tasks(ORG, ME)
        assert [t['type'] for t in out['tasks']] == ['ack']
