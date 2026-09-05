"""
Which of the three nouns a queue row is.

iCreate, 2026-08-26 (1b6a63c9): "Can we have a way to select 'form' 'request' or
'task' so we know for sure the classification?"

One queue holding forms, requests and tasks is deliberate — they are all "somebody
needs something from the office" — but the only label on a row was
`form_type_label`, which names the TEMPLATE ("Add/drop request", "Incident
report") and never says which kind of thing it is.

The line drawn here is what the row asks of its reader, and the default is
`form`: a record nobody is waiting on still gets worked from the queue, whereas
calling a real request "paperwork" is how it sits for a week.
"""

import pytest

from services import sis_forms_service as forms


@pytest.mark.unit
class TestKindOf:
    def test_a_task_is_a_task(self):
        assert forms.kind_of('task') == 'task'

    @pytest.mark.parametrize('form_type', [
        'supply_request', 'maintenance', 'technology', 'teacher_support',
        'substitute_request', 'reimbursement', 'training_idea', 'student_concern',
    ])
    def test_staff_asking_for_something_is_a_request(self, form_type):
        assert forms.kind_of(form_type) == 'request'

    @pytest.mark.parametrize('form_type', sorted(forms.PARENT_FORM_TYPES))
    def test_everything_a_family_can_file_is_a_request(self, form_type):
        """A family has no way to file a record — everything they send is an ask."""
        assert forms.kind_of(form_type) == 'request'

    @pytest.mark.parametrize('form_type', [
        'incident', 'injury', 'behavior', 'substitute_notes', 'end_of_day',
        'parent_contact', 'employee_review', 'other',
    ])
    def test_a_record_filed_on_a_template_is_a_form(self, form_type):
        assert forms.kind_of(form_type) == 'form'

    def test_an_unknown_type_is_a_form(self):
        """The safe default — see the module docstring."""
        assert forms.kind_of('something_a_later_release_added') == 'form'

    def test_none_does_not_crash_the_queue(self):
        assert forms.kind_of(None) == 'form'

    def test_every_known_type_lands_in_exactly_one_kind(self):
        """No type may fall outside the three the filter offers, or it would be
        invisible whenever the office narrows the queue."""
        for form_type in {**forms.FORM_TYPES, **forms.PARENT_FORM_TYPES}:
            assert forms.kind_of(form_type) in forms.KINDS

    def test_request_types_are_all_real_types(self):
        """A typo in REQUEST_TYPES is silent — it just quietly classifies
        nothing — so the set is checked against the type dictionaries."""
        known = set(forms.FORM_TYPES) | set(forms.PARENT_FORM_TYPES)
        assert forms.REQUEST_TYPES <= known
