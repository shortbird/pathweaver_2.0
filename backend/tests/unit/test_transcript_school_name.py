"""The school a transcript (and so a diploma) names.

A microschool that acts as an extension of Optio Academy keeps its students in
every other way; only the diploma changes hands. So the header of a transcript
issued under the Academy's accreditation names Optio Academy, and every other
transcript keeps the student's own school.
"""

import pytest

from utils.accreditation import (
    ACCREDITED_SCHOOL_NAME, resolve_transcript_accreditation, transcript_school_name,
)


@pytest.mark.unit
def test_an_extension_schools_transcript_names_optio_academy():
    accreditation = resolve_transcript_accreditation(
        'micro-org', {'name': 'Apogee Cache Valley', 'accreditation_source': 'optio'})
    assert transcript_school_name('Apogee Cache Valley', accreditation) == 'Optio Academy'


@pytest.mark.unit
def test_a_school_with_its_own_or_no_accreditation_keeps_its_name():
    for source in ('self', 'none'):
        accreditation = resolve_transcript_accreditation(
            'org', {'name': 'Riverside', 'accreditation_source': source})
        assert transcript_school_name('Riverside', accreditation) == 'Riverside'


@pytest.mark.unit
def test_a_platform_direct_student_is_an_optio_academy_student():
    assert transcript_school_name(None, resolve_transcript_accreditation(None)) == 'Optio Academy'


@pytest.mark.unit
def test_the_name_matches_the_web_constant():
    import pathlib
    web = (pathlib.Path(__file__).resolve().parents[3]
           / 'web' / 'src' / 'constants' / 'accreditation.js').read_text()
    assert f"ACCREDITED_SCHOOL_NAME = '{ACCREDITED_SCHOOL_NAME}'" in web
