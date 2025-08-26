import os
from dotenv import load_dotenv
import sys
import json

# Load environment variables
load_dotenv()

# Set the Gemini API key from Railway config
os.environ['GEMINI_API_KEY'] = 'AIzaSyA8heA_kAgyMosEDIJ9tu39DRgsPZUze-E'
os.environ['CRON_SECRET'] = 'It:?nho:=d@~3ZzTE/=yQ46t,3c4[X'

# Import services
from services.generator_service import GeneratorService
from supabase import create_client

def test_ai_seed():
    """Test if AI seed exists in database"""
    print("\n1. Testing AI Seed...")
    try:
        supabase = create_client(
            os.environ.get('SUPABASE_URL'),
            os.environ.get('SUPABASE_SERVICE_KEY')
        )
        
        response = supabase.table('ai_seeds').select('*').limit(1).execute()
        
        if response.data and len(response.data) > 0:
            print("[OK] AI seed found in database")
            print(f"  Seed preview: {response.data[0]['prompt_text'][:100]}...")
            return True
        else:
            print("[FAIL] No AI seed found in database")
            print("  Creating default seed...")
            
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
- Engaging and motivating content"""
            
            result = supabase.table('ai_seeds').insert({
                'prompt_text': default_seed
            }).execute()
            
            if result.data:
                print("[OK] Default AI seed created successfully")
                return True
            else:
                print("[FAIL] Failed to create default seed")
                return False
                
    except Exception as e:
        print(f"[FAIL] Error checking AI seed: {e}")
        return False

def test_gemini_connection():
    """Test if Gemini API is accessible"""
    print("\n2. Testing Gemini API Connection...")
    try:
        import google.generativeai as genai
        genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Test with a simple prompt
        response = model.generate_content("Say 'Hello World'")
        print(f"[OK] Gemini API is working: {response.text[:50]}")
        return True
    except Exception as e:
        print(f"[FAIL] Gemini API error: {e}")
        return False

def test_quest_generation():
    """Test actual quest generation"""
    print("\n3. Testing Quest Generation...")
    try:
        generator = GeneratorService()
        
        # Get seed prompt
        seed_prompt = generator.get_seed_prompt()
        print(f"  Using seed prompt: {seed_prompt[:100]}...")
        
        # Get target pillar
        target_pillar = generator.get_pillar_balance()
        print(f"  Target pillar: {target_pillar}")
        
        # Generate a quest
        print("  Generating quest...")
        quest = generator.generate_quest()
        
        if quest:
            print(f"[OK] Quest generated successfully!")
            print(f"  Title: {quest['title']}")
            print(f"  Pillar: {quest.get('pillar', 'N/A')}")
            print(f"  Difficulty: {quest.get('difficulty', 'N/A')}")
            return True
        else:
            print("[FAIL] Failed to generate quest")
            return False
            
    except Exception as e:
        print(f"[FAIL] Error generating quest: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_database_tables():
    """Test if required database tables exist"""
    print("\n4. Testing Database Tables...")
    try:
        supabase = create_client(
            os.environ.get('SUPABASE_URL'),
            os.environ.get('SUPABASE_SERVICE_KEY')
        )
        
        required_tables = ['quests', 'ai_seeds', 'quest_ideas', 'ai_cycle_logs']
        all_exist = True
        
        for table in required_tables:
            try:
                response = supabase.table(table).select('*').limit(1).execute()
                print(f"[OK] Table '{table}' exists")
            except Exception as e:
                print(f"[FAIL] Table '{table}' not found: {e}")
                all_exist = False
        
        return all_exist
        
    except Exception as e:
        print(f"[FAIL] Error checking tables: {e}")
        return False

def main():
    print("=" * 50)
    print("PathWeaver AI Quest Generation Test")
    print("=" * 50)
    
    results = {
        'ai_seed': test_ai_seed(),
        'gemini_api': test_gemini_connection(),
        'database_tables': test_database_tables(),
        'quest_generation': test_quest_generation()
    }
    
    print("\n" + "=" * 50)
    print("Test Summary:")
    print("=" * 50)
    
    for test, passed in results.items():
        status = "[OK] PASSED" if passed else "[FAIL] FAILED"
        print(f"{test:20s}: {status}")
    
    if all(results.values()):
        print("\n[OK] All tests passed! AI quest generation should be working.")
    else:
        print("\n[FAIL] Some tests failed. Please check the errors above.")
        print("\nPossible solutions:")
        if not results['database_tables']:
            print("- Run the database migrations in Supabase")
        if not results['gemini_api']:
            print("- Check your GEMINI_API_KEY is valid")
        if not results['ai_seed']:
            print("- Ensure ai_seeds table exists and has proper permissions")

if __name__ == "__main__":
    main()