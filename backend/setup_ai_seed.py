import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Initialize Supabase client
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

# Default AI seed prompt
default_seed = """You are PathWeaver's AI Quest Creator. Your role is to generate educational quests that help learners develop skills through practical, engaging challenges.

Core principles:
1. Make quests practical and project-based
2. Focus on real-world applications
3. Ensure clear, actionable objectives
4. Balance difficulty appropriately
5. Create engaging narratives that motivate learners

Quest quality standards:
- Clear, specific objectives
- Realistic time estimates
- Appropriate difficulty scaling
- Valuable skill development
- Engaging and motivating content

Avoid:
- Vague or unclear instructions
- Unrealistic scope or timeframes
- Repetitive or boring tasks
- Overly technical jargon without explanation
- Tasks without clear learning outcomes"""

try:
    # Check if seed exists - use limit instead of single to avoid error
    existing = supabase.table('ai_seeds').select('*').limit(1).execute()
    
    if existing.data and len(existing.data) > 0:
        print("AI seed already exists. Current prompt:")
        print(existing.data[0]['prompt_text'][:200] + "...")
        update = input("\nDo you want to update it? (y/n): ")
        
        if update.lower() == 'y':
            result = supabase.table('ai_seeds').update({
                'prompt_text': default_seed
            }).eq('id', existing.data[0]['id']).execute()
            print("AI seed prompt updated successfully!")
    else:
        # Insert new seed
        result = supabase.table('ai_seeds').insert({
            'prompt_text': default_seed
        }).execute()
        print("AI seed prompt created successfully!")
        
except Exception as e:
    print(f"Error setting up AI seed: {e}")
    print("\nMake sure you have:")
    print("1. Run the database migrations in Supabase")
    print("2. Set SUPABASE_URL and SUPABASE_KEY in your .env file")