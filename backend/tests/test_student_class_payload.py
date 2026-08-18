"""
A student's own class list must not carry the school's internal columns.

`/api/student/classes` builds its payload from `org_classes(*)`, so every column
on the row travelled to the client — including `internal_notes` and
`supply_budget_per_student`, the per-student materials budget. The SIS catalog
had already solved this for its family audience via STAFF_ONLY_FIELDS; this
endpoint simply never used it, and now does.

Found 2026-08-18 while auditing what the new mobile class schedule sends.
"""

import pytest

import app  # noqa: F401 — import graph ordering
from services.class_service import ClassService
from services.sis_catalog_service import STAFF_ONLY_FIELDS


def _sample_class():
    """An org_classes row as the enrollment join returns it: everything."""
    return {
        'id': 'class-1',
        'name': 'Lego Lab',
        'status': 'active',
        'location': 'Journey Room',
        'internal_notes': 'Kiln needs 30 min warm-up',
        'supply_budget_per_student': 42.50,
        'price_cents': 12000,
        'capacity': 12,
    }


def test_staff_only_fields_are_removed():
    classes = [_sample_class()]
    ClassService._strip_staff_only(classes)
    for field in STAFF_ONLY_FIELDS:
        assert field not in classes[0], f'{field} reached a student payload'


def test_internal_notes_and_supply_budget_are_both_covered():
    """Named explicitly: these are the two the audit actually found."""
    assert 'internal_notes' in STAFF_ONLY_FIELDS
    assert 'supply_budget_per_student' in STAFF_ONLY_FIELDS


def test_the_fields_the_ui_needs_survive():
    """Stripping must not take the schedule with it — name, room and meetings
    are the whole point of the payload."""
    classes = [{**_sample_class(), 'meetings': [{'day_of_week': 2}]}]
    ClassService._strip_staff_only(classes)
    for field in ('id', 'name', 'location', 'meetings', 'capacity'):
        assert field in classes[0], f'{field} was stripped but the UI needs it'


def test_price_is_kept():
    """Deliberate: families see tuition on the SIS catalog, so price is not an
    internal column. If that ever changes, change it in STAFF_ONLY_FIELDS so
    both surfaces move together."""
    classes = [_sample_class()]
    ClassService._strip_staff_only(classes)
    assert 'price_cents' in classes[0]


def test_missing_fields_do_not_raise():
    classes = [{'id': 'c', 'name': 'n'}]
    ClassService._strip_staff_only(classes)
    assert classes[0] == {'id': 'c', 'name': 'n'}


def test_empty_list_is_fine():
    ClassService._strip_staff_only([])
