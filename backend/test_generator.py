import os
from dotenv import load_dotenv
load_dotenv()

import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.generator_service import GeneratorService

def test_generator():
    print("Testing AI Quest Generator...")
    generator = GeneratorService()
    result = generator.run_generation_cycle()
    
    if result:
        print(f"\nQuest generated successfully!")
        print(f"ID: {result['id']}")
        print(f"Title: {result['title']}")
        print(f"Status: {result['status']}")
        print(f"Quality Score: {result['quality_score']}")
    else:
        print("\nFailed to generate quest")
    
    return result

if __name__ == "__main__":
    test_generator()