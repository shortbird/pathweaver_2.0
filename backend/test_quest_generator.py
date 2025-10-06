"""
Test script for quest concept generation
"""
import os
import sys
from services.quest_ai_service import QuestAIService

# Test the new lightweight quest concept generation
def test_quest_concept_generation():
    print("Testing Quest Concept Generation...")
    print("-" * 50)

    service = QuestAIService()

    # Test 1: Generate without avoid list
    print("\nTest 1: Basic generation")
    result1 = service.generate_quest_concept()

    if result1.get('success'):
        quest1 = result1['quest']
        print(f"✓ Generated: {quest1['title']}")
        print(f"  Description: {quest1['big_idea']}")
    else:
        print(f"✗ Failed: {result1.get('error')}")

    # Test 2: Generate with avoid list
    print("\nTest 2: Generation with avoid list")
    avoid_titles = [
        "Build a Treehouse",
        "Learn to Surf",
        "Start a Small Business",
        "Create a Podcast Series"
    ]

    result2 = service.generate_quest_concept(avoid_titles=avoid_titles)

    if result2.get('success'):
        quest2 = result2['quest']
        print(f"✓ Generated: {quest2['title']}")
        print(f"  Description: {quest2['big_idea']}")

        # Check if it avoided the titles
        if quest2['title'] in avoid_titles:
            print(f"  ⚠ WARNING: Generated quest was in avoid list!")
        else:
            print(f"  ✓ Successfully avoided duplicate titles")
    else:
        print(f"✗ Failed: {result2.get('error')}")

    # Test 3: Generate 5 concepts
    print("\nTest 3: Generate 5 unique concepts")
    generated_titles = []

    for i in range(5):
        result = service.generate_quest_concept(avoid_titles=generated_titles)
        if result.get('success'):
            quest = result['quest']
            print(f"  {i+1}. {quest['title']}")
            generated_titles.append(quest['title'])
        else:
            print(f"  {i+1}. Failed: {result.get('error')}")

    print("\n" + "-" * 50)
    print("Test completed!")

if __name__ == "__main__":
    test_quest_concept_generation()
