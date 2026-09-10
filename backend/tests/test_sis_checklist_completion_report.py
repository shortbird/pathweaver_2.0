"""
The onboarding chase list (iCreate 42c4acde).

"It'd be really helpful to be able to download a .csv of who hasn't filled in
the checklist for onboarding. Either in the task center or in the reports. Or
somehow make it so we can just message them within the app to help them!"

The roll-up already on screen answers this per CHECKLIST. Chasing forty people
needs the other axis: one row per person, worst first, carrying an address to
chase them at.
"""

from unittest.mock import patch

import pytest

from services import sis_onboarding_service as onboarding

ORG = 'org-1'

ASSIGNMENTS = [
    {'user_id': 'u1', 'user_name': 'Ana Rogers', 'template_name': 'Staff onboarding',
     'done_count': 1, 'total_count': 3,
     'items': [{'title': 'Handbook', 'status': 'complete'},
               {'title': 'W-9', 'status': 'pending'},
               {'title': 'Background check', 'status': 'pending'}]},
    {'user_id': 'u2', 'user_name': 'Ruth Stewart', 'template_name': 'Staff onboarding',
     'done_count': 3, 'total_count': 3,
     'items': [{'title': 'Handbook', 'status': 'complete'},
               {'title': 'W-9', 'status': 'approved'},
               {'title': 'Background check', 'status': 'complete'}]},
    {'user_id': 'u3', 'user_name': 'Kate Chr', 'template_name': 'Safety training',
     'done_count': 0, 'total_count': 1,
     'items': [{'title': 'Fire drill', 'status': 'pending'}]},
]
EMAILS = {'u1': 'ana@example.com', 'u2': 'ruth@example.com', 'u3': 'kate@example.com'}


class _Users:
    """Just enough admin client for the one users lookup the report makes."""

    def table(self, _name):
        return self

    def select(self, *_a, **_k):
        return self

    def in_(self, _col, ids):
        self._ids = ids
        return self

    def execute(self):
        class R:
            data = [{'id': i, 'email': EMAILS[i]} for i in EMAILS]
        return R()


def _report(assignments=None, **kwargs):
    with patch.object(onboarding, 'list_assignments',
                      return_value=[dict(a) for a in (assignments or ASSIGNMENTS)]), \
         patch.object(onboarding, '_admin', return_value=_Users()):
        return onboarding.completion_report(ORG, **kwargs)


@pytest.mark.unit
class TestWhoIsOnTheList:
    def test_only_people_with_outstanding_items(self):
        names = [p['name'] for p in _report()]
        assert 'Ruth Stewart' not in names
        assert set(names) == {'Ana Rogers', 'Kate Chr'}

    def test_all_includes_the_finished(self):
        names = [p['name'] for p in _report(outstanding_only=False)]
        assert 'Ruth Stewart' in names

    def test_worst_first(self):
        """The chase starts at the top of the list."""
        report = _report()
        assert [p['outstanding_count'] for p in report] == [2, 1]

    def test_an_approved_item_counts_as_done(self):
        report = _report(outstanding_only=False)
        ruth = next(p for p in report if p['name'] == 'Ruth Stewart')
        assert ruth['outstanding_count'] == 0

    def test_the_missing_items_are_named(self):
        ana = next(p for p in _report() if p['name'] == 'Ana Rogers')
        assert sorted(ana['missing']) == ['Background check', 'W-9']

    def test_the_email_is_carried(self):
        """The point of the export is to contact these people."""
        ana = next(p for p in _report() if p['name'] == 'Ana Rogers')
        assert ana['email'] == 'ana@example.com'

    def test_two_checklists_are_one_row(self):
        """The office is chasing the person, not the checklist."""
        doubled = ASSIGNMENTS + [{
            'user_id': 'u1', 'user_name': 'Ana Rogers', 'template_name': 'Safety training',
            'done_count': 0, 'total_count': 1,
            'items': [{'title': 'Fire drill', 'status': 'pending'}]}]
        report = _report(doubled)
        ana = [p for p in report if p['name'] == 'Ana Rogers']
        assert len(ana) == 1
        assert ana[0]['outstanding_count'] == 3
        assert sorted(ana[0]['checklists']) == ['Safety training', 'Staff onboarding']

    def test_no_assignments_is_an_empty_report_not_an_error(self):
        with patch.object(onboarding, 'list_assignments', return_value=[]):
            assert onboarding.completion_report(ORG) == []


@pytest.mark.unit
class TestTheCsv:
    def test_header_and_one_row_per_person(self):
        header, rows = onboarding.completion_csv(_report())
        assert header[:2] == ['Name', 'Email']
        assert len(rows) == 2

    def test_missing_items_are_readable_in_one_cell(self):
        _, rows = onboarding.completion_csv(_report())
        ana = next(r for r in rows if r[0] == 'Ana Rogers')
        assert 'W-9' in ana[-1] and 'Background check' in ana[-1]
