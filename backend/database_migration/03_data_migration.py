"""
Data Migration Script from Supabase to Render PostgreSQL
This script handles the data transformation and migration
"""

import os
import csv
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
from uuid import uuid4
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DatabaseMigrator:
    def __init__(self, source_conn_string, target_conn_string):
        """Initialize migrator with database connections"""
        self.source_conn = psycopg2.connect(source_conn_string)
        self.target_conn = psycopg2.connect(target_conn_string)
        self.source_cursor = self.source_conn.cursor(cursor_factory=RealDictCursor)
        self.target_cursor = self.target_conn.cursor()
        
    def close_connections(self):
        """Close all database connections"""
        self.source_conn.close()
        self.target_conn.close()
        
    def migrate_users(self):
        """Migrate users table with data cleanup"""
        logger.info("Migrating users table...")
        
        # Fetch users from source
        self.source_cursor.execute("""
            SELECT id, email, username, first_name, last_name, role, 
                   subscription_tier, stripe_customer_id, stripe_subscription_id,
                   created_at
            FROM users
        """)
        users = self.source_cursor.fetchall()
        
        # Insert into target with data cleanup
        for user in users:
            try:
                # Clean up role if needed
                role = user['role'] if user['role'] in ['student', 'parent', 'advisor', 'admin'] else 'student'
                
                # Clean up subscription tier
                tier = user.get('subscription_tier', 'explorer')
                if tier not in ['explorer', 'creator', 'visionary', 'academy']:
                    tier = 'explorer'
                
                self.target_cursor.execute("""
                    INSERT INTO users (id, email, username, first_name, last_name, role,
                                     subscription_tier, stripe_customer_id, stripe_subscription_id,
                                     created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        email = EXCLUDED.email,
                        username = EXCLUDED.username,
                        subscription_tier = EXCLUDED.subscription_tier
                """, (
                    user['id'], user['email'], user['username'], 
                    user['first_name'], user['last_name'], role,
                    tier, user.get('stripe_customer_id'), 
                    user.get('stripe_subscription_id'), user['created_at']
                ))
            except Exception as e:
                logger.error(f"Error migrating user {user['id']}: {e}")
                continue
                
        self.target_conn.commit()
        logger.info(f"Migrated {len(users)} users")
        
    def migrate_quests(self):
        """Migrate quests with V3 system cleanup"""
        logger.info("Migrating quests table...")
        
        self.source_cursor.execute("""
            SELECT id, title, description, source, is_active, created_at
            FROM quests
            WHERE is_v3 = true OR source IN ('khan_academy', 'brilliant', 'custom')
        """)
        quests = self.source_cursor.fetchall()
        
        for quest in quests:
            try:
                # Map source to new enum
                source_map = {
                    'khan_academy': 'khan_academy',
                    'brilliant': 'brilliant',
                    'custom': 'custom',
                    'user_generated': 'community'
                }
                source = source_map.get(quest['source'], 'custom')
                
                # Extract category from description or title
                category = self._extract_category(quest['title'], quest['description'])
                
                self.target_cursor.execute("""
                    INSERT INTO quests (id, title, description, source, category,
                                      is_active, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        title = EXCLUDED.title,
                        description = EXCLUDED.description,
                        is_active = EXCLUDED.is_active
                """, (
                    quest['id'], quest['title'], quest['description'],
                    source, category, quest['is_active'], quest['created_at']
                ))
            except Exception as e:
                logger.error(f"Error migrating quest {quest['id']}: {e}")
                continue
                
        self.target_conn.commit()
        logger.info(f"Migrated {len(quests)} quests")
        
    def migrate_quest_tasks(self):
        """Migrate quest tasks with pillar normalization"""
        logger.info("Migrating quest tasks...")
        
        self.source_cursor.execute("""
            SELECT id, quest_id, title, description, pillar, xp_value,
                   order_index, is_required
            FROM quest_tasks
            ORDER BY quest_id, order_index
        """)
        tasks = self.source_cursor.fetchall()
        
        for task in tasks:
            try:
                # Normalize pillar names
                pillar_map = {
                    'creativity': 'creativity',
                    'critical_thinking': 'critical_thinking',
                    'practical_skills': 'practical_skills',
                    'communication': 'communication',
                    'cultural_literacy': 'cultural_literacy',
                    'problem_solving': 'critical_thinking',  # Map legacy
                    'collaboration': 'communication'  # Map legacy
                }
                pillar = pillar_map.get(task['pillar'], 'practical_skills')
                
                # Ensure XP value is reasonable
                xp_value = max(10, min(task['xp_value'], 500))  # Between 10-500
                
                self.target_cursor.execute("""
                    INSERT INTO quest_tasks (id, quest_id, title, description,
                                           pillar, xp_value, order_index, is_required)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        title = EXCLUDED.title,
                        xp_value = EXCLUDED.xp_value
                """, (
                    task['id'], task['quest_id'], task['title'], task['description'],
                    pillar, xp_value, task['order_index'], task.get('is_required', True)
                ))
            except Exception as e:
                logger.error(f"Error migrating task {task['id']}: {e}")
                continue
                
        self.target_conn.commit()
        logger.info(f"Migrated {len(tasks)} quest tasks")
        
    def migrate_completions(self):
        """Migrate task completions and calculate XP"""
        logger.info("Migrating task completions...")
        
        self.source_cursor.execute("""
            SELECT c.*, t.xp_value, t.pillar
            FROM quest_task_completions c
            JOIN quest_tasks t ON c.task_id = t.id
        """)
        completions = self.source_cursor.fetchall()
        
        # Track XP for each user
        user_xp = {}
        
        for completion in completions:
            try:
                # Insert completion
                self.target_cursor.execute("""
                    INSERT INTO quest_task_completions 
                    (id, user_id, quest_id, task_id, evidence_text, evidence_url,
                     xp_awarded, completed_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, task_id) DO UPDATE SET
                        evidence_text = EXCLUDED.evidence_text,
                        evidence_url = EXCLUDED.evidence_url
                """, (
                    completion['id'], completion['user_id'], completion['quest_id'],
                    completion['task_id'], completion['evidence_text'],
                    completion['evidence_url'], completion['xp_value'],
                    completion['completed_at']
                ))
                
                # Track XP for aggregation
                user_key = (completion['user_id'], completion['pillar'])
                if user_key not in user_xp:
                    user_xp[user_key] = 0
                user_xp[user_key] += completion['xp_value']
                
            except Exception as e:
                logger.error(f"Error migrating completion {completion['id']}: {e}")
                continue
                
        # Update user skill XP
        for (user_id, pillar), xp_amount in user_xp.items():
            level = self._calculate_level(xp_amount)
            self.target_cursor.execute("""
                INSERT INTO user_skill_xp (user_id, pillar, xp_amount, level)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id, pillar) DO UPDATE SET
                    xp_amount = EXCLUDED.xp_amount,
                    level = EXCLUDED.level
            """, (user_id, pillar, xp_amount, level))
            
        self.target_conn.commit()
        logger.info(f"Migrated {len(completions)} completions")
        
    def migrate_user_quests(self):
        """Migrate user quest enrollments with progress calculation"""
        logger.info("Migrating user quest enrollments...")
        
        self.source_cursor.execute("""
            SELECT DISTINCT uq.*, 
                   COUNT(DISTINCT tc.task_id) as completed_tasks,
                   COUNT(DISTINCT t.id) as total_tasks
            FROM user_quests uq
            LEFT JOIN quest_tasks t ON t.quest_id = uq.quest_id AND t.is_required = true
            LEFT JOIN quest_task_completions tc ON tc.user_id = uq.user_id 
                AND tc.quest_id = uq.quest_id AND tc.task_id = t.id
            GROUP BY uq.user_id, uq.quest_id, uq.started_at, uq.completed_at, uq.is_active
        """)
        enrollments = self.source_cursor.fetchall()
        
        for enrollment in enrollments:
            try:
                # Calculate progress
                progress = 0
                if enrollment['total_tasks'] > 0:
                    progress = int((enrollment['completed_tasks'] / enrollment['total_tasks']) * 100)
                
                self.target_cursor.execute("""
                    INSERT INTO user_quests (user_id, quest_id, started_at, completed_at,
                                           is_active, progress_percentage)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, quest_id) DO UPDATE SET
                        progress_percentage = EXCLUDED.progress_percentage,
                        completed_at = EXCLUDED.completed_at
                """, (
                    enrollment['user_id'], enrollment['quest_id'], enrollment['started_at'],
                    enrollment['completed_at'], enrollment['is_active'], progress
                ))
            except Exception as e:
                logger.error(f"Error migrating enrollment: {e}")
                continue
                
        self.target_conn.commit()
        logger.info(f"Migrated {len(enrollments)} enrollments")
        
    def _extract_category(self, title, description):
        """Extract category from title or description"""
        categories = {
            'math': ['math', 'algebra', 'geometry', 'calculus'],
            'science': ['science', 'physics', 'chemistry', 'biology'],
            'programming': ['coding', 'programming', 'python', 'javascript'],
            'arts': ['art', 'music', 'creative', 'design'],
            'language': ['english', 'writing', 'literature', 'language']
        }
        
        text = (title + ' ' + (description or '')).lower()
        
        for category, keywords in categories.items():
            if any(keyword in text for keyword in keywords):
                return category
                
        return 'general'
        
    def _calculate_level(self, xp):
        """Calculate level from XP"""
        import math
        return math.floor(math.sqrt(xp / 100)) + 1
        
    def run_migration(self):
        """Run the complete migration"""
        try:
            self.migrate_users()
            self.migrate_quests()
            self.migrate_quest_tasks()
            self.migrate_completions()
            self.migrate_user_quests()
            
            logger.info("Migration completed successfully!")
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            self.target_conn.rollback()
            raise
        finally:
            self.close_connections()

if __name__ == "__main__":
    # Configure these with your actual connection strings
    SOURCE_DB = os.getenv('SUPABASE_DATABASE_URL')
    TARGET_DB = os.getenv('RENDER_DATABASE_URL')
    
    if not SOURCE_DB or not TARGET_DB:
        print("Please set SUPABASE_DATABASE_URL and RENDER_DATABASE_URL environment variables")
        exit(1)
        
    migrator = DatabaseMigrator(SOURCE_DB, TARGET_DB)
    migrator.run_migration()