"""
One writer for emergency contacts (services/emergency_contacts_service.py,
M4 2026-09-17). The funnel's write replaces what the funnel wrote and leaves
the office's rows alone; a family's back-edit no longer wipes what staff
added after them (audit C1).
"""

from unittest.mock import MagicMock, patch

import pytest

from services import emergency_contacts_service as ec


def _client(legacy_rows):
    client = MagicMock()
    calls = []

    def table(name):
        t = MagicMock()
        for meth in ('select', 'insert', 'delete', 'eq', 'in_', 'is_', 'order'):
            getattr(t, meth).return_value = t
        t.execute.return_value = MagicMock(data=legacy_rows)
        t.insert.side_effect = lambda rows: (calls.append(('insert', rows)) or t)
        t.delete.side_effect = lambda: (calls.append(('delete', None)) or t)
        t.in_.side_effect = lambda col, vals: (calls.append(('in_', col, list(vals))) or t)
        t.eq.side_effect = lambda col, val: (calls.append(('eq', col, val)) or t)
        return t
    client.table.side_effect = table
    client.calls = calls
    return client


@pytest.mark.unit
class TestReplaceForStudents:
    CONTACTS = [{'name': 'Alex Sample', 'relationship': 'Grandparent', 'phone': '555-0101', 'email': ''},
                {'name': 'Jo Neighbor', 'relationship': 'Neighbor', 'phone': '555-0102', 'email': 'jo@x.test'}]

    def test_writes_one_row_per_student_per_contact_tagged_with_the_source(self):
        client = _client([])
        with patch.object(ec, '_admin', return_value=client):
            n = ec.replace_for_students('org-1', ['s1', 's2'], self.CONTACTS)
        assert n == 4
        inserted = next(c[1] for c in client.calls if c[0] == 'insert')
        assert {r['student_user_id'] for r in inserted} == {'s1', 's2'}
        assert all(r['source'] == 'registration_funnel' and r['organization_id'] == 'org-1' for r in inserted)
        assert [r['priority'] for r in inserted if r['student_user_id'] == 's1'] == [1, 2]

    def test_replaces_only_its_own_rows(self):
        client = _client([])
        with patch.object(ec, '_admin', return_value=client):
            ec.replace_for_students('org-1', ['s1'], self.CONTACTS)
        # the first delete is scoped to the funnel's own source
        assert ('eq', 'source', 'registration_funnel') in client.calls

    def test_a_legacy_row_is_replaced_only_when_it_is_the_same_contact(self):
        legacy = [{'id': 'old-1', 'name': 'Alex Sample', 'phone': '555-0101'},
                  {'id': 'old-2', 'name': 'Office Added', 'phone': '555-0999'}]
        client = _client(legacy)
        with patch.object(ec, '_admin', return_value=client):
            ec.replace_for_students('org-1', ['s1'], self.CONTACTS)
        stale = [c for c in client.calls if c[0] == 'in_' and c[1] == 'id']
        assert stale and stale[0][2] == ['old-1']

    def test_nothing_to_do_without_students(self):
        client = _client([])
        with patch.object(ec, '_admin', return_value=client):
            assert ec.replace_for_students('org-1', [], self.CONTACTS) == 0
        assert client.calls == []


@pytest.mark.unit
def test_delete_for_students_drops_every_row_on_them():
    client = _client([])
    with patch.object(ec, '_admin', return_value=client):
        ec.delete_for_students(['s1', None, 's2'])
    assert ('in_', 'student_user_id', ['s1', 's2']) in client.calls
