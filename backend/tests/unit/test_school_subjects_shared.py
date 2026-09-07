"""The school-subject vocabulary is one list, in shared/subjects.json.

Keys and display names are canonical HERE -- the keys are a database enum and
the names are what a transcript line says -- and both clients derive from the
JSON. This test is what makes that true rather than aspirational: add a subject
to SCHOOL_SUBJECTS without adding it to the shared file and this fails, before
the web picker and the mobile picker quietly disagree about how many subjects
exist.

Written 2026-09-07 (QF-01), replacing a comment in
frontend/src/constants/subjects.js that asked whoever edited it to keep the
backend enum and the mobile metadata in step by hand. They had already drifted.
"""

import json
from pathlib import Path

from utils.school_subjects import SCHOOL_SUBJECTS, SCHOOL_SUBJECT_DISPLAY_NAMES

SHARED = Path(__file__).resolve().parents[3] / 'shared' / 'subjects.json'


def _shared():
    with SHARED.open() as fh:
        return json.load(fh)['subjects']


def test_same_subjects_in_the_same_order():
    # Order matters: it is the order a transcript lists them in, and both
    # clients render the list as it comes.
    assert [s['key'] for s in _shared()] == SCHOOL_SUBJECTS


def test_same_display_names():
    assert {s['key']: s['name'] for s in _shared()} == SCHOOL_SUBJECT_DISPLAY_NAMES


def test_every_subject_carries_what_the_clients_render():
    for s in _shared():
        assert s['description'].strip(), f"{s['key']} has no description"
        # Accents are read straight into style attributes on both clients.
        assert s['accent'].startswith('#') and len(s['accent']) == 7, s['key']
