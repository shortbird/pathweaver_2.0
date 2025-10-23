#!/usr/bin/env python3
"""
Create subscription_history table for logging Stripe webhook events.

This table is used by the webhook handler to track subscription changes
and provides audit trail for subscription events.
"""

import os
import sys

from utils.logger import get_logger

logger = get_logger(__name__)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_supabase_admin_client

def create_subscription_history_table():
    """Create the subscription_history table"""
    supabase = get_supabase_admin_client()

    # SQL to create the subscription_history table
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS public.subscription_history (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        stripe_subscription_id TEXT,
        tier TEXT NOT NULL CHECK (tier IN ('free', 'supported', 'academy')),
        status TEXT NOT NULL,
        stripe_event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        ended_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    """

    # SQL to create indexes for better performance
    create_indexes_sql = """
    CREATE INDEX IF NOT EXISTS idx_subscription_history_user_id ON public.subscription_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscription_history_stripe_subscription_id ON public.subscription_history(stripe_subscription_id);
    CREATE INDEX IF NOT EXISTS idx_subscription_history_stripe_event_id ON public.subscription_history(stripe_event_id);
    CREATE INDEX IF NOT EXISTS idx_subscription_history_created_at ON public.subscription_history(created_at);
    """

    # SQL to create RLS policies
    rls_policies_sql = """
    ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

    -- Policy: Users can view their own subscription history
    CREATE POLICY "Users can view own subscription history"
    ON public.subscription_history
    FOR SELECT
    USING (auth.uid() = user_id);

    -- Policy: Service role can manage all subscription history
    CREATE POLICY "Service role can manage subscription history"
    ON public.subscription_history
    FOR ALL
    USING (auth.role() = 'service_role');

    -- Policy: Admins can view all subscription history
    CREATE POLICY "Admins can view all subscription history"
    ON public.subscription_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );
    """

    # SQL to create updated_at trigger
    trigger_sql = """
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    CREATE TRIGGER update_subscription_history_updated_at
        BEFORE UPDATE ON public.subscription_history
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    """

    try:
        logger.info("Creating subscription_history table...")

        # Execute table creation
        logger.info("1. Creating table structure...")
        supabase.postgrest.rpc('exec_sql', {'sql': create_table_sql}).execute()

        # Execute indexes
        logger.info("2. Creating indexes...")
        supabase.postgrest.rpc('exec_sql', {'sql': create_indexes_sql}).execute()

        # Execute RLS policies
        logger.info("3. Setting up Row Level Security policies...")
        supabase.postgrest.rpc('exec_sql', {'sql': rls_policies_sql}).execute()

        # Execute trigger
        logger.info("4. Creating updated_at trigger...")
        supabase.postgrest.rpc('exec_sql', {'sql': trigger_sql}).execute()

        logger.info("Successfully created subscription_history table with:")
        logger.info("   - UUID primary key")
        logger.info("   - Foreign key to users table")
        logger.info("   - Stripe subscription and event tracking")
        logger.info("   - Performance indexes")
        logger.info("   - Row Level Security policies")
        logger.info("   - Auto-updating timestamps")

        # Verify table exists
        logger.info("
5. Verifying table creation...")
        result = supabase.table('subscription_history').select('*').limit(1).execute()
        logger.info("Table verification successful - ready to accept webhook data")

        return True

    except Exception as e:
        logger.error(f"Error creating subscription_history table: {str(e)}")
        import traceback
        logger.info(f"Full traceback: {traceback.format_exc()}")
        return False

if __name__ == "__main__":
    logger.info("Creating subscription_history table for Stripe webhook logging...")
    success = create_subscription_history_table()

    if success:
        logger.info("
Migration completed successfully!")
        logger.info("The subscription_history table is now ready to handle Stripe webhook events.")
    else:
        logger.error("
Migration failed. Please check the error messages above.")
        sys.exit(1)