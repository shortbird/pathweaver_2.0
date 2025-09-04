"""
Direct fix for quest completion - bypasses database triggers
"""
import os
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv('backend/.env')

# Initialize Supabase client with service key for admin access
url = os.environ.get("SUPABASE_URL")
service_key = os.environ.get("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(url, service_key)

def fix_quest_completion():
    """Directly mark the quest as completed"""
    user_id = "ad8e119c-0685-4431-8381-527273832ca9"
    
    print(f"\n=== FIXING QUEST COMPLETION FOR USER {user_id} ===\n")
    
    # Get the active quest that should be completed
    user_quests = supabase.table('user_quests')\
        .select('*, quests(*)')\
        .eq('user_id', user_id)\
        .eq('is_active', True)\
        .execute()
    
    if not user_quests.data:
        print("No active quests found. Checking for incomplete quests...")
        user_quests = supabase.table('user_quests')\
            .select('*, quests(*)')\
            .eq('user_id', user_id)\
            .is_('completed_at', 'null')\
            .execute()
    
    if not user_quests.data:
        print("No quests to fix.")
        return
    
    for quest in user_quests.data:
        quest_title = quest['quests']['title'] if quest.get('quests') else 'Unknown'
        print(f"Found quest: {quest_title}")
        print(f"  Quest ID: {quest['quest_id']}")
        print(f"  User Quest ID: {quest['id']}")
        print(f"  Current completed_at: {quest.get('completed_at')}")
        
        if quest.get('completed_at'):
            print("  Already has completed_at, skipping...")
            continue
        
        # Get the latest task completion date for this quest
        task_completions = supabase.table('user_quest_tasks')\
            .select('completed_at')\
            .eq('user_quest_id', quest['id'])\
            .order('completed_at', desc=True)\
            .limit(1)\
            .execute()
        
        if task_completions.data:
            completion_date = task_completions.data[0]['completed_at']
            print(f"  Using task completion date: {completion_date}")
        else:
            completion_date = datetime.utcnow().isoformat()
            print(f"  No task completions found, using current time: {completion_date}")
        
        # Try direct RPC call to bypass triggers
        try:
            # Use RPC to execute raw SQL
            from postgrest import APIError
            import httpx
            
            # Build the direct SQL update query
            headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            }
            
            # Try direct PATCH request
            update_url = f"{url}/rest/v1/user_quests"
            params = f"?id=eq.{quest['id']}"
            
            response = httpx.patch(
                update_url + params,
                json={
                    'completed_at': completion_date,
                    'is_active': False
                },
                headers=headers
            )
            
            if response.status_code == 200 or response.status_code == 204:
                print(f"  [SUCCESS] Successfully marked quest as completed!")
                
                # Verify the update
                verify = supabase.table('user_quests')\
                    .select('completed_at')\
                    .eq('id', quest['id'])\
                    .single()\
                    .execute()
                
                if verify.data and verify.data.get('completed_at'):
                    print(f"  [VERIFIED] Quest now has completed_at = {verify.data['completed_at']}")
                else:
                    print(f"  [WARNING] Update may not have persisted")
            else:
                print(f"  [FAILED] Failed to update: {response.status_code}")
                print(f"    Response: {response.text}")
                
        except Exception as e:
            print(f"  [ERROR] Error updating quest: {str(e)}")
            print(f"    This might be due to database triggers or constraints")

if __name__ == "__main__":
    fix_quest_completion()
    print("\n=== DONE ===")
    print("Check your diploma page now: https://optio-frontend-dev.onrender.com/diploma")