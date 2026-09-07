"""
The emergency contact sheet.

iCreate, 2026-09-05 (41c838c5): "Could we get an emergency master list of
students with both parents/guardians listed along with contact info? Then we
could have quick access to this and also print out a couple hard copies to have
available in case of emergency. And, it would help us to see if we are missing
any contact info still."

The second sentence is the one with teeth: a sheet on the wall is only worth
having if it is complete, and the only way the office finds a hole in it is by
reading the same sheet. So `missing` is a column, not a filter — the tests
below are mostly about what it says.
"""

from services import sis_reports_service as reports


STUDENT = {
    'student_id': 'kid-1', 'name': 'Adaline Bellon', 'age': 7,
    'household_id': 'hh-1', 'household_name': 'Bellon', 'preferred_name': 'Addy',
}

MOTHER = {'name': 'Jane Bellon', 'relationship': 'Mother', 'phone': '555-0100',
          'email': 'jane@example.com', 'is_primary': True}
FATHER = {'name': 'Sam Bellon', 'relationship': 'Father', 'phone': '555-0101',
          'email': 'sam@example.com', 'is_primary': False}
GRANDMA = {'name': 'Ruth Vance', 'relationship': 'Grandmother',
           'phone': '555-0199', 'priority': 1, 'can_pickup': True}


def _rows(guardians=(MOTHER, FATHER), contacts=(GRANDMA,), students=(STUDENT,)):
    return reports.build_emergency_rows(
        list(students),
        {'hh-1': list(guardians)} if guardians else {},
        {'kid-1': list(contacts)} if contacts else {},
    )


class TestTheSheet:
    def test_lists_both_guardians_and_the_emergency_contact(self):
        row = _rows()[0]
        assert row['student'] == 'Adaline Bellon'
        assert row['family'] == 'Bellon'
        assert [g['name'] for g in row['guardians']] == [
            'Jane Bellon (Mother)', 'Sam Bellon (Father)']
        assert [g['phone'] for g in row['guardians']] == ['555-0100', '555-0101']
        assert row['emergency_contacts'][0]['name'] == 'Ruth Vance (Grandmother)'
        assert row['emergency_contacts'][0]['can_pickup'] is True
        assert row['missing'] == ''

    def test_a_relationship_alone_still_names_the_row(self):
        # A contact typed as "Grandma, 555-0199" with no name field is still a
        # person to call; it must not render as an empty cell.
        row = _rows(contacts=[{'relationship': 'Grandmother', 'phone': '555-0199'}])[0]
        assert row['emergency_contacts'][0]['name'] == '(Grandmother)'

    def test_rows_are_alphabetical_by_student(self):
        second = {**STUDENT, 'student_id': 'kid-2', 'name': 'Aaron Zeff'}
        rows = reports.build_emergency_rows(
            [STUDENT, second], {'hh-1': [MOTHER, FATHER]},
            {'kid-1': [GRANDMA], 'kid-2': [GRANDMA]})
        assert [r['student'] for r in rows] == ['Aaron Zeff', 'Adaline Bellon']


class TestWhatIsMissing:
    def test_one_guardian_is_flagged(self):
        # "Both parents/guardians" — a household with one adult is a household
        # the office cannot reach when that person does not pick up.
        assert 'only one guardian' in _rows(guardians=[MOTHER])[0]['missing']

    def test_no_guardian_at_all(self):
        row = _rows(guardians=())[0]
        assert 'no guardian on file' in row['missing']
        assert 'only one guardian' not in row['missing']

    def test_guardians_without_a_number_are_not_contacts(self):
        row = _rows(guardians=[{**MOTHER, 'phone': ''}, {**FATHER, 'phone': '  '}])[0]
        assert 'no guardian phone' in row['missing']

    def test_no_emergency_contact(self):
        assert 'no emergency contact' in _rows(contacts=())[0]['missing']

    def test_an_emergency_contact_with_no_number(self):
        row = _rows(contacts=[{'name': 'Ruth Vance', 'phone': ''}])[0]
        assert 'no emergency contact phone' in row['missing']

    def test_both_holes_are_reported_together(self):
        # The office fixes a family in one pass, so the row says everything.
        row = _rows(guardians=[MOTHER], contacts=())[0]
        assert 'only one guardian' in row['missing']
        assert 'no emergency contact' in row['missing']


class TestPrintableSheet:
    def test_csv_columns_match_the_configured_width(self):
        report = {'rows': _rows()}
        header, rows = reports.emergency_contacts_csv(report)
        assert header[:3] == ['Student', 'Age', 'Family']
        assert header[-1] == 'Missing'
        assert len(header) == 3 + reports.MAX_LISTED_GUARDIANS * 3 \
            + reports.MAX_LISTED_EMERGENCY * 2 + 1
        assert len(rows[0]) == len(header)

    def test_missing_people_leave_blank_cells_not_short_rows(self):
        # A short row silently shifts every column after it, which on a printed
        # sheet puts one family's phone number next to another family's child.
        report = {'rows': _rows(guardians=[MOTHER], contacts=())}
        header, rows = reports.emergency_contacts_csv(report)
        assert len(rows[0]) == len(header)
        assert rows[0][header.index('Guardian 2')] == ''
        assert rows[0][header.index('Emergency contact 1 phone')] == ''
        assert 'no emergency contact' in rows[0][-1]
