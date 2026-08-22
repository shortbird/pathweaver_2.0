"""
Org-defined forms — the builder iCreate asked for (16b736f3).

The rules that matter here are the ones that keep history readable: a key never
changes once submissions exist, a template's own validation is the gate rather
than the builder's UI hints, and answers bound to a student or a class land on
the submission ROW so the rest of the SIS can find them.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_form_template_service as svc

ORG = 'org-1'


def _admin_with(responses):
    """Admin client stub: one shared table mock, each execute() pops the next
    scripted response."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'update', 'delete', 'insert',
                    'in_', 'order'):
        getattr(table, chained).return_value = table
    table.execute.side_effect = [Mock(data=d, count=len(d) if isinstance(d, list) else 0)
                                 for d in responses] + [Mock(data=[], count=0)] * 10
    return client, table


@pytest.mark.unit
class TestFieldCleaning:
    def test_a_question_needs_a_label(self):
        fields, err = svc.clean_fields([{'type': 'short_text'}])
        assert fields is None and 'label' in err

    def test_a_form_needs_at_least_one_question(self):
        fields, err = svc.clean_fields([])
        assert fields is None and err

    def test_an_unknown_type_is_refused(self):
        fields, err = svc.clean_fields([{'label': 'Signature', 'type': 'esign'}])
        assert fields is None and 'esign' in err

    def test_a_choice_question_needs_choices(self):
        fields, err = svc.clean_fields([{'label': 'Severity', 'type': 'select'}])
        assert fields is None and 'choices' in err

    def test_choices_can_arrive_as_lines_of_text(self):
        fields, _ = svc.clean_fields([
            {'label': 'Severity', 'type': 'select', 'options': 'Low\nHigh\n\n'}])
        assert fields[0]['options'] == ['Low', 'High']

    def test_keys_are_minted_from_labels_and_kept_unique(self):
        fields, _ = svc.clean_fields([{'label': 'What happened?'},
                                      {'label': 'What happened?'}])
        assert fields[0]['key'] == 'what_happened'
        assert fields[1]['key'] != fields[0]['key']

    def test_an_existing_key_survives_an_edit(self):
        """Payloads are keyed by these; re-minting one re-labels an answer
        somebody already gave."""
        fields, _ = svc.clean_fields([{'key': 'legacy_key', 'label': 'Renamed question'}])
        assert fields[0]['key'] == 'legacy_key'


@pytest.mark.unit
class TestSaveTemplate:
    def test_a_new_form_gets_a_slug_key(self):
        client, table = _admin_with([[], [{'id': 't1'}]])
        with patch.object(svc, '_admin', return_value=client):
            svc.save_template(ORG, {'name': 'Supply request',
                                    'fields': [{'label': 'What do you need?'}]},
                              actor_id='admin-1')
        assert table.insert.call_args[0][0]['key'] == 'supply_request'

    def test_a_clashing_key_steps_aside(self):
        client, table = _admin_with([[{'key': 'supply_request'}], [{'id': 't2'}]])
        with patch.object(svc, '_admin', return_value=client):
            svc.save_template(ORG, {'name': 'Supply request',
                                    'fields': [{'label': 'What?'}]}, actor_id='admin-1')
        assert table.insert.call_args[0][0]['key'] == 'supply_request_2'

    def test_editing_never_rewrites_the_key(self):
        """Submissions carry it as form_type; changing it orphans all of them."""
        client, table = _admin_with([[{'id': 't1', 'organization_id': ORG,
                                       'key': 'supply_request'}], [{'id': 't1'}]])
        with patch.object(svc, '_admin', return_value=client):
            svc.save_template(ORG, {'name': 'Materials request', 'key': 'materials_request',
                                    'fields': [{'label': 'What?'}]},
                              actor_id='admin-1', template_id='t1')
        assert 'key' not in table.update.call_args[0][0]

    def test_another_orgs_form_is_not_found(self):
        client, _ = _admin_with([[{'id': 't1', 'organization_id': 'other', 'key': 'k'}]])
        with patch.object(svc, '_admin', return_value=client):
            result = svc.save_template(ORG, {'name': 'X', 'fields': [{'label': 'Y'}]},
                                       actor_id='admin-1', template_id='t1')
        assert result['status'] == 404


