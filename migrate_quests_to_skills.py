#!/usr/bin/env python3
"""
Migration script to convert existing quests from subject-based to skill-based system.
Run this after applying the database schema migration.
"""

import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client
import json

# Load environment variables
load_dotenv()

# Subject to skill mapping
SUBJECT_TO_SKILL_MAP = {
    'language_arts': {
        'category': 'reading_writing',
        'skills': ['reading', 'writing', 'speaking'],
        'default_xp': 100
    },
    'math': {
        'category': 'thinking_skills',
        'skills': ['math_data', 'critical_thinking', 'systems_thinking'],
        'default_xp': 100
    },
    'science': {
        'category': 'making_creating',
        'skills': ['scientific_method', 'research', 'critical_thinking'],
        'default_xp': 100
    },
    'social_studies': {
        'category': 'world_understanding',
        'skills': ['history', 'cultural_awareness', 'ethics_philosophy'],
        'default_xp': 100
    },
    'physical_education': {
        'category': 'life_skills',
        'skills': ['health_fitness', 'grit'],
        'default_xp': 100
    },
    'technology': {
        'category': 'making_creating',
        'skills': ['coding', 'tech_skills', 'systems_thinking'],
        'default_xp': 150
    },
    'arts': {
        'category': 'making_creating',
        'skills': ['art', 'creative_thinking'],
        'default_xp': 100
    },
    'foreign_language': {
        'category': 'world_understanding',
        'skills': ['cultural_awareness', 'speaking', 'reading'],
        'default_xp': 100
    }
}

def get_difficulty_from_xp(total_xp):
    """Determine difficulty level based on total XP"""
    if total_xp <= 100:
        return 'beginner'
    elif total_xp <= 250:
        return 'intermediate'
    else:
        return 'advanced'

def get_effort_from_xp(total_xp):
    """Determine effort level based on total XP"""
    if total_xp <= 75:
        return 'light'
    elif total_xp <= 200:
        return 'moderate'
    else:
        return 'intensive'

