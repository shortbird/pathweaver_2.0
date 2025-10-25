"""
Test script for Khan Academy scraper service
"""
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.dirname(__file__))

from services.khan_academy_scraper_service import khan_academy_scraper
import json

def test_scrape_course(url, subject="Math"):
    """Test scraping a single Khan Academy course"""
    print(f"\n{'='*80}")
    print(f"Testing Khan Academy Scraper")
    print(f"URL: {url}")
    print(f"Subject: {subject}")
    print(f"{'='*80}\n")

    result = khan_academy_scraper.scrape_course(url, subject)

    if result:
        print("✅ Scraping successful!\n")
        print(f"Course Title: {result['title']}")
        print(f"Description: {result['description'][:100]}..." if len(result['description']) > 100 else f"Description: {result['description']}")
        print(f"\nUnits found: {len(result['units'])}")
        print(f"\n{'-'*80}")
        print("Sample Units:")
        print(f"{'-'*80}")

        for i, unit in enumerate(result['units'][:5]):  # Show first 5 units
            print(f"\n{i+1}. {unit['title']}")
            print(f"   Description: {unit['description'][:80]}..." if len(unit['description']) > 80 else f"   Description: {unit['description']}")
            print(f"   Pillar: {unit['pillar']}")
            print(f"   XP: {unit['xp_value']}")
            print(f"   Diploma Subjects: {', '.join(unit['diploma_subjects'])}")

        if len(result['units']) > 5:
            print(f"\n... and {len(result['units']) - 5} more units")

        print(f"\n{'='*80}")
        print("✅ Test completed successfully!")
        print(f"{'='*80}\n")

        # Save to file for inspection
        output_file = "khan_scraper_test_output.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"📄 Full output saved to: {output_file}\n")

        return True
    else:
        print("❌ Scraping failed!")
        print("Check logs for details.\n")
        return False

if __name__ == "__main__":
    # Test URLs
    test_courses = [
        ("https://www.khanacademy.org/math/algebra", "Math"),
        # Add more for comprehensive testing
        # ("https://www.khanacademy.org/science/biology", "Science"),
        # ("https://www.khanacademy.org/computing/computer-programming", "Computing"),
    ]

    print("\n" + "="*80)
    print(" Khan Academy Scraper Test Suite")
    print("="*80)

    passed = 0
    failed = 0

    for url, subject in test_courses:
        if test_scrape_course(url, subject):
            passed += 1
        else:
            failed += 1

    print("\n" + "="*80)
    print(f" Test Results: {passed} passed, {failed} failed")
    print("="*80 + "\n")
