"""
The unified task inbox.

Four sources — assigned requests, checklist items, documents sent for signature,
policies to acknowledge — become one list. The interesting behaviour is not the
merge; it is what the merge must not do: leak a guardian's items into a staff
inbox (a bug this codebase shipped once already, 2026-08-05), report a stale
acknowledgment as done, or go blank because one source failed.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_tasks_service as tasks


ORG = 'org-1'
ME = 'kate'


def _request(**over):
    base = {'id': 'f1', 'title': 'Printer in Room 3', 'form_type_label': 'Maintenance request',
            'status': 'submitted', 'priority': 'high', 'due_date': None,
            'submitted_by_name': 'Sam', 'created_at': '2026-08-01T00:00:00Z'}
    base.update(over)
    return base


def _item(**over):
    base = {'key': 'contract', 'title': 'Sign: Handbook', 'status': 'pending',
            'needs_signature': True, 'needs_document': False, 'needs_approval': False,
            'required': True, 'due_date': None, 'admin_notes': None, 'sign_docs': []}
    base.update(over)
    return base


def _assignment(items=None, kind='checklist', **over):
    base = {'id': 'a1', 'template_name': 'Employee onboarding', 'kind': kind,
            'created_at': '2026-08-02T00:00:00Z', 'items': items or [_item()]}
    base.update(over)
    return base


def _run(requests=None, assignments=None, resources=None, acks=None,
         audience='staff', include_done=False):
    """Run the aggregator with each source stubbed."""
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

    with patch.object(tasks, '_admin', return_value=admin), \
         patch.object(tasks.forms, 'list_assigned', return_value=requests or []), \
         patch.object(tasks.onboarding, 'list_assignments', return_value=assignments or []), \
         patch.object(tasks.sis_service, 'filter_role_visible', side_effect=lambda _u, rows: rows):
        return tasks.list_my_tasks(ORG, ME, audience=audience, include_done=include_done)


@pytest.mark.unit
class TestWhatLandsInTheInbox:

    def test_an_assigned_request_appears(self):
        out = _run(requests=[_request()])
        assert [t['title'] for t in out['tasks']] == ['Printer in Room 3']
        assert out['tasks'][0]['type'] == 'request'

    def test_a_request_links_back_to_its_own_page(self):
        """A request is a conversation with a status and comments — the inbox
        points at it rather than trying to reproduce it."""
        out = _run(requests=[_request(id='f9')])
        assert out['tasks'][0]['link'] == '/forms?submission=f9'

    def test_a_checklist_item_carries_the_pair_needed_to_complete_it(self):
        out = _run(assignments=[_assignment()])
        assert out['tasks'][0]['id'] == 'onb:a1:contract'

    def test_a_checklist_item_includes_attached_documents(self):
        out = _run(assignments=[_assignment(items=[
            _item(key='upload', needs_signature=False, needs_document=True,
                  documents=[{'path': 'doc1.pdf', 'filename': 'ID.pdf'}]),
        ])])
        assert out['tasks'][0]['documents'] == [{'path': 'doc1.pdf', 'filename': 'ID.pdf'}]

    def test_item_kinds_are_told_apart(self):
        out = _run(assignments=[_assignment(items=[
            _item(key='sign'),
            _item(key='upload', needs_signature=False, needs_document=True),
            _item(key='plain', needs_signature=False),
        ])])
        assert {t['id'].split(':')[-1]: t['type'] for t in out['tasks']} == {
            'sign': 'signature', 'upload': 'document_upload', 'plain': 'checklist_item'}

    def test_a_document_sent_for_signature_is_just_another_task(self):
        """From where the signer stands, a one-off send and a checklist item are
        the same thing to do — `kind` only matters to the office's roll-up."""
        out = _run(assignments=[_assignment(kind='signature_request')])
        assert out['tasks'][0]['type'] == 'signature'
        assert out['tasks'][0]['is_signature_request'] is True


@pytest.mark.unit
class TestStatusNormalisation:

    @pytest.mark.parametrize('native,expected', [
        ('submitted', 'todo'),
        ('under_review', 'in_progress'),
        ('in_progress', 'in_progress'),
        ('waiting', 'waiting_on_admin'),
        ('resolved', 'done'),
    ])
    def test_request_statuses_map_without_losing_the_original(self, native, expected):
        out = _run(requests=[_request(status=native)], include_done=True)
        assert out['tasks'][0]['status'] == expected
        assert out['tasks'][0]['native_status'] == native

    def test_a_finished_item_awaiting_approval_is_with_the_office(self):
        """Not 'done': the person has finished, but the task is not closed and
        saying so would tell them to stop watching for a rejection."""
        out = _run(assignments=[_assignment(items=[
            _item(status='complete', needs_approval=True)])], include_done=True)
        assert out['tasks'][0]['status'] == 'waiting_on_admin'

    def test_a_finished_item_needing_no_approval_is_done(self):
        out = _run(assignments=[_assignment(items=[_item(status='complete')])],
                   include_done=True)
        assert out['tasks'][0]['status'] == 'done'

    def test_a_rejected_item_comes_back_as_something_to_do(self):
        out = _run(assignments=[_assignment(items=[
            _item(status='rejected', admin_notes='Wrong form')])])
        assert out['tasks'][0]['status'] == 'todo'
        assert out['tasks'][0]['admin_notes'] == 'Wrong form'