def estimate_hours_from_xp(total_xp):
    """Estimate hours based on XP (rough formula: XP/50)"""
    return max(1, total_xp // 50)

def migrate_quests(supabase: Client):
    """Migrate existing quests to skill-based system"""
    
    print("Starting quest migration...")
    
    # 1. Fetch all existing quests
    try:
        quests_response = supabase.table('quests').select('*').execute()
        quests = quests_response.data
        print(f"Found {len(quests)} quests to migrate")
    except Exception as e:
        print(f"Error fetching quests: {e}")
        return
    
    # 2. Fetch existing quest_xp_awards
    try:
        xp_awards_response = supabase.table('quest_xp_awards').select('*').execute()
        xp_awards = xp_awards_response.data
        print(f"Found {len(xp_awards)} XP awards to migrate")
    except Exception as e:
        print(f"Error fetching XP awards: {e}")
        xp_awards = []
    
    # Group XP awards by quest_id
    xp_by_quest = {}
    for award in xp_awards:
        quest_id = award['quest_id']
        if quest_id not in xp_by_quest:
            xp_by_quest[quest_id] = []
        xp_by_quest[quest_id].append(award)
    
    # 3. Process each quest
    migrated_count = 0
    for quest in quests:
        quest_id = quest['id']
        quest_xp = xp_by_quest.get(quest_id, [])
        
        # Calculate total XP for this quest
        total_xp = sum(award['xp_amount'] for award in quest_xp)
        
        # Determine new fields based on existing data
        difficulty = quest.get('difficulty_level') or get_difficulty_from_xp(total_xp)
        effort = quest.get('effort_level') or get_effort_from_xp(total_xp)
        hours = quest.get('estimated_hours') or estimate_hours_from_xp(total_xp)
        
        # Collect all core skills from mapped subjects
        core_skills_set = set()
        skill_categories = {}
        
        for award in quest_xp:
            subject = award['subject']
            if subject in SUBJECT_TO_SKILL_MAP:
                mapping = SUBJECT_TO_SKILL_MAP[subject]
                core_skills_set.update(mapping['skills'])
                
                # Track XP by skill category
                category = mapping['category']
                if category not in skill_categories:
                    skill_categories[category] = 0
                skill_categories[category] += award['xp_amount']
        
        # If no XP awards, use a default based on quest title/description
        if not skill_categories:
            # Default to thinking skills for quests without subject mapping
            skill_categories['thinking_skills'] = 100
            core_skills_set = {'critical_thinking', 'research'}
        
        # Update quest with new fields
        update_data = {
            'difficulty_level': difficulty,
            'effort_level': effort,
            'estimated_hours': hours,
            'core_skills': list(core_skills_set),
            'accepted_evidence_types': ['photo', 'written', 'video'],  # Default evidence types
            'example_submissions': 'Photo showing your completed work, written reflection on what you learned, or video demonstration of skills acquired.',
            'resources_needed': '',
            'location_requirements': '',
            'safety_considerations': '',
            'requires_adult_supervision': False
        }
        
        try:
            # Update quest
            supabase.table('quests').update(update_data).eq('id', quest_id).execute()
            
            # Create new skill-based XP awards
            for category, xp_amount in skill_categories.items():
                skill_xp_data = {
                    'quest_id': quest_id,
                    'skill_category': category,
                    'xp_amount': xp_amount
                }
                supabase.table('quest_skill_xp').insert(skill_xp_data).execute()
            
            migrated_count += 1
            print(f"Migrated quest: {quest['title']}")
            
        except Exception as e:
            print(f"Error migrating quest {quest['title']}: {e}")
    
    print(f"\nMigration complete! Migrated {migrated_count}/{len(quests)} quests")
    
    # 4. Migrate user XP (convert subject XP to skill category XP)
    print("\nMigrating user XP...")
    try:
        # Get all user subject XP
        user_xp_response = supabase.table('user_xp').select('*').execute()
        user_xp_records = user_xp_response.data
        
        # Group by user
        xp_by_user = {}
        for record in user_xp_records:
            user_id = record['user_id']
            if user_id not in xp_by_user:
                xp_by_user[user_id] = {}
            
            subject = record['subject']
            if subject in SUBJECT_TO_SKILL_MAP:
                category = SUBJECT_TO_SKILL_MAP[subject]['category']
                if category not in xp_by_user[user_id]:
                    xp_by_user[user_id][category] = 0
                xp_by_user[user_id][category] += record['total_xp']
        
        # Update user_skill_xp table
        for user_id, categories in xp_by_user.items():
            for category, total_xp in categories.items():
                try:
                    # Check if record exists
                    existing = supabase.table('user_skill_xp').select('*').eq('user_id', user_id).eq('skill_category', category).execute()
                    
                    if existing.data:
                        # Update existing
                        supabase.table('user_skill_xp').update({
                            'total_xp': total_xp
                        }).eq('user_id', user_id).eq('skill_category', category).execute()
                    else:
                        # Insert new
                        supabase.table('user_skill_xp').insert({
                            'user_id': user_id,
                            'skill_category': category,
                            'total_xp': total_xp
                        }).execute()
                    
                    print(f"Migrated XP for user {user_id}: {category} = {total_xp}")
                except Exception as e:
                    print(f"Error migrating XP for user {user_id}: {e}")
        
        print("User XP migration complete!")
        
    except Exception as e:
        print(f"Error migrating user XP: {e}")
    
    print("\nMigration script complete!")
    print("\nNext steps:")
    print("1. Verify the migration by checking a few quests in the admin panel")
    print("2. Test quest creation with new fields")
    print("3. Test quest completion to ensure skill XP is awarded correctly")
    print("4. Once verified, you can drop the old quest_xp_awards table")

def main():
    # Get Supabase credentials from environment
    # Extract project ref from the database URL or use directly if available
    db_url = os.getenv('VITE_SUPABASE_URL') or os.getenv('supabase_url')
    
    # Extract project reference from database URL
    if db_url and 'supabase.co' in db_url:
        # Extract project ref from URL like: db.yzdrqaookkhgkxwdmroz.supabase.co
        project_ref = db_url.split('@db.')[1].split('.supabase.co')[0] if '@db.' in db_url else None
        if project_ref:
            supabase_url = f'https://{project_ref}.supabase.co'
        else:
            print("Error: Could not extract project reference from database URL")
            sys.exit(1)
    else:
        print("Error: No valid Supabase URL found in environment variables")
        sys.exit(1)
    
    # Get service role key
    supabase_service_key = os.getenv('supabase_service_role_key') or os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_service_key:
        print("Error: Missing Supabase service role key in environment variables")
        print("Please ensure supabase_service_role_key is set in .env")
        sys.exit(1)
    
    print(f"Using Supabase URL: {supabase_url}")
    
    # Create Supabase client with service key for admin access
    supabase: Client = create_client(supabase_url, supabase_service_key)
    
    # Run migration
    migrate_quests(supabase)

if __name__ == "__main__":
    main()