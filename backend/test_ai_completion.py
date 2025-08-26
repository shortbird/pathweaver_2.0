import os
import json
from dotenv import load_dotenv
from services.quest_completion_service import QuestCompletionService

# Load environment variables
load_dotenv()

# Test data - partially filled quest
partial_quest = {
    "title": "Create a Stop-Motion Animation",
    "difficulty_level": "intermediate",
    "description": "Learn the basics of stop-motion animation by creating your own short film"
}

print("Testing AI Quest Completion Service...")
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
    print("Success! Quest completed with AI")
    
except ValueError as e:
    print(f"\nConfiguration Error: {e}")
    print("Please ensure GEMINI_API_KEY is set in your .env file")
except Exception as e:
    print(f"\nError: {e}")
    import traceback
    traceback.print_exc()