"""
Pillar name mapping utilities
Handles conversion between different pillar name formats used throughout the system
"""

# Full pillar names as stored in database
FULL_PILLAR_NAMES = [
    "STEM & Logic",
    "Life & Wellness",
    "Language & Communication",
    "Society & Culture",
    "Arts & Creativity"
]

# Mapping from various formats to full names
PILLAR_MAPPINGS = {
    # Underscore format (used in AI generation)
    "stem_logic": "STEM & Logic",
    "life_wellness": "Life & Wellness",
    "language_communication": "Language & Communication",
    "society_culture": "Society & Culture",
    "arts_creativity": "Arts & Creativity",
    
    # Shortened format (legacy)
    "creativity": "Arts & Creativity",
    "critical_thinking": "STEM & Logic",
    "practical_skills": "Life & Wellness",
    "communication": "Language & Communication",
    "cultural_literacy": "Society & Culture",
    
    # Already correct format
    "STEM & Logic": "STEM & Logic",
    "Life & Wellness": "Life & Wellness",
    "Language & Communication": "Language & Communication",
    "Society & Culture": "Society & Culture",
    "Arts & Creativity": "Arts & Creativity"
}

# Reverse mapping from full names to underscore format (for AI)
PILLAR_TO_UNDERSCORE = {
    "STEM & Logic": "stem_logic",
    "Life & Wellness": "life_wellness",
    "Language & Communication": "language_communication",
    "Society & Culture": "society_culture",
    "Arts & Creativity": "arts_creativity"
}

def normalize_pillar_name(pillar_name: str) -> str:
    """
    Convert any pillar name format to the full database format
    
    Args:
        pillar_name: Pillar name in any format
        
    Returns:
        Full pillar name as stored in database
        
    Raises:
        ValueError: If pillar name is not recognized
    """
    if not pillar_name:
        raise ValueError("Pillar name cannot be empty")
    
    # Check if it's already in the correct format
    if pillar_name in FULL_PILLAR_NAMES:
        return pillar_name
    
    # Try to map from other formats
    mapped = PILLAR_MAPPINGS.get(pillar_name)
    if mapped:
        return mapped
    
    # Try case-insensitive matching
    pillar_lower = pillar_name.lower()
    for key, value in PILLAR_MAPPINGS.items():
        if key.lower() == pillar_lower:
            return value
    
    # If no match found, raise error
    raise ValueError(f"Unknown pillar name: {pillar_name}")

def pillar_to_underscore(pillar_name: str) -> str:
    """
    Convert full pillar name to underscore format (for AI generation)
    
    Args:
        pillar_name: Full pillar name
        
    Returns:
        Underscore format pillar name
    """
    # First normalize to ensure we have the full name
    full_name = normalize_pillar_name(pillar_name)
    return PILLAR_TO_UNDERSCORE.get(full_name, "arts_creativity")  # Default to arts_creativity

def validate_pillar(pillar_name: str) -> bool:
    """
    Check if a pillar name is valid (can be mapped to full format)
    
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