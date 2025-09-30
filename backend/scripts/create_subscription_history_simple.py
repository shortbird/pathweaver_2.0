#!/usr/bin/env python3
"""
Simple script to create subscription_history table using direct SQL execution.
"""

import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_supabase_admin_client

def create_subscription_history_table():
    """Create the subscription_history table using direct table operations"""
    supabase = get_supabase_admin_client()

    try:
        print("Creating subscription_history table...")

        # Test if table already exists
        try:
            result = supabase.table('subscription_history').select('*').limit(1).execute()
            print("Table already exists - no action needed")
            return True
        except:
            print("Table doesn't exist, creating it...")

        # Since we can't execute raw SQL easily, let's try a different approach
        # We'll create the table structure by inserting a test record and then deleting it
        # This will auto-create the table with inferred types

        print("Alternative approach: The table needs to be created manually in the Supabase dashboard")
        print("Please create the table with this SQL in Supabase SQL Editor:")
        print("""
CREATE TABLE IF NOT EXISTS public.subscription_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT,
    tier TEXT NOT NULL,
    status TEXT NOT NULL,
    stripe_event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscription_history_user_id ON public.subscription_history(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_stripe_subscription_id ON public.subscription_history(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_stripe_event_id ON public.subscription_history(stripe_event_id);

-- Enable RLS
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own subscription history"
ON public.subscription_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscription history"
ON public.subscription_history
FOR ALL
USING (auth.role() = 'service_role');
        """)

        return False  # Manual action required

    except Exception as e:
        print(f"Error: {str(e)}")
        return False

if __name__ == "__main__":
    create_subscription_history_table()