@pytest.mark.unit
class TestDeleteGuard:
    def test_a_form_with_submissions_is_refused(self):
        client, _ = _admin_with([[{'id': 't1', 'organization_id': ORG, 'key': 'supply_request'}]])
        with patch.object(svc, '_admin', return_value=client), \
             patch.object(svc, 'count_submissions', return_value=4):
            result = svc.delete_template(ORG, 't1')
        assert result['status'] == 409
        assert result['submission_count'] == 4

    def test_force_deletes_anyway(self):
        client, table = _admin_with([[{'id': 't1', 'organization_id': ORG, 'key': 'k'}]])
        with patch.object(svc, '_admin', return_value=client), \
             patch.object(svc, 'count_submissions', return_value=4):
            result = svc.delete_template(ORG, 't1', force=True)
        assert result['deleted'] is True
        table.delete.assert_called_once()


@pytest.mark.unit
class TestValidateAnswers:
    TEMPLATE = {'fields': [
        {'key': 'what', 'label': 'What happened?', 'type': 'long_text', 'required': True},
        {'key': 'severity', 'label': 'Severity', 'type': 'select',
         'required': False, 'options': ['Low', 'High']},
        {'key': 'count', 'label': 'How many?', 'type': 'number', 'required': False},
        {'key': 'ack', 'label': 'Parent informed', 'type': 'checkbox', 'required': True},
    ]}

    def test_a_missing_required_answer_is_refused(self):
        payload, err = svc.validate_answers(self.TEMPLATE, {'ack': True})
        assert payload is None and 'What happened?' in err

    def test_an_unticked_required_checkbox_is_refused(self):
        payload, err = svc.validate_answers(
            self.TEMPLATE, {'what': 'A spill', 'ack': False})
        assert payload is None and 'ticked' in err

    def test_a_choice_outside_the_choices_is_refused(self):
        payload, err = svc.validate_answers(
            self.TEMPLATE, {'what': 'A spill', 'ack': True, 'severity': 'Catastrophic'})
        assert payload is None and 'Catastrophic' in err

    def test_a_number_that_is_not_a_number_is_refused(self):
        payload, err = svc.validate_answers(
            self.TEMPLATE, {'what': 'A spill', 'ack': True, 'count': 'lots'})
        assert payload is None and 'number' in err

    def test_keys_the_form_does_not_define_are_dropped(self):
        """The client is not trusted to decide what gets stored."""
        payload, err = svc.validate_answers(
            self.TEMPLATE, {'what': 'A spill', 'ack': True, 'sneaky': 'value'})
        assert err is None
        assert 'sneaky' not in payload

    def test_a_valid_submission_comes_back_typed(self):
        payload, err = svc.validate_answers(
            self.TEMPLATE, {'what': ' A spill ', 'ack': True,
                            'severity': 'High', 'count': '3'})
        assert err is None
        assert payload == {'what': 'A spill', 'severity': 'High',
                           'count': 3, 'ack': True}


