"""
Schedule AI editor — the proposal must never hide what it is about to do.

Written from the 2026-07-23 iCreate reports: asked to "change the supply fee to
$35 on all 4 open art studio classes", the editor changed none of them and put
$35 into TUITION on one. The root cause (supply_fee missing from the field
whitelist) was fixed the same day; these tests cover the reason nobody could
SEE it happen — a dropped field said nothing, and the confirmation screen
described a money change as the word "price_cents".

The property under test throughout: anything the editor silently discarded, or
silently wrote to a money field, now reaches the staff member before Apply.
"""

from unittest.mock import patch

import pytest

from services import sis_schedule_ai_service as ai


ORG = 'org-1'

# Four sections of one class, the shape that produced the original report.
SNAPSHOT = {
    'classes': [
        {'id': 'c1', 'name': 'Open Art Studio (Tue AM)', 'location': 'Art Room',
         'capacity': 12, 'min_age': 8, 'max_age': 14, 'price_cents': 12000,
         'supply_fee': 20.0, 'description': None, 'instructor': 'Amy', 'meetings': []},
        {'id': 'c2', 'name': 'Open Art Studio (Tue PM)', 'location': 'Art Room',
         'capacity': 12, 'min_age': 8, 'max_age': 14, 'price_cents': 12000,
         'supply_fee': 20.0, 'description': None, 'instructor': 'Amy', 'meetings': []},
        {'id': 'c3', 'name': 'Open Art Studio (Thu AM)', 'location': 'Art Room',
         'capacity': 12, 'min_age': 8, 'max_age': 14, 'price_cents': 12000,
         'supply_fee': 20.0, 'description': None, 'instructor': 'Amy', 'meetings': []},
        {'id': 'c4', 'name': 'Open Art Studio (Thu PM)', 'location': 'Art Room',
         'capacity': 12, 'min_age': 8, 'max_age': 14, 'price_cents': 12000,
         'supply_fee': 20.0, 'description': None, 'instructor': 'Amy', 'meetings': []},
        {'id': 'u1', 'name': 'Ukulele', 'location': 'Music', 'capacity': 8,
         'min_age': 6, 'max_age': 12, 'price_cents': 9000, 'supply_fee': None,
         'description': None, 'instructor': 'Bo', 'meetings': []},
    ],
    'staff': [{'id': 's1', 'name': 'Amy'}, {'id': 's2', 'name': 'Bo'}],
    'time_blocks': [],
}


def _validate(raw_ops):
    return ai._validate_operations(ORG, raw_ops, SNAPSHOT)


@pytest.mark.unit
class TestMoneyIsNeverJustAFieldName:
    def test_supply_fee_change_reads_as_money_in_the_label(self):
        ops, _ = _validate([{'action': 'update_class', 'class_id': 'c1',
                             'fields': {'supply_fee': 35}}])
        assert ops[0]['label'] == 'Update "Open Art Studio (Tue AM)" — supply fee $20.00 -> $35.00'

    def test_tuition_is_named_tuition_and_converted_from_cents(self):
        """The original bug wrote $35 to tuition. Had the screen said "tuition
        $120.00 -> $35.00" instead of "price_cents", it would have been obvious."""
        ops, _ = _validate([{'action': 'update_class', 'class_id': 'c1',
                             'fields': {'price_cents': 3500}}])
        assert 'tuition $120.00 -> $35.00' in ops[0]['label']

    def test_money_changes_are_repeated_as_their_own_warning(self):
        ops, _ = _validate([{'action': 'update_class', 'class_id': 'c1',
                             'fields': {'price_cents': 3500}}])
        warnings = ai._money_warnings(ops, SNAPSHOT)
        assert len(warnings) == 1
        assert 'tuition $120.00 -> $35.00' in warnings[0]
        assert 'Check this is the fee you meant' in warnings[0]

    def test_an_unset_fee_reads_as_not_set_rather_than_zero(self):
        ops, _ = _validate([{'action': 'update_class', 'class_id': 'u1',
                             'fields': {'supply_fee': 15}}])
        assert 'supply fee not set -> $15.00' in ops[0]['label']

    def test_new_class_fees_are_spelled_out_too(self):
        ops, _ = _validate([{'action': 'create_class', 'name': 'Clay', 'price_cents': 8000,
                             'meetings': [{'day_of_week': 2, 'start_time': '09:00',
                                           'end_time': '10:00'}]}])
        assert ops[0]['label'] == 'Create class "Clay" — tuition $80.00'


