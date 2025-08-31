"""
Script to recalculate and fix XP for users who have completed tasks
"""

from database import get_supabase_admin_client
from services.xp_service import XPService
from datetime import datetime

def fix_user_xp():
    """Recalculate XP based on completed tasks"""
    supabase = get_supabase_admin_client()
    xp_service = XPService()
    
    print("=== FIXING XP CALCULATION ===")
    
    # Get all task completions
    completions = supabase.table('user_quest_tasks')\
        .select('*, quest_tasks(xp_amount, pillar)')\
        .execute()
    
    if not completions.data:
        print("No task completions found")
        return
    
    # Group by user and pillar
    user_xp_totals = {}
    
    for completion in completions.data:
        user_id = completion['user_id']
        xp_awarded = completion.get('xp_awarded', 0)
        
        # Get task info
        task_info = completion.get('quest_tasks')
        if not task_info:
            print(f"Warning: No task info for completion {completion.get('id')}")
            continue
            
        pillar = task_info.get('pillar', 'creativity')
        
        # Track total XP per user per pillar
        if user_id not in user_xp_totals:
            user_xp_totals[user_id] = {}
        if pillar not in user_xp_totals[user_id]:
            user_xp_totals[user_id][pillar] = 0
        
        user_xp_totals[user_id][pillar] += xp_awarded
        print(f"User {user_id[:8]}... completed task for {xp_awarded} XP in {pillar}")
    
    # Now update the user_skill_xp table with correct totals
    for user_id, pillars in user_xp_totals.items():
        print(f"\nUpdating XP for user {user_id[:8]}...")
        for pillar, total_xp in pillars.items():
            print(f"  {pillar}: {total_xp} XP")
            
            # Check if record exists
            existing = supabase.table('user_skill_xp')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('pillar', pillar)\
                .execute()
            
            if existing.data:
                # Update existing record
                record_id = existing.data[0].get('id')
                result = supabase.table('user_skill_xp')\
                    .update({
                        'xp_amount': total_xp,
                        'updated_at': datetime.utcnow().isoformat()
                    })\
                    .eq('id', record_id)\
                    .execute()
                if result.data:
                    print(f"    [OK] Updated {pillar} to {total_xp} XP")
                else:
                    print(f"    [FAIL] Failed to update {pillar}")
            else:
                # Create new record
                result = supabase.table('user_skill_xp')\
                    .insert({
                        'user_id': user_id,
                        'pillar': pillar,
                        'xp_amount': total_xp,
                        'updated_at': datetime.utcnow().isoformat()
                    })\
                    .execute()
                if result.data:
                    print(f"    [OK] Created {pillar} with {total_xp} XP")
                else:
                    print(f"    [FAIL] Failed to create {pillar}")
    
    print("\n=== XP FIX COMPLETE ===")
    
    # Verify the fix
    print("\n=== VERIFICATION ===")
    for user_id in user_xp_totals.keys():
        xp_records = supabase.table('user_skill_xp')\
            .select('pillar, xp_amount')\
            .eq('user_id', user_id)\
            .execute()
        
        if xp_records.data:
            total = sum(r['xp_amount'] for r in xp_records.data)
            print(f"User {user_id[:8]}... total XP: {total}")
            for record in xp_records.data:
                if record['xp_amount'] > 0:
                    print(f"  - {record['pillar']}: {record['xp_amount']} XP")

if __name__ == "__main__":
    fix_user_xp()