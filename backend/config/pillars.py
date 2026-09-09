"""
Pillar Definitions - the client-facing view.

The vocabulary -- keys, display names, colours, descriptions -- comes from
generated/pillars.py, emitted from shared/data/pillars.json, which the web app
and the mobile app read too. What is declared here is only what belongs to a
SCREEN rather than to a pillar: the Tailwind gradient string, the Heroicons
name, and the four subcategories the pickers offer.

This module and utils/pillar_utils.py are both real and both needed: they carry
different descriptions for different audiences. What they must never again do
is carry different COLOURS, which they did until 2026-09-04 -- civics and
wellness were swapped on the web relative to everywhere else.
"""

from generated.pillars import (
    PILLAR_COLORS as _COLORS,
    PILLAR_DESCRIPTIONS as _DESCRIPTIONS,
    PILLAR_LABELS as _LABELS,
)

# The order below is NOT decoration. GET /api/pillars returns it as `keys`, a
# JSON array, so it is part of the response rather than an implementation
# detail. tests/unit/test_pillar_constants_generated.py asserts it is a
# permutation of the canonical keys, which is the property that matters: this
# list cannot add, drop or misspell a pillar, but it may order them.
_DISPLAY_ORDER = ('stem', 'wellness', 'communication', 'civics', 'art')

# Web-only presentation. A gradient is a Tailwind class string and an icon name
# is Heroicons; neither is true of the pillar on mobile or in the database, so
# neither belongs in the shared JSON.
_GRADIENTS = {
    'stem': 'from-[#2469D1] to-[#1B4FA3]',
    'wellness': 'from-[#E65C5C] to-[#D43F3F]',
    'communication': 'from-[#3DA24A] to-[#2E8A3A]',
    'civics': 'from-[#FF9028] to-[#E67A1A]',
    'art': 'from-[#AF56E5] to-[#9945D1]',
}

_ICONS = {
    'stem': 'BeakerIcon',
    'wellness': 'HeartIcon',
    'communication': 'ChatBubbleLeftRightIcon',
    'civics': 'UserGroupIcon',
    'art': 'PaintBrushIcon',
}

_SUBCATEGORIES = {
    'stem': ['Science', 'Technology', 'Engineering', 'Mathematics'],
    'wellness': ['Physical Health', 'Mental Health', 'Mindfulness', 'Nutrition'],
    'communication': ['Writing', 'Speaking', 'Listening', 'Collaboration'],
    'civics': ['Community', 'Leadership', 'Civic Action', 'Democracy'],
    'art': ['Visual Arts', 'Music', 'Performance', 'Design'],
}

PILLARS = {
    key: {
        'display_name': _LABELS[key],
        'description': _DESCRIPTIONS[key],
        'color': _COLORS[key],
        'gradient': _GRADIENTS[key],
        'icon': _ICONS[key],
        'subcategories': _SUBCATEGORIES[key],
    }
    for key in _DISPLAY_ORDER
}

# Helper functions
def get_pillar_color(pillar: str) -> str:
    """Get color for pillar, with fallback to art."""
    return PILLARS.get(pillar.lower(), PILLARS['art'])['color']

def get_pillar_display_name(pillar: str) -> str:
    """Get display name for pillar, with fallback."""
    return PILLARS.get(pillar.lower(), PILLARS['art'])['display_name']

def get_pillar_gradient(pillar: str) -> str:
    """Get gradient for pillar, with fallback."""
    return PILLARS.get(pillar.lower(), PILLARS['art'])['gradient']

def get_pillar_icon(pillar: str) -> str:
    """Get icon for pillar, with fallback."""
    return PILLARS.get(pillar.lower(), PILLARS['art'])['icon']

def get_pillar_description(pillar: str) -> str:
    """Get description for pillar, with fallback."""
    return PILLARS.get(pillar.lower(), PILLARS['art'])['description']

def get_all_pillar_keys() -> list:
    """Get list of all pillar keys."""
    return list(PILLARS.keys())

def is_valid_pillar(pillar: str) -> bool:
    """Check if pillar key is valid."""
    return pillar.lower() in PILLARS

def get_pillar_data(pillar: str) -> dict:
    """Get complete pillar data dictionary, with fallback."""
    return PILLARS.get(pillar.lower(), PILLARS['art'])
