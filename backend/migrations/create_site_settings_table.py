#!/usr/bin/env python3
"""
Migration script to create site_settings table for storing site configuration
including logo URL, site name, and other global settings.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import supabase
from datetime import datetime
import uuid

def create_site_settings_table():
    """Create the site_settings table in Supabase"""
    
    # SQL to create the table
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS site_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        logo_url TEXT,
        favicon_url TEXT,
        site_name VARCHAR(255) DEFAULT 'Optio',
        site_description TEXT,
        meta_keywords TEXT,
        footer_text TEXT,
        primary_color VARCHAR(7),
        secondary_color VARCHAR(7),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
    );
    """
    
    # Create RLS policy to allow public read access
    enable_rls_sql = """
    ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
    """
    
    create_read_policy_sql = """
    CREATE POLICY "Public can read site settings" ON site_settings
        FOR SELECT
        USING (true);
    """
    
    create_admin_policy_sql = """
    CREATE POLICY "Admins can manage site settings" ON site_settings
        FOR ALL
        USING (
            auth.jwt() ->> 'role' = 'admin'
        );
    """
    
    try:
        print("Creating site_settings table...")
        
        # Execute SQL commands via Supabase's RPC or admin API
        # Note: You may need to run these SQL commands directly in Supabase dashboard
        # or use the Supabase CLI for migrations
        
        print("""
        Please run the following SQL in your Supabase SQL editor:
        
        -- Create site_settings table
        {}
        
        -- Enable RLS
        {}
        
        -- Create policies
        {}
        
        {}
        
        -- Insert default settings (optional)
        INSERT INTO site_settings (id, site_name, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Optio', NOW(), NOW())
        ON CONFLICT DO NOTHING;
        """.format(create_table_sql, enable_rls_sql, create_read_policy_sql, create_admin_policy_sql))
        
        print("\nTable creation SQL generated successfully!")
        print("Please copy and run the SQL above in your Supabase dashboard.")
        
        # Try to insert default settings via the API
        try:
            existing = supabase.table('site_settings').select('id').execute()
            if not existing.data or len(existing.data) == 0:
                default_settings = {
                    'id': str(uuid.uuid4()),
                    'site_name': 'Optio',
                    'created_at': datetime.utcnow().isoformat(),
                    'updated_at': datetime.utcnow().isoformat()
                }
                supabase.table('site_settings').insert(default_settings).execute()
                print("Default settings inserted successfully!")
        except Exception as e:
            print(f"Note: Could not insert default settings via API. Please run the SQL above first.")
            
    except Exception as e:
        print(f"Error: {e}")
        print("\nPlease ensure you run the SQL commands above in your Supabase dashboard.")

if __name__ == "__main__":
    create_site_settings_table()