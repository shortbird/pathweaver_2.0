"""
Utility functions for handling the pillar system.
Updated January 2025: Simplified to single-word pillar names
Consolidated from pillar_utils.py and pillar_mapping.py

The vocabulary itself is NOT declared here any more. Keys, display names and
the legacy spellings come from generated/pillars.py, which is emitted from
shared/data/pillars.json -- the file the web app and the mobile app also read.
A TypeScript module could never have been canonical for this process, which is
why the same five pillars were spelled out in seven backend modules and two of
them disagreed. What stays here is what is true of the pillars only for the
BACKEND: the quest-creator-facing descriptions, the subcategory lists and the
mastery-level curve.
"""
from generated.pillars import (
    PILLAR_KEYS as _CANONICAL_PILLAR_KEYS,
    PILLAR_COLORS as _PILLAR_COLORS,
    PILLAR_LABELS as _PILLAR_LABELS,
    PILLAR_LEGACY_ALIASES as _PILLAR_LEGACY_ALIASES,
)
from utils.logger import get_logger

logger = get_logger(__name__)


# Pillar keys (lowercase for database storage)
PILLAR_KEYS = list(_CANONICAL_PILLAR_KEYS)

# Display names (capitalized for frontend)
PILLAR_DISPLAY_NAMES = dict(_PILLAR_LABELS)

# Mapping from old pillar names to new (for backward compatibility during
# transition). Covers the underscore keys, the shortened keys AND the old '&'
# display names, because callers hand this whatever a row happens to hold.
LEGACY_PILLAR_MAPPINGS = dict(_PILLAR_LEGACY_ALIASES)


# Backend-only pillar metadata. These descriptions are written for quest
# creators and are NOT the ones the clients render -- config/pillars.py serves
# those, from the same generated module. Two audiences, two texts, one
# vocabulary.
_DESCRIPTIONS = {
    'art': 'Original creation, artistic expression, innovation',
    'stem': 'Analysis, problem-solving, technical skills, research',
    'communication': 'Expression, connection, teaching, sharing ideas',
    'civics': 'Understanding context, community impact, global awareness',
    'wellness': 'Physical activity, practical skills, personal development',
}

# Icon names in this module are lucide-style; config/pillars.py carries the
# Heroicons names the web app uses. An icon is a property of a surface.
_ICONS = {
    'art': 'palette',
    'stem': 'flask',
    'communication': 'message-circle',
    'civics': 'globe',
    'wellness': 'heart',
}

_SUBCATEGORIES = {
    'art': [
        'Visual Arts',
        'Music',
        'Drama & Theater',
        'Creative Writing',
        'Digital Media',
        'Design'
    ],
    'stem': [
        'Mathematics',
        'Biology',
        'Chemistry',
        'Physics',
        'Computer Science',
        'Engineering',
        'Data Science'
    ],
    'communication': [
        'English',
        'Foreign Languages',
        'Journalism',
        'Public Speaking',
        'Digital Communication',
        'Literature'
    ],
    'civics': [
        'History',
        'Geography',
        'Social Studies',
        'World Cultures',
        'Civics & Government',
        'Psychology',
        'Sociology'
    ],
    'wellness': [
        'Physical Education',
        'Health & Nutrition',
        'Personal Finance',
        'Life Skills',
        'Mental Wellness',
        'Outdoor Education',
        'Sports & Athletics'
    ],
}

# Full pillar definitions with metadata. Built rather than typed out: the name
# and the colour come from the generated module, so this dict cannot be the
# place a pillar gets renamed or recoloured for the backend alone. That is what
# happened before 2026-09-04, when civics and wellness were each rendered in
# the other's colour on the web while this file was right.
PILLARS = {
    key: {
        'name': PILLAR_DISPLAY_NAMES[key],
        'description': _DESCRIPTIONS[key],
        'color': _PILLAR_COLORS[key],
        'icon': _ICONS[key],
        'subcategories': _SUBCATEGORIES[key],
    }
    for key in PILLAR_KEYS
}


def get_pillar_info(pillar_key):
    """Get full pillar information."""
    return PILLARS.get(pillar_key, {})

def get_pillar_name(pillar_key):
    """Get display name for a pillar."""
    info = get_pillar_info(pillar_key)
    return info.get('name', pillar_key)

def get_pillar_color(pillar_key):
    """Get color for a pillar."""
    info = get_pillar_info(pillar_key)
    return info.get('color', '#999999')

