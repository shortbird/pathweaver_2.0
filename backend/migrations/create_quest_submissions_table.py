"""
Create quest_submissions table for student-submitted custom quests
"""

import os
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database import get_supabase_client
from dotenv import load_dotenv

load_dotenv()

def create_quest_submissions_table():
    """Create the quest_submissions table"""
    supabase = get_supabase_client()
    
    # Create quest_submissions table
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS quest_submissions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        suggested_tasks JSONB,
        suggested_xp INTEGER,
        pillar TEXT,
        make_public BOOLEAN DEFAULT false,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ,
        reviewed_by UUID REFERENCES users(id),
        approved_quest_id UUID REFERENCES quests(id),
        rejection_reason TEXT,
        CONSTRAINT quest_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    -- Add indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_quest_submissions_user_id ON quest_submissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_quest_submissions_status ON quest_submissions(status);
    CREATE INDEX IF NOT EXISTS idx_quest_submissions_created_at ON quest_submissions(created_at DESC);
    
    -- Add RLS policies
    ALTER TABLE quest_submissions ENABLE ROW LEVEL SECURITY;
    
    -- Users can view their own submissions
    CREATE POLICY "Users can view own submissions" ON quest_submissions
        FOR SELECT USING (auth.uid() = user_id);
    
    -- Users can create submissions
    CREATE POLICY "Users can create submissions" ON quest_submissions
        FOR INSERT WITH CHECK (auth.uid() = user_id);
    
    -- Admins can view all submissions
    CREATE POLICY "Admins can view all submissions" ON quest_submissions
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM users 
                WHERE users.id = auth.uid() 
                AND users.role = 'admin'
            )
        );
    
    -- Admins can update submissions
    CREATE POLICY "Admins can update submissions" ON quest_submissions
        FOR UPDATE USING (
            EXISTS (
                SELECT 1 FROM users 
                WHERE users.id = auth.uid() 
                AND users.role = 'admin'
            )
        );
    """
    
    # Also add columns to quests table for tracking custom quests
    alter_quests_sql = """
    ALTER TABLE quests 
    ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS submission_id UUID REFERENCES quest_submissions(id);
    
    -- Add index for custom quests
    CREATE INDEX IF NOT EXISTS idx_quests_is_custom ON quests(is_custom);
    CREATE INDEX IF NOT EXISTS idx_quests_submitted_by ON quests(submitted_by);
    """
    
    try:
        # Execute the SQL commands via RPC call
        print("Creating quest_submissions table...")
        supabase.rpc('exec_sql', {'query': create_table_sql}).execute()
        print("✓ Quest submissions table created successfully")
        
        print("Adding columns to quests table...")
        supabase.rpc('exec_sql', {'query': alter_quests_sql}).execute()
        print("✓ Quests table updated successfully")
        
        print("\n✓ All database changes completed successfully!")
        
    except Exception as e:
        print(f"Error creating tables: {e}")
        # Try without RPC (direct execution)
        try:
            print("Attempting alternative method...")
            # This would need to be run directly in Supabase SQL editor
            print("\nPlease run the following SQL in your Supabase SQL editor:")
            print(create_table_sql)
            print(alter_quests_sql)
        except Exception as e2:
            print(f"Alternative method also failed: {e2}")

if __name__ == "__main__":
    create_quest_submissions_table()