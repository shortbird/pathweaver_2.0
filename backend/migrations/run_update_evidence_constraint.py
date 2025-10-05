"""
Migration script to update user_task_evidence_documents foreign key constraint.
This migrates the evidence document system from the legacy quest_tasks_archived
to the new V3 user_quest_tasks system.
"""
import os
from database import get_supabase_admin_client

def run_migration():
    """Execute the migration SQL"""
    try:
        # Read the migration SQL
        migration_path = os.path.join(os.path.dirname(__file__), 'update_evidence_documents_constraint.sql')
        with open(migration_path, 'r') as f:
            migration_sql = f.read()

        # Get admin client
        supabase = get_supabase_admin_client()

        # Execute the migration
        print("Starting migration...")
        print("Dropping old constraint...")
        supabase.rpc('exec_sql', {'sql': 'ALTER TABLE public.user_task_evidence_documents DROP CONSTRAINT IF EXISTS user_task_evidence_documents_task_id_fkey;'}).execute()

        print("Adding new constraint...")
        supabase.rpc('exec_sql', {'sql': 'ALTER TABLE public.user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.user_quest_tasks(id);'}).execute()

        print("Migration completed successfully!")

    except Exception as e:
        print(f"Migration failed: {str(e)}")
        raise

if __name__ == '__main__':
    run_migration()
