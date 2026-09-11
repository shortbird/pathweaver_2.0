"""The activity slugs a story may carry, mirroring the www landers.

`marketing/src/data/landers.ts` is the list of programmatic landing pages
(/l/piano, /l/soccer, ...). A story whose `activity_slug` matches one of them
gets that lander's card in its "What it counted for" section, so the two lists
must agree. tests/unit/test_story_activities_mirror_landers.py parses the
TypeScript file and fails when they drift.

`other` is the escape hatch for a story that fits no lander.
"""

from __future__ import annotations

from typing import Optional

#: Slugs of the landers, in the order landers.ts declares them.
LANDER_SLUGS = ('piano', 'soccer', 'camp', 'art', 'coding', 'volunteering')

STORY_ACTIVITY_SLUGS = LANDER_SLUGS + ('other',)

#: What the receipt says when the drafter does not pick an icon, by activity.
ACTIVITY_ICONS = {
    'piano': 'music',
    'soccer': 'ball',
    'camp': 'flask',
    'art': 'brush',
    'coding': 'controller',
    'volunteering': 'heart',
    'other': 'run',
}

#: Receipt.astro's icon set. The drafter picks one; Python validates it.
RECEIPT_ICONS = ('ball', 'controller', 'music', 'brush', 'flask', 'heart', 'run', 'pan')

#: A default icon by transcript subject key, for when the drafter's choice is
#: not in the set (or when there is no drafter, as in a manual story).
SUBJECT_ICONS = {
    'pe': 'ball',
    'fine_arts': 'brush',
    'science': 'flask',
    'digital_literacy': 'controller',
    'cte': 'pan',
    'health': 'heart',
    'social_studies': 'heart',
    'language_arts': 'brush',
    'math': 'flask',
    'financial_literacy': 'pan',
    'electives': 'run',
}


def normalize_activity_slug(value: Optional[str]) -> str:
    slug = (value or '').strip().lower()
    return slug if slug in STORY_ACTIVITY_SLUGS else 'other'


def default_icon(activity_slug: Optional[str], subject_key: Optional[str]) -> str:
    """A receipt icon when the model's pick is missing or invalid."""
    slug = normalize_activity_slug(activity_slug)
    if slug != 'other':
        return ACTIVITY_ICONS[slug]
    return SUBJECT_ICONS.get((subject_key or '').strip().lower(), 'run')


def valid_icon(value: Optional[str], activity_slug: Optional[str],
               subject_key: Optional[str]) -> str:
    icon = (value or '').strip().lower()
    return icon if icon in RECEIPT_ICONS else default_icon(activity_slug, subject_key)
