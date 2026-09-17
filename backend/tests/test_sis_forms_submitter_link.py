"""
Where a "your request is resolved" notification sends the person who filed it.

Staff read their submissions in the SIS console's queue (/forms). A family
reads theirs on the learning app's Forms page (/family/forms), on a different
host. Every notification to a submitter carried /forms regardless, so a parent
whose request the office answered was told so and handed a link to a staff
page they could not open. The reply text itself only ever showed on the family
page.
"""

from unittest.mock import Mock, patch

from services import sis_forms_service as forms


ORG = 'org-1'
OFFICE = 'admin-1'
PARENT = 'parent-1'
TEACHER = 'teacher-1'


def _row(**over):
    base = {
        'id': 'sub-1', 'organization_id': ORG, 'submitted_by': PARENT,
        'submitter_role': 'parent', 'form_type': 'general_request',
        'title': 'Receipt for enrollment fee', 'status': 'submitted',
        'payload': {'body': 'I need a receipt.'}, 'assigned_to': None,
    }
    base.update(over)
    return base


class _Table:
    def __init__(self, row):
        self.row = row

    def select(self, *a, **k):
        return self

    def update(self, payload):
        self.row = {**self.row, **payload}
        return self

    def insert(self, payload):
        self.row = payload
        return self

    def eq(self, *a):
        return self

    def limit(self, *a):
        return self

    def execute(self):
        return Mock(data=[self.row])


def _notify_calls(fn):
    admin = Mock()
    admin.table.side_effect = lambda name: _Table(fn.row)
    with patch.object(forms, '_admin', return_value=admin), \
         patch.object(forms.sis_notifications, 'notify') as notify, \
         patch.object(forms, '_email_assignment'), \
         patch.object(forms, '_names_for', return_value={}):
        fn()
    return {c.args[0]: c.kwargs.get('link') for c in notify.call_args_list}


class TestResolvingAParentsRequest:
    def test_links_the_parent_to_the_family_forms_page(self):
        def run():
            forms.update_status(ORG, 'sub-1', {'status': 'resolved', 'resolution_notes': 'Sent.'}, OFFICE)
        run.row = _row()
        assert _notify_calls(run)[PARENT] == '/family/forms#requests'

    def test_still_links_a_staff_submitter_to_the_console_queue(self):
        def run():
            forms.update_status(ORG, 'sub-1', {'status': 'resolved'}, OFFICE)
        run.row = _row(submitted_by=TEACHER, submitter_role='staff', form_type='supply_request')
        assert _notify_calls(run)[TEACHER] == '/forms'


class TestCommentingOnAParentsRequest:
    def test_the_parent_and_the_assignee_each_get_their_own_page(self):
        def run():
            forms.add_comment(ORG, 'sub-1', OFFICE, 'We mailed it this morning.')
        run.row = _row(assigned_to=TEACHER)
        links = _notify_calls(run)
        assert links[PARENT] == '/family/forms#requests'
        assert links[TEACHER] == '/forms'
