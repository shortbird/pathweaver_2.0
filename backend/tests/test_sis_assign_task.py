"""
assign_task -- the one door every task goes through.

An admin types what needs doing and picks who owes it; a saved template, a
recurring schedule's daily occurrence and the school inbox's "Make a task" all
call the same function (iCreate meeting 2026-09-23). Underneath it is one row
of sis_onboarding_assignments per person, sharing a batch_id per send. These
tests pin that record, because the inbox, the Assigned view, the signature
hold and the messaging stream all read it without ever calling this function.
"""

from unittest.mock import Mock, patch

from services import sis_onboarding_service as onboarding


ORG = 'org-1'
ADMIN = 'admin-1'


def _run(title='Turn in your roster', user_ids=('kate',), recipients_ok=True,
         template=None, held=None, **kwargs):
    """Run assign_task with the DB stubbed; return (result, inserted_rows, notify)."""
    inserted = []

    def _table(name):
        t = Mock()
        for meth in ('select', 'eq', 'in_', 'order', 'limit'):
            getattr(t, meth).return_value = t
        if name == 'sis_onboarding_templates':
            t.execute.return_value = Mock(data=[template] if template else [])
        else:
            t.execute.return_value = Mock(data=[held] if held else [])

        def _insert(row):
            inserted.append(row)
            ins = Mock()
            ins.execute.return_value = Mock(data=[{**row, 'id': f'task-{len(inserted)}'}])
            return ins
        t.insert.side_effect = _insert
        return t

    admin = Mock()
    admin.table.side_effect = _table

    check = (Mock() if recipients_ok
             else Mock(side_effect=onboarding.RecipientNotInOrg('That person is not part of this organization')))

    with patch.object(onboarding, '_admin', return_value=admin), \
         patch.object(onboarding, 'assert_recipients_in_org', check), \
         patch.object(onboarding, 'email_assignment') as email, \
         patch.object(onboarding.sis_access_gate, 'clear_cache'), \
         patch.object(onboarding.sis_notifications, 'notify') as notify:
        result = onboarding.assign_task(ORG, ADMIN, list(user_ids), title, **kwargs)
    notify.email = email
    return result, inserted, notify


def test_task_is_a_single_item_assignment_with_no_template():
    result, rows, _ = _run(description='By Friday, to the front office')
    assert result['assigned'] == 1 and result['errors'] == []
    row = rows[0]
    assert row['template_id'] is None
    assert row['kind'] == 'task'
    assert row['template_name'] == 'Turn in your roster'
    assert row['organization_id'] == ORG and row['user_id'] == 'kate'
    assert row['assigned_by'] == ADMIN
    assert len(row['items']) == 1
    item = row['items'][0]
    assert item['title'] == 'Turn in your roster'
    assert item['description'] == 'By Friday, to the front office'
    assert item['status'] == 'pending'
    # A plain tick completes it: no document, signature or approval demanded.
    assert not item['needs_document'] and not item['needs_signature'] and not item['needs_approval']
    # A one-off task never gates the portal.
    assert row['blocks_access'] is False


def test_one_send_is_one_batch():
    """The Assigned view counts people per batch; every row of a send shares
    the batch_id the call returns."""
    result, rows, _ = _run(user_ids=['kate', 'sam'])
    assert result['batch_id']
    assert {r['batch_id'] for r in rows} == {result['batch_id']}
    assert [t['id'] for t in result['tasks']] == ['task-1', 'task-2']


def test_each_recipient_gets_their_own_row_and_notification():
    result, rows, notify = _run(user_ids=['kate', 'sam', 'kate'])  # dupe collapsed
    assert result['assigned'] == 2
    assert [r['user_id'] for r in rows] == ['kate', 'sam']
    assert notify.call_count == 2
    # Staff are pointed at their task, on the page where they work it.
    assert notify.call_args.kwargs['link'] == '/tasks?task=task-2'


def test_a_staff_assignee_is_emailed_and_a_family_is_not():
    """"When I get assigned a task, can I get an email?" (iCreate a6d09acd) --
    the email lived on the request queue until requests became tasks."""
    _, _, notify = _run(user_ids=['kate'])
    notify.email.assert_called_once_with('kate', ORG, 'Turn in your roster', None)
    _, _, notify = _run(user_ids=['pat'], audience='family')
    notify.email.assert_not_called()


def test_family_and_student_tasks_point_at_their_own_to_do():
    _, rows, notify = _run(audience='family')
    assert rows[0]['audience'] == 'family'
    assert notify.call_args.kwargs['link'] == '/family/forms?task=task-1'
    _, rows, notify = _run(audience='student')
    assert rows[0]['audience'] == 'student'
    assert notify.call_args.kwargs['link'] == '/school?task=task-1'


def test_one_send_can_mix_audiences():
    """Staff, families and students in one Assign: each row lands on the page
    its own audience works on."""
    _, rows, _ = _run(user_ids=[{'id': 'kate', 'audience': 'staff'},
                                {'id': 'pat', 'audience': 'family'},
                                {'id': 'sam', 'audience': 'student'}])
    assert [(r['user_id'], r['audience']) for r in rows] == [
        ('kate', 'staff'), ('pat', 'family'), ('sam', 'student')]
    assert len({r['batch_id'] for r in rows}) == 1