def get_pillar_subcategories(pillar_key):
    """Get subcategories for a pillar."""
    info = get_pillar_info(pillar_key)
    return info.get('subcategories', [])

def is_valid_pillar(pillar_key):
    """Check if a pillar key is valid."""
    return pillar_key in PILLARS

def is_valid_subcategory(pillar_key, subcategory):
    """Check if a subcategory is valid for a pillar."""
    subcategories = get_pillar_subcategories(pillar_key)
    return subcategory in subcategories

def get_all_pillars():
    """Get all pillar keys and names."""
    return [(key, info['name']) for key, info in PILLARS.items()]

def get_xp_distribution_template():
    """Get a template for XP distribution across pillars."""
    return {key: 0 for key in PILLARS.keys()}

def calculate_mastery_level(total_xp):
    """Calculate mastery level from total XP."""
    if total_xp <= 500:
        return 1
    elif total_xp <= 1500:
        return 2
    elif total_xp <= 3500:
        return 3
    elif total_xp <= 7000:
        return 4
    elif total_xp <= 12500:
        return 5
    elif total_xp <= 20000:
        return 6
    elif total_xp <= 30000:
        return 7
    elif total_xp <= 45000:
        return 8
    elif total_xp <= 65000:
        return 9
    elif total_xp <= 90000:
        return 10
    elif total_xp <= 120000:
        return 11
    elif total_xp <= 160000:
        return 12
    else:
        # Level 13+ - scales by 40,000 XP per level
        return 13 + ((total_xp - 160000) // 40000)

def get_xp_for_next_level(current_xp):
    """Get XP required for next level."""
    level = calculate_mastery_level(current_xp)

    # XP thresholds for each level
    thresholds = [
        500, 1500, 3500, 7000, 12500, 20000,
        30000, 45000, 65000, 90000, 120000, 160000
    ]

    if level <= 12:
        next_threshold = thresholds[level - 1] if level <= len(thresholds) else None
        if next_threshold:
            return next_threshold - current_xp

    # For levels 13+
    next_level = level + 1
    next_threshold = 160000 + ((next_level - 13) * 40000)
    return next_threshold - current_xp

def format_pillar_for_frontend(pillar_key):
    """Format pillar data for frontend consumption."""
    info = get_pillar_info(pillar_key)
    if not info:
        return None

    return {
        'key': pillar_key,
        'name': info['name'],
        'description': info['description'],
        'color': info['color'],
        'icon': info['icon'],
        'subcategories': info['subcategories']
    }


# Pillar name normalization functions (from pillar_mapping.py)

def normalize_pillar_name(pillar_name: str) -> str:
    """
    Convert any pillar name format to the new lowercase format

    Args:
        pillar_name: Pillar name in any format

    Returns:
        Pillar name in new lowercase format (art, stem, communication, civics, wellness)

    Raises:
        ValueError: If pillar name is not recognized
    """
    if not pillar_name:
        raise ValueError("Pillar name cannot be empty")

    # Check if it's already in the correct format
    if pillar_name in PILLAR_KEYS:
        return pillar_name

    # Try to map from legacy formats
    mapped = LEGACY_PILLAR_MAPPINGS.get(pillar_name)
    if mapped:
        return mapped

    # Try case-insensitive matching
    pillar_lower = pillar_name.lower()
    if pillar_lower in PILLAR_KEYS:
        return pillar_lower

    # Try case-insensitive matching for legacy names
    for key, value in LEGACY_PILLAR_MAPPINGS.items():
        if key.lower() == pillar_lower:
            return value

    # If no match found, raise error
    raise ValueError(f"Unknown pillar name: {pillar_name}")


def get_display_name(pillar_key: str) -> str:
    """
    Get display name for a pillar key

    Args:
        pillar_key: Pillar key (art, stem, communication, civics, wellness)

    Returns:
        Capitalized display name (Art, STEM, Communication, Civics, Wellness)
    """
    # First normalize to ensure we have the correct key
    normalized = normalize_pillar_name(pillar_key)
    return PILLAR_DISPLAY_NAMES.get(normalized, normalized.capitalize())


def validate_pillar(pillar_name: str) -> bool:
    """
    Check if a pillar name is valid (can be mapped to new format)

    Args:
        pillar_name: Pillar name to validate

    Returns:
        True if valid, False otherwise
    """
    try:
        normalize_pillar_name(pillar_name)
        return True
    except ValueError:
        return False
