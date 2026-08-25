"""
Schools that switch Optio's five pillars off still write a valid pillar.

`user_quest_tasks.pillar` is NOT NULL. When an org sets
`feature_flags.hide_pillars`, the task-creation forms send no pillar at all, so
the server has to supply one — and "everything is STEM" would quietly wreck the
XP breakdown for every family at that school. It derives the pillar from the
diploma credit the family DID choose instead.

Hearthwood Academy, 2026-08-25: a parent wrote in that the pillars were
impossible to make sense of next to the diploma credits.
"""

import pytest

import app  # noqa: F401 — import graph ordering
from utils.school_subjects import (
    SCHOOL_SUBJECTS,
    SUBJECT_TO_PILLAR,
    pillar_for_subject,
)
from utils.pillar_utils import PILLAR_KEYS


@pytest.mark.parametrize('subject,expected', [
    ('language_arts', 'communication'),
    ('math', 'stem'),
    ('science', 'stem'),
    ('social_studies', 'civics'),
    ('health', 'wellness'),
    ('pe', 'wellness'),
    ('fine_arts', 'art'),
])
def test_subject_keys_map_to_their_pillar(subject, expected):
    assert pillar_for_subject(subject) == expected


@pytest.mark.parametrize('display,expected', [
    ('Language Arts', 'communication'),
    ('Fine Arts', 'art'),
    ('Social Studies', 'civics'),
    ('PE', 'wellness'),
])
def test_display_names_work_too(display, expected):
    """The frontend sends diploma_subjects keyed by display name."""
    assert pillar_for_subject(display) == expected


def test_every_school_subject_has_a_pillar():
    """No subject may fall through to the default by accident — a subject with
    no entry would silently file that family's work under STEM."""
    missing = [s for s in SCHOOL_SUBJECTS if s not in SUBJECT_TO_PILLAR]
    assert missing == [], f"school subjects with no pillar: {missing}"


def test_every_mapped_pillar_is_a_real_pillar():
    bad = {s: p for s, p in SUBJECT_TO_PILLAR.items() if p not in PILLAR_KEYS}
    assert bad == {}, f"subjects mapped to unknown pillars: {bad}"


@pytest.mark.parametrize('value', [None, '', 'not a subject', 'Underwater Basketry'])
def test_unknown_input_falls_back_rather_than_raising(value):
    """A missing or unrecognized credit must still produce a writable pillar:
    the column is NOT NULL, so raising here would fail the task creation."""
    assert pillar_for_subject(value) in PILLAR_KEYS


def test_default_is_overridable():
    assert pillar_for_subject(None, default='art') == 'art'


def test_school_payload_carries_the_flag():
    """Platform parents have no organization_id of their own, so `school` is the
    only channel the flag can reach them through."""
    from routes.auth.login.core import _school_payload

    on = _school_payload({'id': 'o1', 'name': 'Hearthwood Academy',
                          'feature_flags': {'hide_pillars': True}})
    assert on['hide_pillars'] is True

    off = _school_payload({'id': 'o2', 'name': 'Somewhere Else',
                           'feature_flags': {}})
    assert off['hide_pillars'] is False

    # A row with no feature_flags at all must not blow up /me.
    assert _school_payload({'id': 'o3', 'name': 'No Flags'})['hide_pillars'] is False


def test_school_payload_never_leaks_the_flags_blob():
    from routes.auth.login.core import _school_payload

    payload = _school_payload({
        'id': 'o1', 'name': 'Hearthwood Academy',
        'feature_flags': {'hide_pillars': True, 'stripe_secret': 'sk_live_nope'},
    })
    assert set(payload) == {'id', 'name', 'homepage', 'hide_pillars'}