@pytest.mark.unit
class TestAcknowledgments:

    RESOURCE = {'id': 'r1', 'title': 'Safeguarding policy', 'audience': 'staff',
                'requires_ack': True, 'version_date': '2026-08-01',
                'visible_to_roles': None, 'updated_at': '2026-08-01T00:00:00Z'}

    def test_an_unacknowledged_policy_is_a_task(self):
        out = _run(resources=[self.RESOURCE], acks=[])
        assert out['tasks'][0]['id'] == 'ack:r1'
        assert out['tasks'][0]['status'] == 'todo'

    def test_acknowledging_the_current_version_clears_it(self):
        out = _run(resources=[self.RESOURCE],
                   acks=[{'resource_id': 'r1', 'version_date': '2026-08-01',
                          'acknowledged_at': '2026-08-02T00:00:00Z'}])
        assert out['tasks'] == []

    def test_a_new_version_asks_again(self):
        """Re-versioning a policy is how the office asks everyone to read it
        again; an ack given for the old text must not answer for the new one."""
        out = _run(resources=[self.RESOURCE],
                   acks=[{'resource_id': 'r1', 'version_date': '2026-07-01',
                          'acknowledged_at': '2026-07-02T00:00:00Z'}])
        assert out['tasks'][0]['status'] == 'todo'

    def test_families_are_not_asked_to_acknowledge_staff_resources(self):
        out = _run(resources=[self.RESOURCE], audience='family')
        assert out['tasks'] == []


@pytest.mark.unit
class TestAudienceSeparation:

    def test_a_guardian_is_never_shown_assigned_requests(self):
        """Requests are assigned to staff. A guardian who is also on staff has a
        staff inbox for those; mixing them was the 2026-08-05 bug in the other
        direction."""
        out = _run(requests=[_request()], audience='family')
        assert out['tasks'] == []

    def test_the_audience_is_passed_down_to_the_checklist_source(self):
        with patch.object(tasks, '_admin', return_value=Mock()), \
             patch.object(tasks.forms, 'list_assigned', return_value=[]), \
             patch.object(tasks.onboarding, 'list_assignments', return_value=[]) as m:
            tasks.list_my_tasks(ORG, ME, audience='family')
        assert m.call_args.kwargs['audience'] == 'family'

    def test_an_unknown_audience_falls_back_to_staff(self):
        with patch.object(tasks, '_admin', return_value=Mock()), \
             patch.object(tasks.forms, 'list_assigned', return_value=[]), \
             patch.object(tasks.onboarding, 'list_assignments', return_value=[]) as m:
            tasks.list_my_tasks(ORG, ME, audience='nonsense')
        assert m.call_args.kwargs['audience'] == 'staff'

    def test_family_checklist_items_link_to_the_family_portal(self):
        out = _run(assignments=[_assignment()], audience='family')
        assert out['tasks'][0]['link'] == '/family/portal'


@pytest.mark.unit
class TestCountsAndOrdering:

    def test_done_is_counted_but_not_listed(self):
        out = _run(assignments=[_assignment(items=[
            _item(key='a'), _item(key='b', status='complete')])])
        assert out['counts']['done'] == 1
        assert [t['id'].split(':')[-1] for t in out['tasks']] == ['a']

    def test_show_completed_puts_them_back(self):
        out = _run(assignments=[_assignment(items=[
            _item(key='a'), _item(key='b', status='complete')])], include_done=True)
        assert len(out['tasks']) == 2

    def test_open_counts_everything_still_in_flight(self):
        out = _run(requests=[_request(status='waiting')],
                   assignments=[_assignment(items=[_item()])])
        assert out['counts']['open'] == 2

    def test_an_overdue_task_is_flagged_and_sorts_first(self):
        out = _run(assignments=[_assignment(items=[
            _item(key='later', due_date='2099-01-01'),
            _item(key='late', due_date='2000-01-01')])])
        assert out['tasks'][0]['id'].endswith('late')
        assert out['tasks'][0]['overdue'] is True
        assert out['counts']['overdue'] == 1

    def test_a_finished_task_is_never_overdue(self):
        out = _run(assignments=[_assignment(items=[
            _item(status='complete', due_date='2000-01-01')])], include_done=True)
        assert out['tasks'][0]['overdue'] is False


@pytest.mark.unit
class TestOneBrokenSourceDoesNotEmptyTheInbox:

    def test_a_failing_source_is_skipped_not_fatal(self):
        """Somebody who can't load their requests should still see the contract
        they have to sign — an inbox that renders nothing looks like an inbox
        with nothing in it."""
        admin = Mock()
        admin.table.side_effect = Exception('boom')
        with patch.object(tasks, '_admin', return_value=admin), \
             patch.object(tasks.forms, 'list_assigned', side_effect=Exception('boom')), \
             patch.object(tasks.onboarding, 'list_assignments',
                          return_value=[_assignment()]):
            out = tasks.list_my_tasks(ORG, ME)
        assert [t['type'] for t in out['tasks']] == ['signature']
