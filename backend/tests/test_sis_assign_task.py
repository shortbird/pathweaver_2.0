"""
One-off tasks: "do this one thing, tick it when done."

An admin types what needs doing and picks who owes it — no template authored
first. Underneath it is the same assignment record a checklist uses (one item,
template_id NULL), which is the point: the recipient's inbox, the admin
roll-up and the completion flow all already understand it. These tests pin the
shape of that record, because three consumers read it without ever calling
this function.
"""

from unittest.mock import Mock, patch

from services import sis_onboarding_service as onboarding


ORG = 'org-1'
ADMIN = 'admin-1'


def _run(title='Turn in your roster', user_ids=('kate',), recipients_ok=True, **kwargs):
    """Run assign_task with the DB stubbed; return (result, inserted_rows, notify)."""
    inserted = []

    def _table(name):
        t = Mock()

        def _insert(row):
            inserted.append(row)
            t.execute.return_value = Mock(data=[row])
            return t
        t.insert.side_effect = _insert
        return t

    admin = Mock()
    admin.table.side_effect = _table

    check = (Mock() if recipients_ok
             else Mock(side_effect=onboarding.RecipientNotInOrg('That person is not part of this organization')))

    with patch.object(onboarding, '_admin', return_value=admin), \
         patch.object(onboarding, 'assert_recipients_in_org', check), \
         patch.object(onboarding.sis_notifications, 'notify') as notify:
        result = onboarding.assign_task(ORG, title, list(user_ids), ADMIN, **kwargs)
    return result, inserted, notify


def test_task_is_a_single_item_assignment_with_no_template():
    result, rows, _ = _run(description='By Friday, to the front office')
    assert result == {'assigned': 1, 'errors': []}
    row = rows[0]
    assert row['template_id'] is None
    assert row['template_name'] == 'Turn in your roster'
    assert row['organization_id'] == ORG and row['user_id'] == 'kate'
    assert len(row['items']) == 1
    item = row['items'][0]
    assert item['title'] == 'Turn in your roster'
    assert item['description'] == 'By Friday, to the front office'
    assert item['status'] == 'pending'
    # A plain tick completes it: no document, signature or approval demanded.
    assert not item['needs_document'] and not item['needs_signature'] and not item['needs_approval']
    # A one-off task never gates the portal.
    assert row['blocks_access'] is False


def test_each_recipient_gets_their_own_row_and_notification():
    result, rows, notify = _run(user_ids=['kate', 'sam', 'kate'])  # dupe collapsed
    assert result['assigned'] == 2
    assert [r['user_id'] for r in rows] == ['kate', 'sam']
    assert notify.call_count == 2
    # Staff are pointed at the inbox where the checkbox is.
    assert notify.call_args.kwargs['link'] == '/my-tasks'


def test_family_tasks_point_at_the_family_portal():
    _, rows, notify = _run(audience='family')
    assert rows[0]['audience'] == 'family'
    assert notify.call_args.kwargs['link'] == '/family/portal'


def test_steps_make_it_a_checklist_but_never_a_signature_or_approval():
    result, rows, _ = _run(title='Field trip prep', items=[
        {'title': 'Collect permission slips', 'needs_document': True,
         # A caller cannot smuggle in the flows that need more than a tick:
         # signatures come with a document (the signature-send flow) and
         # approval queues are a template decision, not an ad-hoc one.
         'needs_signature': True, 'needs_approval': True},
        {'title': 'Book the bus'},
    ], due_date='2026-09-15')
    assert result['assigned'] == 1
    items = rows[0]['items']
    assert [i['title'] for i in items] == ['Collect permission slips', 'Book the bus']
    assert items[0]['needs_document'] is True
    assert all(not i['needs_signature'] and not i['needs_approval'] for i in items)
    # The task's due date reaches every step that has none of its own.
    assert all(i['due_date'] == '2026-09-15' for i in items)
    assert all(i['status'] == 'pending' for i in items)


def test_a_single_upload_task_carries_needs_document():
    _, rows, _ = _run(needs_document=True)
    assert rows[0]['items'][0]['needs_document'] is True


def test_a_step_with_no_title_refuses_the_whole_send():
    result, rows, _ = _run(items=[{'title': 'Real step'}, {'title': '  '}])
    assert 'error' in result and rows == []


def test_refuses_a_blank_title_and_an_empty_send():
    assert 'error' in onboarding.assign_task(ORG, '   ', ['kate'], ADMIN)
    assert 'error' in onboarding.assign_task(ORG, 'Do the thing', [], ADMIN)


def test_recipients_outside_the_org_are_refused():
    result, rows, notify = _run(recipients_ok=False)
    assert 'not part of this organization' in result['error']
    assert rows == [] and notify.call_count == 0
