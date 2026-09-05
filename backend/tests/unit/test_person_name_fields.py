"""
Guards "one name, everywhere" across the SIS.

iCreate, 2026-08-25: "Can we resolve that students' names are different in
their directory compared to the CLP tab? We've got nicknames and proper flying
around."

Two things had drifted:

1. `_full_name` / `_student_name` was pasted into ten services, and the copies
   disagreed on whether `display_name` or `first last` wins when there is no
   preferred name.
2. Forty-odd queries selected the name columns but not `preferred_name`, so
   their helper never saw the nickname. Whether a screen showed "Montie Adams"
   or "Monroe Adams" came down to what its query happened to ask for.

These tests fail if either drift comes back.
"""

import re
from pathlib import Path

import pytest

from utils.person_name import full_name, legal_name

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SERVICES = BACKEND_ROOT / 'services'

# Everyday staff and parent screens: the name people actually use.
#
# Official records are deliberately absent — transcripts, report cards, signed
# forms and enrollment paperwork carry the legal name, which is what
# `legal_name` is for. Adding one of these here would put a nickname on a
# document that leaves the building.
EVERYDAY_SERVICES = [
    'sis_billing_alerts', 'sis_billing_service', 'sis_community_service', 'sis_coordinator_service',
    'sis_engagement_service', 'sis_enrollment_waitlist_service', 'sis_exception_service',
    'sis_parent_service', 'sis_planned_absence_service', 'sis_registration_service',
    'sis_service', 'sis_staff_service', 'sis_tuition_service', 'sis_waitlist_service',
    'sis_clp_service', 'sis_catalog_service', 'sis_attendance_service',
    'sis_person_service',
]

# The ten services that used to carry their own copy of the helper.
DELEGATING_SERVICES = {
    'sis_clp_service': '_full_name',
    'sis_attendance_service': '_student_name',
    'sis_catalog_service': '_full_name',
    'sis_registration_service': '_student_name',
    'sis_person_service': '_full_name',
    'sis_parent_service': '_student_name',
    'sis_planned_absence_service': '_student_name',
    'sis_service': '_full_name',
    'sis_staff_service': '_full_name',
    'sis_tuition_service': '_full_name',
}

SELECT_RE = re.compile(r"\.select\(\s*((?:'[^']*'\s*)+)\)", re.S)

MONROE = {'first_name': 'Monroe', 'last_name': 'Adams',
          'preferred_name': 'Montie', 'display_name': 'Monroe Adams'}


class TestFullName:
    def test_preferred_name_replaces_the_first_name_only(self):
        assert full_name(MONROE) == 'Montie Adams'

    def test_falls_back_to_the_legal_name_when_there_is_no_nickname(self):
        assert full_name({**MONROE, 'preferred_name': None}) == 'Monroe Adams'

    def test_does_not_double_a_surname_already_in_the_preferred_name(self):
        assert full_name({**MONROE, 'preferred_name': 'Montie Adams'}) == 'Montie Adams'

    def test_first_and_last_beat_display_name(self):
        # The two fallback orders disagreeing across services is half of what
        # "nicknames and proper flying around" was.
        u = {'first_name': 'Zach', 'last_name': 'Barlow', 'display_name': 'Zachary Barlow'}
        assert full_name(u) == 'Zach Barlow'

    def test_a_half_filled_record_keeps_its_display_name(self):
        # Only a first name on file: display_name is the more complete string,
        # and dropping to "Gina" would shorten names that already read fine.
        u = {'first_name': 'Gina', 'display_name': 'Gina One'}
        assert full_name(u) == 'Gina One'

    def test_falls_through_to_username_then_email(self):
        assert full_name({'username': 'zb'}) == 'zb'
        assert full_name({'email': 'zb@example.com'}) == 'zb@example.com'
        assert full_name(None) == 'Unnamed'
        assert full_name({}, 'Unknown') == 'Unknown'

    def test_legal_name_never_uses_the_nickname(self):
        assert legal_name(MONROE) == 'Monroe Adams'


class TestOneHelper:
    @pytest.mark.parametrize('module,helper', sorted(DELEGATING_SERVICES.items()))
    def test_service_helper_agrees_with_the_shared_one(self, module, helper):
        mod = __import__(f'services.{module}', fromlist=[helper])
        assert getattr(mod, helper)(MONROE) == full_name(MONROE)


class TestPreferredNameIsAlwaysSelected:
    """A query that reads a person's name must read their nickname too."""

    @pytest.mark.parametrize('module', EVERYDAY_SERVICES)
    def test_every_name_query_asks_for_preferred_name(self, module):
        src = (SERVICES / f'{module}.py').read_text()
        offenders = []
        for m in SELECT_RE.finditer(src):
            sel = ''.join(re.findall(r"'([^']*)'", m.group(1)))
            # Both halves of a name present means this row gets rendered as a
            # name somewhere. A lone `first_name` is an email greeting.
            if 'first_name' in sel and 'last_name' in sel and 'preferred_name' not in sel:
                offenders.append(f'line {src[:m.start()].count(chr(10)) + 1}: {sel}')
        assert not offenders, (
            f'{module} selects a name without preferred_name, so it will render the '
            f'legal name while the rest of the SIS renders the nickname:\n  '
            + '\n  '.join(offenders)
        )