@pytest.mark.unit
class TestSubmittableForms:
    def test_an_org_form_replaces_the_builtin_of_the_same_key(self):
        """Otherwise the picker shows two entries with the same name."""
        org_form = {'key': 'supply_request', 'name': 'Supply request',
                    'audience': 'staff', 'fields': [{'key': 'what', 'label': 'What?'}],
                    'visible_to_roles': None}
        with patch.object(svc, 'list_templates', return_value=[org_form]):
            forms = svc.submittable_forms(ORG, 'staff')
        matching = [f for f in forms if f['key'] == 'supply_request']
        assert len(matching) == 1
        assert matching[0]['source'] == 'org'

    def test_a_builtin_carries_no_fields_so_the_old_form_renders(self):
        with patch.object(svc, 'list_templates', return_value=[]):
            forms = svc.submittable_forms(ORG, 'staff')
        assert all(f['fields'] == [] and f['source'] == 'builtin' for f in forms)

    def test_a_role_narrowed_form_is_hidden_from_others(self):
        org_form = {'key': 'sub_notes', 'name': 'Substitute notes', 'audience': 'staff',
                    'fields': [{'key': 'a', 'label': 'A'}], 'visible_to_roles': ['advisor']}
        with patch.object(svc, 'list_templates', return_value=[org_form]):
            for_admin = svc.submittable_forms(ORG, 'staff', roles=['org_admin'])
            for_teacher = svc.submittable_forms(ORG, 'staff', roles=['advisor'])
        assert 'sub_notes' not in {f['key'] for f in for_admin}
        assert 'sub_notes' in {f['key'] for f in for_teacher}


@pytest.mark.unit
class TestSubmitAgainstATemplate:
    TEMPLATE = {
        'key': 'behavior_note', 'name': 'Behaviour note', 'audience': 'staff',
        'is_active': True, 'default_priority': 'high', 'default_assignee_id': 'julia-1',
        'fields': [
            {'key': 'child', 'label': 'Which child?', 'type': 'student', 'required': True},
            {'key': 'what', 'label': 'What happened?', 'type': 'long_text', 'required': True},
        ],
    }

    def _submit(self, data, template=None):
        from services import sis_forms_service as forms
        inserted = []
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit'):
            getattr(table, chained).return_value = table
        table.insert.side_effect = lambda row: (inserted.append(row) or table)
        table.execute.side_effect = [Mock(data=[{'feature_flags': {}}]),
                                     Mock(data=[{'id': 'f1', 'title': 'Behaviour note'}])]
        with patch.object(forms, '_admin', return_value=client), \
             patch('services.sis_form_template_service.get_template',
                   return_value=template or self.TEMPLATE), \
             patch.object(forms.sis_service, 'org_admin_ids', return_value=[]), \
             patch.object(forms.sis_notifications, 'notify'):
            result = forms.submit(ORG, 'teacher-1', data)
        return result, (inserted[0] if inserted else {})

    def test_a_student_answer_lands_on_the_row_not_just_the_payload(self):
        """What makes a behaviour note findable from the child's record rather
        than prose in a queue."""
        _, row = self._submit({'form_type': 'behavior_note',
                               'answers': {'child': 'student-9', 'what': 'Pushed in line'}})
        assert row['student_user_id'] == 'student-9'
        assert row['payload']['what'] == 'Pushed in line'

    def test_the_forms_own_default_priority_applies(self):
        _, row = self._submit({'form_type': 'behavior_note',
                               'answers': {'child': 's1', 'what': 'x'}})
        assert row['priority'] == 'high'

    def test_the_forms_own_assignee_beats_the_org_routing_map(self):
        _, row = self._submit({'form_type': 'behavior_note',
                               'answers': {'child': 's1', 'what': 'x'}})
        assert row['assigned_to'] == 'julia-1'

    def test_a_missing_required_answer_is_refused(self):
        result, _ = self._submit({'form_type': 'behavior_note', 'answers': {'child': 's1'}})
        assert 'error' in result

    def test_a_retired_form_cannot_be_filed(self):
        result, _ = self._submit({'form_type': 'behavior_note', 'answers': {}},
                                 template={**self.TEMPLATE, 'is_active': False})
        assert 'retired' in result['error']

    def test_a_family_form_cannot_be_filed_by_staff(self):
        result, _ = self._submit({'form_type': 'behavior_note', 'answers': {}},
                                 template={**self.TEMPLATE, 'audience': 'family'})
        assert 'not available' in result['error']

    def test_the_label_is_recorded_as_of_submission(self):
        _, row = self._submit({'form_type': 'behavior_note',
                               'answers': {'child': 's1', 'what': 'x'}})
        assert row['form_type_label'] == 'Behaviour note'
