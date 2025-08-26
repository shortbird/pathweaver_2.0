import json
import requests
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Test data - Visual/Diploma Pillars format quest
test_quest = {
    "title": "Test Quest from API",
    "big_idea": "Learn something new through this test quest",
    "what_youll_create": ["A test project", "Documentation"],
    "primary_pillar": "creativity",
    "primary_pillar_icon": "🎨",
    "intensity": "moderate",
    "estimated_time": "2-3 hours",
    "your_mission": ["Step 1: Plan", "Step 2: Create", "Step 3: Document"],
    "showcase_your_journey": "Document your process with photos and reflections",
    "helpful_resources": {
        "tools": ["Computer"],
        "materials": ["Paper", "Pencil"],
        "links": ["https://example.com"]
    },
    "core_competencies": ["planning", "creating", "documenting"],
    "collaboration_spark": "Work with a friend",
    "skill_xp_awards": [
        {"skill_category": "creativity", "xp_amount": 100}
    ],
    "total_xp": 100
}

# You'll need a valid admin token - get this from your browser's network tab when logged in as admin
# Look for the Authorization header in any admin API call
print("Testing quest creation with Visual/Diploma Pillars format...")
print("=" * 50)
print("\nTest Quest Data:")
print(json.dumps(test_quest, indent=2))
print("\n" + "=" * 50)

# Note: You need to manually set the AUTH_TOKEN below
AUTH_TOKEN = "YOUR_ADMIN_AUTH_TOKEN_HERE"  # Replace with actual token

if AUTH_TOKEN == "YOUR_ADMIN_AUTH_TOKEN_HERE":
    print("\nERROR: Please set AUTH_TOKEN in the script")
    print("1. Log in as admin in your browser")
    print("2. Open Developer Tools > Network tab")
    print("3. Make any admin action (like viewing quests)")
    print("4. Find the Authorization header in the request")
    print("5. Copy the token (everything after 'Bearer ')")
    print("6. Replace YOUR_ADMIN_AUTH_TOKEN_HERE with the token")
else:
    # Test against local backend
    url = "http://localhost:8000/api/admin/quests"
    headers = {
        "Authorization": f"Bearer {AUTH_TOKEN}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, json=test_quest, headers=headers)
        
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response Body: {response.text}")
        
        if response.status_code == 201:
            print("\nSUCCESS! Quest created with Visual format")
            data = response.json()
            print(f"Quest ID: {data.get('quest_id')}")
        else:
            print(f"\nERROR: Failed to create quest")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"\nERROR: {e}")
        print("Make sure the backend is running locally on port 8000")