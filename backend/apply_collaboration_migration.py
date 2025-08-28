"""
Apply the quest_collaborations table migration to Supabase.
Run this script to create the table and enable Team Up functionality.
"""

from database import get_supabase_admin_client
import sys

def apply_migration():
    """Apply the quest_collaborations table migration."""
    try:
        print("Applying quest_collaborations migration...")
        
        # Read the SQL migration file
        with open('migrations/create_quest_collaborations_table.sql', 'r') as f:
            sql = f.read()
        
        # Get Supabase admin client
        supabase = get_supabase_admin_client()
        
        # Note: Supabase Python client doesn't directly support raw SQL execution
        # You'll need to run this SQL directly in the Supabase SQL editor
        
        print("\n" + "="*60)
        print("MIGRATION SQL READY")
        print("="*60)
        print("\nPlease run the following SQL in your Supabase SQL editor:")
        print("(Dashboard -> SQL Editor -> New Query)\n")
        print("-"*60)
        print(sql)
        print("-"*60)
        print("\nAfter running the SQL, the Team Up feature will be fully functional.")
        print("="*60)
        
        return True
        
    except Exception as e:
        print(f"Error preparing migration: {str(e)}")
        return False

if __name__ == "__main__":
    success = apply_migration()
    sys.exit(0 if success else 1)