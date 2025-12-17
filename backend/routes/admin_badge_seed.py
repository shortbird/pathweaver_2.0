"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED - One-Time Seeding Script
- Seed endpoint for initial badge population
- One-time administrative operation, not regular CRUD
- Direct DB insert acceptable for batch seeding operations
- Not a candidate for repository pattern (infrequent, batch data loading)

Admin Badge Seeding Route
One-time endpoint to populate initial badges
"""

from flask import Blueprint, jsonify
from utils.auth.decorators import require_admin
from database import get_supabase_admin_client
from backend.repositories import (
    UserRepository,
    QuestRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin_badge_seed', __name__, url_prefix='/api/admin/seed')


# Using repository pattern for database access
@bp.route('/initial-badges', methods=['POST'])
@require_admin
def seed_initial_badges(user_id):
    """
    Seed the database with initial foundational badges.

    This is a one-time setup endpoint to populate the badge system
    with starter content across all 5 pillars.
    """
    supabase = get_supabase_admin_client()

    # Check if badges already exist
    existing = supabase.table('badges').select('id').limit(1).execute()
    if existing.data:
        return jsonify({
            'success': False,
            'error': 'Badges already exist in database. Delete existing badges first or add manually.',
            'existing_count': len(existing.data)
        }), 400

    # Define initial badges
    badges = [
        # STEM & Logic
        {
            'name': 'Systems Thinker',
            'identity_statement': 'I am becoming a systems thinker who sees connections everywhere',
            'description': 'Explore how things connect and interact in complex systems. Learn to identify patterns, understand feedback loops, and see the big picture while appreciating the details.',
            'pillar_primary': 'STEM & Logic',
            'pillar_weights': {"STEM & Logic": 70, "Society & Culture": 20, "Language & Communication": 10},
            'min_quests': 5,
            'min_xp': 1500,
            'status': 'active',
            'ai_generated': False
        },
        {
            'name': 'Scientific Investigator',
            'identity_statement': 'I can ask questions and design experiments to find answers',
            'description': 'Develop your scientific curiosity and investigation skills. Learn to form hypotheses, design experiments, collect data, and draw evidence-based conclusions.',
            'pillar_primary': 'STEM & Logic',
            'pillar_weights': {"STEM & Logic": 80, "Language & Communication": 15, "Society & Culture": 5},
            'min_quests': 6,
            'min_xp': 1800,
            'status': 'active',
            'ai_generated': False
        },
        {
            'name': 'Mathematical Reasoner',
            'identity_statement': 'I am developing my ability to think logically and solve problems',
            'description': 'Build your mathematical thinking skills. Explore patterns, relationships, and logical reasoning through hands-on problem solving and real-world applications.',
            'pillar_primary': 'STEM & Logic',
            'pillar_weights': {"STEM & Logic": 90, "Arts & Creativity": 10},
            'min_quests': 8,
            'min_xp': 2500,
            'status': 'active',
            'ai_generated': False
        },

        # Life & Wellness
        {
            'name': 'Mindful Practitioner',
            'identity_statement': 'I am cultivating awareness and presence in my daily life',
            'description': 'Develop mindfulness practices and emotional awareness. Learn techniques for stress management, focus, and living with intention and presence.',
            'pillar_primary': 'Life & Wellness',
            'pillar_weights': {"Life & Wellness": 80, "Language & Communication": 10, "Arts & Creativity": 10},
            'min_quests': 4,
            'min_xp': 1200,
            'status': 'active',
            'ai_generated': False
        },
        {
            'name': 'Physical Wellness Explorer',
            'identity_statement': 'I am discovering what helps my body feel strong and healthy',
            'description': 'Explore different aspects of physical wellness through movement, nutrition, and self-care. Find what works for your unique body and lifestyle.',
            'pillar_primary': 'Life & Wellness',
            'pillar_weights': {"Life & Wellness": 85, "STEM & Logic": 10, "Language & Communication": 5},
            'min_quests': 5,
            'min_xp': 1500,
            'status': 'active',
            'ai_generated': False
        },

        # Language & Communication
        {
            'name': 'Creative Storyteller',
            'identity_statement': 'I am becoming a storyteller who brings ideas to life through words',
            'description': 'Explore the art of narrative across different mediums. Develop your voice as a writer and learn to craft stories that engage, inspire, and connect with others.',
            'pillar_primary': 'Language & Communication',
            'pillar_weights': {"Language & Communication": 60, "Arts & Creativity": 30, "Society & Culture": 10},
            'min_quests': 7,
            'min_xp': 2000,
            'status': 'active',
            'ai_generated': False
        },
        {
            'name': 'Compelling Communicator',
            'identity_statement': 'I can express my ideas clearly and listen deeply to others',
            'description': 'Build your communication skills across writing, speaking, and listening. Learn to share ideas effectively, engage in meaningful dialogue, and understand different perspectives.',
            'pillar_primary': 'Language & Communication',
            'pillar_weights': {"Language & Communication": 70, "Society & Culture": 20, "Arts & Creativity": 10},
            'min_quests': 6,
            'min_xp': 1800,
            'status': 'active',
            'ai_generated': False
        },

        # Society & Culture
        {
            'name': 'Community Builder',
            'identity_statement': 'I am learning to bring people together and create positive change',
            'description': 'Explore what it means to be an active community member. Learn about collaboration, service, leadership, and making a difference in your community.',
            'pillar_primary': 'Society & Culture',
            'pillar_weights': {"Society & Culture": 70, "Language & Communication": 20, "Life & Wellness": 10},
            'min_quests': 5,
            'min_xp': 1500,
            'status': 'active',
            'ai_generated': False
        },
        {
            'name': 'Cultural Explorer',
            'identity_statement': 'I am discovering the rich diversity of human cultures and experiences',
            'description': 'Journey through different cultures, traditions, and perspectives. Develop cultural awareness, empathy, and appreciation for the beautiful diversity of human experience.',
            'pillar_primary': 'Society & Culture',
            'pillar_weights': {"Society & Culture": 75, "Language & Communication": 15, "Arts & Creativity": 10},
            'min_quests': 6,
            'min_xp': 1800,
            'status': 'active',
            'ai_generated': False
        },
        {
            'name': 'Historical Investigator',
            'identity_statement': 'I can uncover stories from the past and understand how they shape today',
            'description': 'Become a detective of history. Learn to research, analyze primary sources, and understand how past events and decisions continue to influence our present.',
            'pillar_primary': 'Society & Culture',
            'pillar_weights': {"Society & Culture": 75, "Language & Communication": 15, "STEM & Logic": 10},
            'min_quests': 7,
            'min_xp': 2000,
            'status': 'active',
            'ai_generated': False
        },

        # Arts & Creativity
        {
            'name': 'Visual Artist',
            'identity_statement': 'I am developing my ability to express ideas through visual media',
            'description': 'Explore various visual art forms from drawing and painting to digital design. Develop your artistic voice and learn to communicate through images.',
            'pillar_primary': 'Arts & Creativity',
            'pillar_weights': {"Arts & Creativity": 80, "Language & Communication": 10, "Society & Culture": 10},
            'min_quests': 6,
            'min_xp': 1800,
            'status': 'active',
            'ai_generated': False
        },
        {
            'name': 'Creative Problem Solver',
            'identity_statement': 'I can approach challenges with creativity and innovative thinking',
            'description': 'Learn to think outside the box and generate innovative solutions. Apply creative thinking to real-world problems and develop your unique problem-solving style.',
            'pillar_primary': 'Arts & Creativity',
            'pillar_weights': {"Arts & Creativity": 50, "STEM & Logic": 30, "Language & Communication": 20},
            'min_quests': 5,
            'min_xp': 1500,
            'status': 'active',
            'ai_generated': False
        },
        {
            'name': 'Design Thinker',
            'identity_statement': 'I am learning to design solutions that put people first',
            'description': 'Explore the design thinking process from empathy to prototyping. Learn to understand user needs and create thoughtful, human-centered solutions.',
            'pillar_primary': 'Arts & Creativity',
            'pillar_weights': {"Arts & Creativity": 60, "STEM & Logic": 20, "Society & Culture": 20},
            'min_quests': 6,
            'min_xp': 1800,
            'status': 'active',
            'ai_generated': False
        }
    ]

    try:
        # Insert all badges
        result = supabase.table('badges').insert(badges).execute()

        return jsonify({
            'success': True,
            'message': f'Successfully created {len(result.data)} initial badges',
            'badges': result.data,
            'count': len(result.data)
        }), 201

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
