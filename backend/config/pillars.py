"""
Pillar Definitions - Single Source of Truth

All pillar names, colors, icons, and metadata defined here.
Import this module instead of hardcoding pillar data.
"""

PILLARS = {
    'stem': {
        'display_name': 'STEM',
        'description': 'Science, Technology, Engineering, and Mathematics',
        'color': '#2469D1',
        'gradient': 'from-[#2469D1] to-[#1B4FA3]',
        'icon': 'BeakerIcon',
        'subcategories': ['Science', 'Technology', 'Engineering', 'Mathematics'],
    },
    'wellness': {
        'display_name': 'Wellness',
        'description': 'Physical and mental health, mindfulness, and self-care',
        'color': '#FF9028',
        'gradient': 'from-[#FF9028] to-[#E67A1A]',
        'icon': 'HeartIcon',
        'subcategories': ['Physical Health', 'Mental Health', 'Mindfulness', 'Nutrition'],
    },
    'communication': {
        'display_name': 'Communication',
        'description': 'Writing, speaking, listening, and interpersonal skills',
        'color': '#3DA24A',
        'gradient': 'from-[#3DA24A] to-[#2E8A3A]',
        'icon': 'ChatBubbleLeftRightIcon',
        'subcategories': ['Writing', 'Speaking', 'Listening', 'Collaboration'],
    },
    'civics': {
        'display_name': 'Civics',
        'description': 'Community engagement, leadership, and civic responsibility',
        'color': '#E65C5C',
        'gradient': 'from-[#E65C5C] to-[#D43F3F]',
        'icon': 'UserGroupIcon',
        'subcategories': ['Community', 'Leadership', 'Civic Action', 'Democracy'],
    },
    'art': {
        'display_name': 'Art',
        'description': 'Creative expression through visual arts, music, and performance',
        'color': '#AF56E5',
        'gradient': 'from-[#AF56E5] to-[#9945D1]',
        'icon': 'PaintBrushIcon',
        'subcategories': ['Visual Arts', 'Music', 'Performance', 'Design'],
    },
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
