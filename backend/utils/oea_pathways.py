"""
OEA Diploma Plan pathways.

The three OEA diploma pathways are FIXED definitions (PRD V2 section 4.2), so they
live here as constants rather than in the database. Only a student's *selection*
is persisted (oea_enrollments.pathway_key). The /api/oea/pathways endpoint serves
these straight to the v2 frontend so the comparison UX has a single source of truth.

Every pathway requires 24 total credits (1 credit = 1 completed course). Each
requirement is a slot the student fills with credits in oea_credits. `subject_key`
maps a requirement to the platform school-subject taxonomy
(backend/utils/school_subjects.py) for transcript alignment where a clean 1:1
exists; it is None for OEA-only slots ("world_language", "health_pe", flexible
"student choice") that don't map to a single platform subject.
"""

PROGRAM_KEY = 'opened-academy'

# Partner keys accepted at signup (marketplace ?partner=... param). Kept as a set
# so registration can validate without importing the whole pathway machinery.
VALID_PROGRAM_KEYS = {PROGRAM_KEY}

PATHWAY_KEYS = ('open_balanced', 'traditional', 'college_bound')

# Each requirement: key (unique within a pathway), label, category, credits,
# and optional subject_key (platform school_subjects key).
PATHWAYS = {
    'open_balanced': {
        'key': 'open_balanced',
        'name': 'Open and Balanced',
        'tagline': 'Maximum flexibility',
        'description': 'A light foundation with every elective left to the student. '
                       'Best when you want the freedom to follow your interests.',
        'best_for': 'Families who want maximum flexibility and student-directed learning.',
        'total_credits': 24,
        'foundation_credits': 12,
        'elective_credits': 12,
        'requirements': [
            {'key': 'math', 'label': 'Math', 'category': 'foundation', 'credits': 3, 'subject_key': 'math'},
            {'key': 'language_arts', 'label': 'Language Arts', 'category': 'foundation', 'credits': 3, 'subject_key': 'language_arts'},
            {'key': 'science', 'label': 'Science', 'category': 'foundation', 'credits': 3, 'subject_key': 'science'},
            {'key': 'social_studies', 'label': 'Social Studies', 'category': 'foundation', 'credits': 3, 'subject_key': 'social_studies'},
            {'key': 'student_choice', 'label': 'Student Choice', 'category': 'elective', 'credits': 12, 'subject_key': 'electives'},
        ],
    },
    'traditional': {
        'key': 'traditional',
        'name': 'Traditionally Aligned',
        'tagline': 'Conventional high school structure',
        'description': 'Mirrors a conventional high school transcript with recommended '
                       'elective categories across the arts, wellness, and life skills.',
        'best_for': 'Families who want a structure that looks like a traditional high school.',
        'total_credits': 24,
        'foundation_credits': 13,
        'elective_credits': 11,
        'requirements': [
            {'key': 'language_arts', 'label': 'Language Arts', 'category': 'foundation', 'credits': 4, 'subject_key': 'language_arts'},
            {'key': 'math', 'label': 'Math', 'category': 'foundation', 'credits': 3, 'subject_key': 'math'},
            {'key': 'science', 'label': 'Science', 'category': 'foundation', 'credits': 3, 'subject_key': 'science'},
            {'key': 'social_studies', 'label': 'Social Studies', 'category': 'foundation', 'credits': 3, 'subject_key': 'social_studies'},
            {'key': 'the_arts', 'label': 'The Arts', 'category': 'elective', 'credits': 2, 'subject_key': 'fine_arts'},
            {'key': 'health_pe', 'label': 'Health & PE', 'category': 'elective', 'credits': 2, 'subject_key': None},
            {'key': 'cte', 'label': 'CTE', 'category': 'elective', 'credits': 1, 'subject_key': 'cte'},
            {'key': 'financial_literacy', 'label': 'Financial Literacy', 'category': 'elective', 'credits': 1, 'subject_key': 'financial_literacy'},
            {'key': 'student_choice', 'label': 'Student Choice', 'category': 'elective', 'credits': 5, 'subject_key': 'electives'},
        ],
    },
    'college_bound': {
        'key': 'college_bound',
        'name': 'College Bound',
        'tagline': 'Heaviest foundation, college-aligned',
        'description': 'The heaviest foundation load, aligned with college admissions '
                       'expectations. OEA recommends matching course selection to the '
                       'colleges the student is interested in attending.',
        'best_for': 'Students planning to apply to colleges with specific admissions requirements.',
        'total_credits': 24,
        'foundation_credits': 19,
        'elective_credits': 5,
        'requirements': [
            {'key': 'language_arts', 'label': 'Language Arts', 'category': 'foundation', 'credits': 4, 'subject_key': 'language_arts'},
            {'key': 'math', 'label': 'Math', 'category': 'foundation', 'credits': 4, 'subject_key': 'math'},
            {'key': 'science', 'label': 'Science', 'category': 'foundation', 'credits': 3, 'subject_key': 'science'},
            {'key': 'social_studies', 'label': 'Social Studies', 'category': 'foundation', 'credits': 3, 'subject_key': 'social_studies'},
            {'key': 'world_language', 'label': 'World Language', 'category': 'foundation', 'credits': 2, 'subject_key': None},
            {'key': 'foundation_choice', 'label': 'Student Choice', 'category': 'foundation', 'credits': 3, 'subject_key': 'electives'},
            {'key': 'student_choice', 'label': 'Student Choice', 'category': 'elective', 'credits': 5, 'subject_key': 'electives'},
        ],
    },
}


def list_pathways():
    """Return all pathway definitions as a list (ordered for display)."""
    return [PATHWAYS[k] for k in PATHWAY_KEYS]


def get_pathway(pathway_key):
    """Return a single pathway definition, or None if the key is invalid."""
    return PATHWAYS.get(pathway_key)


def is_valid_pathway(pathway_key):
    """True if pathway_key is one of the three OEA pathways."""
    return pathway_key in PATHWAYS


def is_valid_program_key(program_key):
    """True if program_key is an accepted partner program tag."""
    return program_key in VALID_PROGRAM_KEYS
