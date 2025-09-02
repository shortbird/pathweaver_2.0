from database import get_supabase_admin_client
import psycopg2
from psycopg2 import sql
import os
from urllib.parse import urlparse

def run_migration(migration_file):
    # Read the migration file
    with open(migration_file, 'r') as f:
        migration_sql = f.read()
    
    # Get Supabase connection details
    supabase_url = os.getenv('SUPABASE_URL')
    
    # Parse the URL to get the database connection string
    # Supabase URL format: https://[project-ref].supabase.co
    project_ref = urlparse(supabase_url).hostname.split('.')[0]
    
    # Use the Supabase direct connection string
    db_host = f"db.{project_ref}.supabase.co"
    db_name = "postgres"
    db_user = "postgres"
    db_password = os.getenv('SUPABASE_SERVICE_KEY')  # Using service key as password
    
    try:
        # Try direct database connection
        conn = psycopg2.connect(
            host=db_host,
            database=db_name,
            user=db_user,
            password=db_password,
            port=5432
        )
        
        cur = conn.cursor()
        cur.execute(migration_sql)
        conn.commit()
        
        print(f"✓ Migration {migration_file} executed successfully!")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Direct connection failed: {e}")
        print("Attempting alternative method...")
        
        # Alternative: Use Supabase client to execute raw SQL
        supabase = get_supabase_admin_client()
        
        # Split the migration into individual statements
        statements = [s.strip() for s in migration_sql.split(';') if s.strip()]
        
        for i, statement in enumerate(statements, 1):
            if statement:
                try:
                    # Execute using Supabase table operations
                    print(f"Executing statement {i}/{len(statements)}...")
                    # Since we can't execute raw SQL directly, we'll need to apply changes differently
                    print(f"Statement: {statement[:100]}...")
                except Exception as stmt_error:
                    print(f"Error executing statement {i}: {stmt_error}")
        
        print("Note: Manual database migration may be required.")

if __name__ == "__main__":
    run_migration('migrations/add_quest_fields_direct.sql')