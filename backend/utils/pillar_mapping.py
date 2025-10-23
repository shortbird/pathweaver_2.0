"""
Pillar name mapping utilities
Handles conversion between different pillar name formats used throughout the system
Updated January 2025: Simplified to single-word pillar names
"""
from utils.logger import get_logger

logger = get_logger(__name__)


# Pillar names (lowercase keys for database storage)
PILLAR_KEYS = ['art', 'stem', 'communication', 'civics', 'wellness']

# Display names (capitalized for frontend)
PILLAR_DISPLAY_NAMES = {
    'art': 'Art',
    'stem': 'STEM',
    'communication': 'Communication',
    'civics': 'Civics',
    'wellness': 'Wellness'
}

# Mapping from old pillar names to new (for backward compatibility during transition)
LEGACY_PILLAR_MAPPINGS = {
    # Old underscore format
    'stem_logic': 'stem',
    'arts_creativity': 'art',
    'language_communication': 'communication',
    'society_culture': 'civics',
    'life_wellness': 'wellness',

    # Old shortened format
    'creativity': 'art',
    'critical_thinking': 'stem',
    'practical_skills': 'wellness',
    'cultural_literacy': 'civics',

    # Old display names
    'STEM & Logic': 'stem',
    'Arts & Creativity': 'art',
    'Language & Communication': 'communication',
    'Society & Culture': 'civics',
    'Life & Wellness': 'wellness',
}

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
