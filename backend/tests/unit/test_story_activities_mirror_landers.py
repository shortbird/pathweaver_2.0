"""The story activity slugs and the www landers must agree.

A story whose activity_slug matches a lander gets that lander's card on the
page. marketing/src/data/landers.ts is the list of landers; this parses it so
adding a lander without adding the slug here (or the reverse) fails the build.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from services.stories.activities import (
    ACTIVITY_ICONS,
    LANDER_SLUGS,
    RECEIPT_ICONS,
    STORY_ACTIVITY_SLUGS,
    default_icon,
    normalize_activity_slug,
    valid_icon,
)

pytestmark = pytest.mark.unit

REPO_ROOT = Path(__file__).resolve().parents[3]
LANDERS_TS = REPO_ROOT / 'marketing' / 'src' / 'data' / 'landers.ts'
RECEIPT_ASTRO = REPO_ROOT / 'marketing' / 'src' / 'components' / 'Receipt.astro'


def _lander_slugs() -> list:
    text = LANDERS_TS.read_text(encoding='utf-8')
    # Only top-level lander entries declare `slug:`; the receipt sub-object
    # does not, so this is exactly one match per lander.
    return re.findall(r"^\s{4}slug:\s*'([a-z0-9-]+)'", text, flags=re.MULTILINE)


def _lander_icons() -> set:
    text = LANDERS_TS.read_text(encoding='utf-8')
    return set(re.findall(r"icon:\s*'([a-z]+)'", text))


def _receipt_icons() -> set:
    text = RECEIPT_ASTRO.read_text(encoding='utf-8')
    match = re.search(r"icon\?:\s*((?:'[a-z]+'\s*\|\s*)+'[a-z]+')", text)
    assert match, 'Receipt.astro no longer declares its icon union where this test looks'
    return set(re.findall(r"'([a-z]+)'", match.group(1)))


def test_landers_file_exists():
    assert LANDERS_TS.is_file(), f'{LANDERS_TS} moved; update this test and activities.py'


def test_story_slugs_mirror_the_landers_in_order():
    slugs = _lander_slugs()
    assert slugs, 'no lander slugs parsed from landers.ts'
    assert tuple(slugs) == LANDER_SLUGS
    assert STORY_ACTIVITY_SLUGS == LANDER_SLUGS + ('other',)


def test_every_activity_has_an_icon_from_the_receipt_set():
    receipt = _receipt_icons()
    assert receipt == set(RECEIPT_ICONS)
    for slug in STORY_ACTIVITY_SLUGS:
        assert ACTIVITY_ICONS[slug] in receipt


def test_lander_icons_are_the_ones_the_receipt_draws():
    assert _lander_icons() <= set(RECEIPT_ICONS)


def test_unknown_slug_becomes_other():
    assert normalize_activity_slug('Soccer') == 'soccer'
    assert normalize_activity_slug('rocketry') == 'other'
    assert normalize_activity_slug(None) == 'other'


def test_icon_validation_falls_back_by_activity_then_subject():
    assert valid_icon('music', 'soccer', 'pe') == 'music'
    assert valid_icon('trumpet', 'soccer', 'pe') == 'ball'
    assert valid_icon(None, 'other', 'fine_arts') == 'brush'
    assert default_icon('other', 'unknown_subject') == 'run'