def test_steps_keep_every_ability_a_checklist_had():
    """Checklists became multi-step tasks and kept their abilities: an upload,
    a typed signature and office approval, per step."""
    result, rows, _ = _run(title='Field trip prep', items=[
        {'title': 'Collect permission slips', 'needs_document': True},
        {'title': 'Sign the travel policy', 'needs_signature': True,
         # A step naming one person's document cannot go to several people.
         'document_id': 'doc-of-somebody'},
        {'title': 'Book the bus', 'needs_approval': True},
    ], due_date='2026-09-15')
    assert result['assigned'] == 1
    items = rows[0]['items']
    assert [i['title'] for i in items] == ['Collect permission slips', 'Sign the travel policy',
                                           'Book the bus']
    assert items[0]['needs_document'] is True
    assert items[1]['needs_signature'] is True and items[1]['document_id'] is None
    assert items[2]['needs_approval'] is True
    # The task's due date reaches every step that has none of its own.
    assert all(i['due_date'] == '2026-09-15' for i in items)
    assert all(i['status'] == 'pending' for i in items)
    assert rows[0]['due_date'] == '2026-09-15'


def test_priority_is_recorded_and_validated():
    _, rows, _ = _run(priority='urgent')
    assert rows[0]['priority'] == 'urgent'
    result, rows, _ = _run(priority='whenever')
    assert result == {'error': 'Invalid priority'} and rows == []


def test_a_reply_task_carries_the_thread_it_answers():
    """The messaging stream's "Make a task": the source ids are what the task
    page links back to."""
    _, rows, _ = _run(action='reply', source_conversation_id='conv-1',
                      source_message_id='msg-1')
    assert rows[0]['action'] == 'reply'
    assert rows[0]['source_conversation_id'] == 'conv-1'
    assert rows[0]['source_message_id'] == 'msg-1'


def test_a_reply_task_needs_a_thread():
    result, rows, _ = _run(action='reply')
    assert 'error' in result and rows == []
    result, rows, _ = _run(action='shout')
    assert result == {'error': 'Invalid action'}


def test_blocks_access_holds_families_only():
    """Holding a teacher or a student out of the platform over paperwork is a
    decision nobody has made; the hold is a family rule."""
    _, rows, _ = _run(user_ids=[{'id': 'kate', 'audience': 'staff'},
                                {'id': 'pat', 'audience': 'family'},
                                {'id': 'sam', 'audience': 'student'}],
                      blocks_access=True)
    assert [r['blocks_access'] for r in rows] == [False, True, False]


def test_a_template_fills_the_task_and_is_snapshotted():
    template = {'id': 't1', 'organization_id': ORG, 'name': 'Employee onboarding',
                'description': 'Finish in your first week', 'audience': 'staff',
                'blocks_access': False,
                'items': [{'key': 'i9', 'title': 'I-9', 'needs_document': True,
                           'required': True}]}
    result, rows, _ = _run(title=None, template=template, template_id='t1')
    row = rows[0]
    assert row['template_id'] == 't1' and row['template_name'] == 'Employee onboarding'
    assert row['description'] == 'Finish in your first week'
    assert row['items'][0]['key'] == 'i9' and row['items'][0]['status'] == 'pending'
    assert result['already_assigned'] == 0


def test_a_template_is_not_assigned_twice_to_one_person():
    """Ticket 8670a5e9: assigning a template to somebody who holds it hands
    back their row rather than minting a blank copy."""
    template = {'id': 't1', 'organization_id': ORG, 'name': 'Onboarding', 'items': [
        {'key': 'a', 'title': 'A'}], 'audience': 'staff'}
    held = {'id': 'old', 'user_id': 'kate', 'template_id': 't1', 'status': 'complete'}
    result, rows, notify = _run(title=None, template=template, template_id='t1', held=held)
    assert rows == [] and notify.call_count == 0
    assert result['assigned'] == 0 and result['already_assigned'] == 1


def test_a_template_from_another_school_is_refused():
    template = {'id': 't1', 'organization_id': 'other-org', 'name': 'X', 'items': []}
    result, rows, _ = _run(title=None, template=template, template_id='t1')
    assert result == {'error': 'Template not found'} and rows == []


def test_a_recurring_occurrence_is_stamped_and_announced_as_today():
    _, rows, notify = _run(schedule_id='s1', occurrence_date='2026-09-24',
                           expires_at='2026-09-25T05:59:59+00:00', due_date='2026-09-24')
    row = rows[0]
    assert (row['schedule_id'], row['occurrence_date']) == ('s1', '2026-09-24')
    assert row['expires_at'] == '2026-09-25T05:59:59+00:00'
    assert notify.call_args.args[1] == 'For today'
    # A daily duty does not email the person every morning.
    notify.email.assert_not_called()


def test_a_single_upload_task_carries_needs_document():
    _, rows, _ = _run(needs_document=True)
    assert rows[0]['items'][0]['needs_document'] is True


def test_a_step_with_no_title_refuses_the_whole_send():
    result, rows, _ = _run(items=[{'title': 'Real step'}, {'title': '  '}])
    assert 'error' in result and rows == []


def test_refuses_a_blank_title_and_an_empty_send():
    assert 'error' in onboarding.assign_task(ORG, ADMIN, ['kate'], '   ')
    assert 'error' in onboarding.assign_task(ORG, ADMIN, [], 'Do the thing')


def test_recipients_outside_the_org_are_refused():
    result, rows, notify = _run(recipients_ok=False)
    assert 'not part of this organization' in result['error']
    assert rows == [] and notify.call_count == 0
