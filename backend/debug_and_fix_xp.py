"""Debug and fix XP issues in the database"""

import os
from dotenv import load_dotenv
from supabase import create_client, Client
import json

load_dotenv()

def get_supabase_client() -> Client:
    """Get Supabase client with service key for admin access"""
    url = os.getenv('SUPABASE_URL')
    service_key = os.getenv('SUPABASE_SERVICE_KEY')
    if not url or not service_key:
        raise ValueError("Supabase credentials not found in environment")
    return create_client(url, service_key)

def debug_user_xp(user_id: str = None):
    """Debug XP data for a specific user or all users"""
    supabase = get_supabase_client()
    
    print("\n=== DEBUGGING XP DATA ===\n")
    
    if user_id:
        users = [{'id': user_id}]
    else:
        # Get all users with completed quests
        users_response = supabase.table('user_quests')\
            .select('user_id')\
            .not_.is_('completed_at', 'null')\
            .execute()
        unique_users = list(set(u['user_id'] for u in users_response.data))
        users = [{'id': uid} for uid in unique_users]
        print(f"Found {len(users)} users with completed quests")
    
    for user in users:
        uid = user['id']
        print(f"\n--- User: {uid[:8]}... ---")
        
        # Check user_skill_xp table
        skill_xp = supabase.table('user_skill_xp')\
            .select('*')\
            .eq('user_id', uid)\
            .execute()
        
        print(f"user_skill_xp records: {len(skill_xp.data) if skill_xp.data else 0}")
        if skill_xp.data:
            for record in skill_xp.data:
                print(f"  - {record['pillar']}: {record['xp_amount']} XP")
        
        # Check completed tasks
        completed_tasks = supabase.table('user_quest_tasks')\
            .select('*, quest_tasks(pillar, xp_amount)')\
            .eq('user_id', uid)\
            .execute()
        
        print(f"Completed tasks: {len(completed_tasks.data) if completed_tasks.data else 0}")
        
        # Calculate what XP should be
        expected_xp = {}
        for task in completed_tasks.data or []:
            xp_awarded = task.get('xp_awarded', 0)
            task_info = task.get('quest_tasks', {})
            pillar = task_info.get('pillar')
            
            if pillar:
                expected_xp[pillar] = expected_xp.get(pillar, 0) + xp_awarded
        
        print(f"Expected XP based on completed tasks:")
        for pillar, xp in expected_xp.items():
            print(f"  - {pillar}: {xp} XP")
        
        # Check if we need to fix
        current_xp = {r['pillar']: r['xp_amount'] for r in skill_xp.data} if skill_xp.data else {}
        
        if expected_xp != current_xp:
            print("WARNING: XP MISMATCH DETECTED!")
            print("Fixing by updating user_skill_xp table...")
            
            # Fix the XP
            for pillar, xp in expected_xp.items():
                if xp > 0:
                    # Check if record exists
                    existing = supabase.table('user_skill_xp')\
                        .select('id')\
                        .eq('user_id', uid)\
                        .eq('pillar', pillar)\
                        .execute()
                    
                    if existing.data:
                        # Update
                        result = supabase.table('user_skill_xp')\
                            .update({'xp_amount': xp})\
                            .eq('user_id', uid)\
                            .eq('pillar', pillar)\
                            .execute()
                        print(f"  [UPDATED] {pillar}: {xp} XP")
                    else:
                        # Insert
                        result = supabase.table('user_skill_xp')\
                            .insert({
                                'user_id': uid,
                                'pillar': pillar,
                                'xp_amount': xp
                            })\
                            .execute()
                        print(f"  [CREATED] {pillar}: {xp} XP")

def main():
    """Main function to debug and fix XP"""
    import sys
    
    user_id = sys.argv[1] if len(sys.argv) > 1 else None
    
    if user_id:
        print(f"Debugging XP for user: {user_id}")
    else:
        print("Debugging XP for all users with completed quests...")
        # Auto-proceed in non-interactive mode
        print("Auto-proceeding...")
    
    debug_user_xp(user_id)
    print("\n[DONE] XP debugging and fixing complete!")

if __name__ == "__main__":
    main()