@pytest.mark.unit
class TestNothingIsDroppedInSilence:
    def test_a_field_this_editor_cannot_set_is_named(self):
        """The 07-23 failure mode exactly: the model emits a field, the
        whitelist drops it, and the staff member is told nothing."""
        ops, errors = _validate([{'action': 'update_class', 'class_id': 'c1',
                                  'fields': {'waitlist_enabled': True, 'location': 'Kiln'}}])
        assert any('can\'t set "waitlist_enabled"' in e for e in errors)
        # The rest of the operation still stands.
        assert ops[0]['fields'] == {'location': 'Kiln'}

    def test_an_unreadable_number_is_named(self):
        ops, errors = _validate([{'action': 'update_class', 'class_id': 'c1',
                                  'fields': {'capacity': 'twelve'}}])
        assert ops == []  # nothing valid left to change
        assert any('couldn\'t read "twelve" as a number for capacity' in e for e in errors)

    def test_an_unreadable_number_on_create_is_named(self):
        ops, errors = _validate([{'action': 'create_class', 'name': 'Clay',
                                  'price_cents': 'eighty dollars',
                                  'meetings': [{'day_of_week': 2, 'start_time': '09:00',
                                                'end_time': '10:00'}]}])
        assert any('couldn\'t read "eighty dollars" as a number for tuition' in e for e in errors)
        assert 'price_cents' not in ops[0]['fields']  # created, but not with a wrong price

    def test_clearing_a_field_is_still_allowed(self):
        """None means "clear it" and must not be mistaken for unparseable."""
        ops, errors = _validate([{'action': 'update_class', 'class_id': 'c1',
                                  'fields': {'capacity': None}}])
        assert ops[0]['fields'] == {'capacity': None}
        assert errors == []


@pytest.mark.unit
class TestSectionCoverage:
    PROMPT = 'Change the supply fee to $35 on all 4 open art studio classes'

    def test_warns_when_only_some_sections_are_covered(self):
        ops, _ = _validate([{'action': 'update_class', 'class_id': 'c1',
                             'fields': {'supply_fee': 35}}])
        warnings = ai._coverage_warnings(self.PROMPT, SNAPSHOT, ops)
        assert len(warnings) == 1
        assert 'has 4 sections and this changes 1' in warnings[0]

    def test_warns_loudly_when_none_are_covered(self):
        """"it didn't change it on any of those classes" — the other half of
        the report. An empty proposal must not look like success."""
        warnings = ai._coverage_warnings(self.PROMPT, SNAPSHOT, [])
        assert 'None are included' in warnings[0]

    def test_silent_when_every_section_is_covered(self):
        ops, _ = _validate([{'action': 'update_class', 'class_id': cid,
                             'fields': {'supply_fee': 35}}
                            for cid in ('c1', 'c2', 'c3', 'c4')])
        assert ai._coverage_warnings(self.PROMPT, SNAPSHOT, ops) == []

    def test_a_class_the_prompt_never_mentions_is_not_warned_about(self):
        ops, _ = _validate([{'action': 'update_class', 'class_id': 'c1',
                             'fields': {'supply_fee': 35}}])
        warnings = ai._coverage_warnings('change the supply fee on open art studio',
                                         SNAPSHOT, ops)
        assert all('Ukulele' not in w for w in warnings)


@pytest.mark.unit
class TestProposeSurfacesMoneyFirst:
    def test_money_warning_leads_the_list(self):
        raw = {'summary': 'Set the supply fee', 'operations': [
            {'action': 'update_class', 'class_id': 'c1', 'fields': {'price_cents': 3500}}]}
        service = ai.SisScheduleAIService()
        with patch.object(service, 'generate_json', return_value=raw), \
             patch.object(ai, '_org_snapshot', return_value=SNAPSHOT):
            result = service.propose(ORG, 'change the supply fee to $35 on open art studio')
        assert result['warnings'][0].startswith('Money:')
