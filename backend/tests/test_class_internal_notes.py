"""
Staff-only internal notes on a class (iCreate, 2026-08-11: "Can you add a
section to have internal notes for each class?").

Two properties matter:
1. The office can save notes at all — internal_notes must be in the repo's
   SIS field whitelist or the PATCH silently drops it (the same failure mode
   as the 2026-08-06 assistant-teacher bug).
2. Internal means internal — the catalog service serves the parent Schedule
   Builder and the public embed with audience='family', and those payloads
   must not carry the column.
"""

import pytest

from repositories.sis_class_repository import SIS_CLASS_FIELDS
from services import sis_catalog_service as catalog


@pytest.mark.unit
class TestInternalNotesSaveAtAll:
    def test_internal_notes_is_a_writable_sis_field(self):
        assert 'internal_notes' in SIS_CLASS_FIELDS


@pytest.mark.unit
class TestInternalNotesStayInternal:
    CLS = {'id': 'c1', 'name': 'Pottery', 'internal_notes': 'Kiln warm-up 30 min'}

    def test_staff_keep_the_notes(self):
        assert catalog._for_audience(dict(self.CLS), 'staff')['internal_notes'] \
            == 'Kiln warm-up 30 min'

    def test_families_never_receive_the_column(self):
        scrubbed = catalog._for_audience(dict(self.CLS), 'family')
        assert 'internal_notes' not in scrubbed
        # Everything family-visible is untouched.
        assert scrubbed['name'] == 'Pottery'

    def test_any_non_staff_audience_is_scrubbed_not_just_family(self):
        """New audience values must fail closed — strip unless literally staff."""
        assert 'internal_notes' not in catalog._for_audience(dict(self.CLS), 'public')

    def test_a_class_without_notes_passes_through_unharmed(self):
        assert catalog._for_audience({'id': 'c2'}, 'family') == {'id': 'c2'}

    def test_every_staff_only_column_is_actually_on_the_write_whitelist(self):
        """A STAFF_ONLY_FIELDS entry that isn't a writable field is a typo —
        it guards a column that can never exist."""
        assert set(catalog.STAFF_ONLY_FIELDS) <= set(SIS_CLASS_FIELDS)
