#!/usr/bin/env python3
"""
Diagnose AI quest generation issues
"""
from database import get_supabase_admin_client
from datetime import datetime, timedelta

def diagnose():
    """Check the state of AI quest generation"""
    
    print("🔍 Diagnosing AI Quest Generation System\n")
    print("=" * 50)
    
    supabase = get_supabase_admin_client()
    
    # 1. Check if tables exist and have data
    print("\n📊 Table Status:")
    print("-" * 30)
    
    tables = {
        'ai_generation_jobs': 'Generation Jobs',
        'ai_generated_quests': 'Generated Quests',
        'ai_quest_review_history': 'Review History'
    }
    
    for table_name, display_name in tables.items():
        try:
            response = supabase.table(table_name).select('id', count='exact').execute()
            count = response.count if hasattr(response, 'count') else len(response.data)
            print(f"✅ {display_name:20} - {count} records")
        except Exception as e:
            if 'does not exist' in str(e):
                print(f"❌ {display_name:20} - TABLE DOES NOT EXIST")
            else:
                print(f"⚠️  {display_name:20} - Error: {str(e)[:50]}")
    
    # 2. Check recent generation jobs
    print("\n📝 Recent Generation Jobs (last 5):")
    print("-" * 30)
    
    try:
        jobs = supabase.table('ai_generation_jobs')\
            .select('*')\
            .order('created_at', {'ascending': False})\
            .limit(5)\
            .execute()
        
        if jobs.data:
            for job in jobs.data:
                print(f"Job ID: {job['id'][:8]}...")
                print(f"  Status: {job['status']}")
                print(f"  Generated: {job['generated_count']}")
                print(f"  Created: {job['created_at']}")
                if job.get('error_message'):
                    print(f"  Error: {job['error_message'][:100]}")
                print()
        else:
            print("No generation jobs found")
    except Exception as e:
        print(f"Error fetching jobs: {str(e)}")
    
    # 3. Check pending quests
    print("\n🔄 Pending Review Quests:")
    print("-" * 30)
    
    try:
        pending = supabase.table('ai_generated_quests')\
            .select('id, review_status, quality_score')\
            .eq('review_status', 'pending')\
            .limit(10)\
            .execute()
        
        if pending.data:
            print(f"Found {len(pending.data)} quests pending review")
            for quest in pending.data[:5]:
                print(f"  - ID: {quest['id'][:8]}... | Score: {quest['quality_score']}")
        else:
            print("No quests pending review")
            
        # Check other statuses
        all_quests = supabase.table('ai_generated_quests')\
            .select('review_status', count='exact')\
            .execute()
        
        if all_quests.data:
            print(f"\nTotal quests in ai_generated_quests: {len(all_quests.data)}")
            
            # Count by status
            status_counts = {}
            for quest in all_quests.data:
                status = quest.get('review_status', 'unknown')
                status_counts[status] = status_counts.get(status, 0) + 1
            
            print("Status breakdown:")
            for status, count in status_counts.items():
                print(f"  - {status}: {count}")
                
    except Exception as e:
        print(f"Error fetching quests: {str(e)}")
    
    # 4. Check if quests are making it to the main table
    print("\n📚 Published Quests (main quests table):")
    print("-" * 30)
    
    try:
        # Check for AI-generated quests in main table
        ai_quests = supabase.table('quests')\
            .select('id, title')\
            .eq('is_ai_generated', True)\
            .limit(5)\
            .execute()
        
        if ai_quests.data:
            print(f"Found {len(ai_quests.data)} AI-generated quests in library:")
            for quest in ai_quests.data:
                print(f"  - {quest['title'][:50]}...")
        else:
            print("No AI-generated quests found in main library")
            
    except Exception as e:
        if 'is_ai_generated' in str(e):
            print("Note: 'is_ai_generated' column may not exist in quests table")
        else:
            print(f"Error checking published quests: {str(e)}")
    
    print("\n" + "=" * 50)
    print("\n💡 Next Steps:")
    print("-" * 30)
    
    print("""
1. If tables don't exist:
   - Run the migration in Supabase SQL editor
   
2. If tables exist but no data:
   - Check backend logs when generating quests
   - Verify Gemini API key is set
   
3. If data exists but review queue is empty:
   - Check frontend console for errors
   - Verify API endpoints are correct
   
4. If quests are pending but not showing:
   - Check Row Level Security policies
   - Ensure admin user has proper permissions
    """)

if __name__ == "__main__":
    diagnose()