"""
Two things a filed request could not do.

1. Be corrected. `update_status` accepted only workflow fields, so a wrong link
   inside a submission could only be answered by resolving the row and asking
   the submitter to file it again (iCreate eec3e51e: "the purchases request has
   an incorrect link in it that we would like to fix").

2. Reach the assignee anywhere but the SIS. The in-app notification assumed
   staff open the console daily ("when I get assigned a task, can I get an
   email? I have a hard time keeping track" -- iCreate a6d09acd).
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_forms_service as forms

ORG = 'org-1'
ADMIN = 'admin-1'
ASSIGNEE = 'julia-1'

ROW = {
    'id': 'sub-1', 'organization_id': ORG, 'form_type': 'supply_request',
    'title': 'Purchases', 'payload': {'body': 'Order at http://wrong.example'},
    'submitted_by': 'teacher-1', 'assigned_to': None, 'status': 'submitted',
}


def _client(row, updates):
    """Admin client over sis_form_submissions: reads `row`, records updates."""
    client = Mock()

    def _table(name):
        t = Mock()
        for chained in ('select', 'eq', 'limit', 'order', 'neq', 'in_'):
            getattr(t, chained).return_value = t

        def _update(fields):
            updates.append(fields)
            t.execute.return_value = Mock(data=[{**row, **fields}])
            return t

        t.update.side_effect = _update
        t.execute.return_value = Mock(data=[dict(row)])
        return t

    client.table.side_effect = _table
    return client


def _update(fields, row=None):
    updates = []
    with patch.object(forms, '_admin', return_value=_client(row or ROW, updates)), \
         patch.object(forms, '_email_assignment'), \
         patch.object(forms.sis_notifications, 'notify'):
        result = forms.update_status(ORG, 'sub-1', fields, actor_id=ADMIN)
    return result, (updates[0] if updates else {})


@pytest.mark.unit
class TestCorrectingARequest:
    def test_body_is_written_back_into_the_payload(self):
        _, written = _update({'body': 'Order at https://right.example'})
        assert written['payload']['body'] == 'Order at https://right.example'

    def test_the_rest_of_the_payload_survives_a_body_edit(self):
        row = {**ROW, 'payload': {'body': 'old', 'amount': 42.0, 'location': 'Room 3'}}
        _, written = _update({'body': 'new'}, row=row)
        assert written['payload'] == {'body': 'new', 'amount': 42.0, 'location': 'Room 3'}

    def test_title_is_editable(self):
        _, written = _update({'title': '  Purchases (corrected) '})
        assert written['title'] == 'Purchases (corrected)'

    def test_an_emptied_title_is_refused(self):
        result, written = _update({'title': '   '})
        assert result.get('error')
        assert not written

    def test_an_emptied_body_is_refused(self):
        result, written = _update({'body': ''})
        assert result.get('error')
        assert not written

    def test_a_workflow_edit_still_leaves_the_text_alone(self):
        """Absent keys are absent: a status change must not blank the body."""
        _, written = _update({'status': 'in_progress'})
        assert 'payload' not in written
        assert 'title' not in written


@pytest.mark.unit
class TestAssignmentEmail:
    def test_a_new_assignee_is_emailed(self):
        updates = []
        with patch.object(forms, '_admin', return_value=_client(ROW, updates)), \
             patch.object(forms.sis_notifications, 'notify'), \
             patch.object(forms, '_email_assignment') as mail:
            forms.update_status(ORG, 'sub-1', {'assigned_to': ASSIGNEE}, actor_id=ADMIN)
        assert mail.call_count == 1
        assert mail.call_args[0][0] == ASSIGNEE

    def test_assigning_yourself_sends_nothing(self):
        """You know: you just did it."""
        updates = []
        with patch.object(forms, '_admin', return_value=_client(ROW, updates)), \
             patch.object(forms.sis_notifications, 'notify'), \
             patch.object(forms, '_email_assignment') as mail:
            forms.update_status(ORG, 'sub-1', {'assigned_to': ADMIN}, actor_id=ADMIN)
        mail.assert_not_called()

    def test_reassigning_to_the_same_person_sends_nothing(self):
        """Saving the row again is not a new assignment."""
        row = {**ROW, 'assigned_to': ASSIGNEE}
        updates = []
        with patch.object(forms, '_admin', return_value=_client(row, updates)), \
             patch.object(forms.sis_notifications, 'notify'), \
             patch.object(forms, '_email_assignment') as mail:
            forms.update_status(ORG, 'sub-1', {'assigned_to': ASSIGNEE}, actor_id=ADMIN)
        mail.assert_not_called()

    def test_a_failing_mailer_does_not_fail_the_assignment(self):
        """The task is assigned whether or not the mail goes out."""
        with patch.object(forms, '_admin', side_effect=RuntimeError('no db')), \
             patch('services.email_service.email_service') as mailer:
            mailer.send_email.side_effect = RuntimeError('smtp down')
            forms._email_assignment(ASSIGNEE, ORG, 'Purchases', 'Supply request')
