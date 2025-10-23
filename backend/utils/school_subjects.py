"""
School subjects utilities for the quest system.
Handles validation and mapping of school subjects separate from XP pillars.
"""
from utils.logger import get_logger

logger = get_logger(__name__)


# School subjects enum matching database type
SCHOOL_SUBJECTS = [
    'language_arts',
    'math',
    'science', 
    'social_studies',
    'financial_literacy',
    'health',
    'pe',
    'fine_arts',
    'cte',
    'digital_literacy',
    'electives'
]

# Display names for school subjects
SCHOOL_SUBJECT_DISPLAY_NAMES = {
    'language_arts': 'Language Arts',
    'math': 'Math',
    'science': 'Science',
    'social_studies': 'Social Studies',
    'financial_literacy': 'Financial Literacy',
    'health': 'Health',
    'pe': 'PE',
    'fine_arts': 'Fine Arts',
    'cte': 'CTE',
    'digital_literacy': 'Digital Literacy',
    'electives': 'Electives'
}

# Subject descriptions for quest creators
SCHOOL_SUBJECT_DESCRIPTIONS = {
    'language_arts': 'Reading, writing, literature, and language skills',
    'math': 'Mathematics, algebra, geometry, statistics, and quantitative reasoning',
    'science': 'Biology, chemistry, physics, earth science, and scientific method',
    'social_studies': 'History, geography, civics, government, and social sciences',
    'financial_literacy': 'Personal finance, budgeting, investing, and economic principles',
    'health': 'Health education, nutrition, wellness, and safety',
    'pe': 'Physical education, sports, fitness, and movement',
    'fine_arts': 'Visual arts, music, theater, dance, and creative expression',
    'cte': 'Career and technical education, vocational skills, and applied learning',
    'digital_literacy': 'Technology skills, computer science, and digital citizenship',
    'electives': 'Specialized interests, hobbies, and supplemental learning'
}

# Default subject mappings based on pillar (for migration/suggestions)
PILLAR_TO_SUBJECTS = {
    # Current pillar names (January 2025)
    'art': ['fine_arts'],
    'stem': ['math', 'science'],
    'wellness': ['health', 'pe'],
    'communication': ['language_arts'],
    'civics': ['social_studies'],
    # Legacy pillar mappings (for backward compatibility)
    'arts_creativity': ['fine_arts'],
    'stem_logic': ['math', 'science'],
    'life_wellness': ['health', 'pe'],
    'language_communication': ['language_arts'],
    'society_culture': ['social_studies'],
    'creativity': ['fine_arts'],
    'critical_thinking': ['math', 'science'],
    'practical_skills': ['health', 'pe'],
    'cultural_literacy': ['social_studies']
}

def validate_school_subjects(subjects):
    """
    Validate that all provided school subjects are valid.
    
    Args:
        subjects: List of school subject strings
        
    Returns:
        tuple: (is_valid: bool, error_message: str)
    """
    if not subjects:
        return False, "At least one school subject must be selected"
    
    if not isinstance(subjects, list):
        return False, "School subjects must be provided as a list"
    
    # Check for duplicates
    if len(subjects) != len(set(subjects)):
        return False, "Duplicate school subjects are not allowed"
    
    # Validate each subject
    invalid_subjects = [s for s in subjects if s not in SCHOOL_SUBJECTS]
    if invalid_subjects:
        return False, f"Invalid school subjects: {', '.join(invalid_subjects)}"
    
    # Reasonable limit on number of subjects
    if len(subjects) > 5:
        return False, "Maximum of 5 school subjects can be selected per task"
    
    return True, ""

def get_display_name(subject_key):
    """Get display name for a school subject."""
    return SCHOOL_SUBJECT_DISPLAY_NAMES.get(subject_key, subject_key)

def get_description(subject_key):
    """Get description for a school subject."""
    return SCHOOL_SUBJECT_DESCRIPTIONS.get(subject_key, "")

def get_suggested_subjects_for_pillar(pillar):
    """Get suggested school subjects based on the selected pillar."""
    return PILLAR_TO_SUBJECTS.get(pillar, ['electives'])

def format_subjects_for_display(subjects):
    """Format school subjects list for display."""
    if not subjects:
        return "No subjects specified"
    
    display_names = [get_display_name(subject) for subject in subjects]
    
    if len(display_names) == 1:
        return display_names[0]
    elif len(display_names) == 2:
        return f"{display_names[0]} & {display_names[1]}"
    else:
        return f"{', '.join(display_names[:-1])} & {display_names[-1]}"

def get_all_subjects_with_info():
    """Get all school subjects with their display info."""
    return [
        {
            'key': subject,
            'name': get_display_name(subject),
            'description': get_description(subject)
        }
        for subject in SCHOOL_SUBJECTS
    ]

def normalize_subject_key(subject_input):
    """
    Normalize subject input to a valid subject key.
    Handles display names and variations.
    """
    if not subject_input:
        return None
    
    # Check if it's already a valid key
    if subject_input in SCHOOL_SUBJECTS:
        return subject_input
    
    # Create reverse mapping from display names to keys
    name_to_key = {name.lower(): key for key, name in SCHOOL_SUBJECT_DISPLAY_NAMES.items()}
    
    # Try case-insensitive matching
    subject_lower = subject_input.lower()
    if subject_lower in name_to_key:
        return name_to_key[subject_lower]
    
    # Try partial matching for common variations
    variations = {
        'physical education': 'pe',
        'phys ed': 'pe',
        'career tech': 'cte',
        'career technical': 'cte',
        'computer science': 'digital_literacy',
        'tech': 'digital_literacy',
        'technology': 'digital_literacy',
        'english': 'language_arts',
        'ela': 'language_arts',
        'mathematics': 'math',
        'maths': 'math',
        'economics': 'financial_literacy',
        'finance': 'financial_literacy',
        'art': 'fine_arts',
        'arts': 'fine_arts',
        'social science': 'social_studies',
        'history': 'social_studies',
        'geography': 'social_studies'
    }
    
    if subject_lower in variations:
        return variations[subject_lower]
    
    # Return None if no match found
    return None

def is_valid_subject(subject_key):
    """Check if a school subject key is valid."""
    return subject_key in SCHOOL_SUBJECTS