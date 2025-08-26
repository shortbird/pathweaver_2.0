import os
import json
from dotenv import load_dotenv
from services.quest_completion_service import QuestCompletionService

# Load environment variables
load_dotenv()

# Test data - partially filled quest in Visual/Diploma Pillars format
partial_quest = {
    "title": "Create a Stop-Motion Animation",
    "primary_pillar": "creativity",
    "intensity": "moderate",
    "big_idea": "Learn the fundamentals of stop-motion animation by creating your own short film"
}

print("Testing AI Quest Completion Service (Visual/Diploma Pillars Format)...")
print("=" * 50)
print("\nPartial Quest Data:")
print(json.dumps(partial_quest, indent=2))
print("\n" + "=" * 50)

try:
    service = QuestCompletionService()
    print("\nCalling AI to complete the quest...")
    
    completed_quest = service.complete_quest(partial_quest)
    
    print("\nCompleted Quest Data:")
    print(json.dumps(completed_quest, indent=2))
    
    print("\n" + "=" * 50)
    print("Success! Quest completed with AI in Visual/Diploma Pillars format")
    
    # Verify key fields
    print("\nKey Fields Verification:")
    print(f"- Title: {completed_quest.get('title', 'MISSING')}")
    print(f"- Big Idea: {completed_quest.get('big_idea', 'MISSING')[:50]}...")
    print(f"- Primary Pillar: {completed_quest.get('primary_pillar', 'MISSING')}")
    print(f"- What You'll Create: {len(completed_quest.get('what_youll_create', []))} items")
    print(f"- Your Mission: {len(completed_quest.get('your_mission', []))} steps")
    print(f"- Total XP: {completed_quest.get('total_xp', 0)}")
    
except ValueError as e:
    print(f"\nConfiguration Error: {e}")
    print("Please ensure GEMINI_API_KEY is set in your .env file")
except Exception as e:
    print(f"\nError: {e}")
    import traceback
    traceback.print_exc()