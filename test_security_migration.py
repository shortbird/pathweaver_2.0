#!/usr/bin/env python3
"""
Test script to validate security migration functionality
Tests key database operations to ensure RLS policies don't break functionality
"""

import os
import sys
import logging
from supabase import create_client, Client

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_database_connection():
    """Test basic database connection and read operations"""
    try:
        # Supabase config
        url = "https://vvfgxcykxjybtvpfzwyx.supabase.co"
        # Use anon key for read operations
        key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2ZmdoeWt4anlievgFpidvpHiKCIDe"  # This is publicly available

        supabase: Client = create_client(url, key)

        # Test 1: Read from quests (should work - this table had RLS before)
        logger.info("Testing quests table access...")
        quests_result = supabase.table('quests').select('id,title').limit(5).execute()
        logger.info(f"✓ Quests query successful: {len(quests_result.data)} records")

        # Test 2: Read from quest_metadata (new RLS)
        logger.info("Testing quest_metadata table access...")
        metadata_result = supabase.table('quest_metadata').select('quest_id').limit(5).execute()
        logger.info(f"✓ Quest metadata query successful: {len(metadata_result.data)} records")

        # Test 3: Read from quest_paths (new RLS)
        logger.info("Testing quest_paths table access...")
        paths_result = supabase.table('quest_paths').select('id,title').limit(5).execute()
        logger.info(f"✓ Quest paths query successful: {len(paths_result.data)} records")

        # Test 4: Read from quest_sources (new RLS)
        logger.info("Testing quest_sources table access...")
        sources_result = supabase.table('quest_sources').select('id,name').limit(5).execute()
        logger.info(f"✓ Quest sources query successful: {len(sources_result.data)} records")

        # Test 5: Read from pillar_subcategories (new RLS)
        logger.info("Testing pillar_subcategories table access...")
        subcategories_result = supabase.table('pillar_subcategories').select('id,pillar').limit(5).execute()
        logger.info(f"✓ Pillar subcategories query successful: {len(subcategories_result.data)} records")

        logger.info("🎉 All database tests passed! Security migration maintains functionality.")
        return True

    except Exception as e:
        logger.error(f"❌ Database test failed: {e}")
        return False

def test_function_security():
    """Test that database functions still work with search_path security"""
    try:
        url = "https://vvfgxcykxjybtvpfzwyx.supabase.co"
        key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2ZmdoeWt4anlievgFpidvpHiKCIDe"

        supabase: Client = create_client(url, key)

        # Test function calls (these should work even with search_path security)
        logger.info("Testing calculate_mastery_level function...")
        result = supabase.rpc('calculate_mastery_level', {'total_xp': 1000}).execute()
        logger.info(f"✓ Function call successful: mastery level = {result.data}")

        logger.info("🎉 Function security tests passed!")
        return True

    except Exception as e:
        logger.error(f"❌ Function test failed: {e}")
        return False

if __name__ == "__main__":
    logger.info("Starting security migration tests...")

    db_test = test_database_connection()
    func_test = test_function_security()

    if db_test and func_test:
        logger.info("✅ All tests passed! Security migration is ready for deployment.")
        sys.exit(0)
    else:
        logger.error("❌ Some tests failed. Review migration before deployment.")
        sys.exit(1)