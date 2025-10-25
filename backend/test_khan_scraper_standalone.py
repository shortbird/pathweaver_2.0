"""
Standalone test for Khan Academy scraping logic (no dependencies)
"""
import requests
from bs4 import BeautifulSoup
import json

def scrape_khan_course(url):
    """Test scraping a Khan Academy course"""
    print(f"\n{'='*80}")
    print(f"Scraping: {url}")
    print(f"{'='*80}\n")

    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    try:
        response = session.get(url, timeout=15)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # Extract title
        title = None
        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            title = og_title['content'].split('|')[0].strip()

        if not title:
            title_tag = soup.find('title')
            if title_tag:
                title = title_tag.get_text().split('|')[0].strip()

        print(f"✅ Course Title: {title or 'NOT FOUND'}")

        # Extract description
        desc = None
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc and meta_desc.get('content'):
            desc = meta_desc['content'].strip()

        print(f"✅ Description: {desc[:100] if desc else 'NOT FOUND'}...")

        # Try to find units/lessons
        # Strategy: Look for navigation links, sections, or list items
        print(f"\n{'='*80}")
        print("Searching for units/sections...")
        print(f"{'='*80}\n")

        # Try different selectors
        selectors = [
            ('nav a[href*="/"]', 'Navigation links'),
            ('div[class*="unit"]', 'Div with "unit" class'),
            ('section', 'Section elements'),
            ('li a', 'List item links'),
            ('h2, h3', 'Headings'),
        ]

        found_units = []
        for selector, desc_text in selectors:
            elements = soup.select(selector)
            if elements:
                print(f"  Found {len(elements)} elements with selector: {selector} ({desc_text})")

                # Show sample
                for elem in elements[:5]:
                    text = elem.get_text().strip()
                    if text and len(text) < 100:
                        print(f"    - {text[:80]}")

                if not found_units and len(elements) >= 3:
                    found_units = elements
            else:
                print(f"  No elements found for: {selector}")

        if found_units:
            print(f"\n✅ Likely found {len(found_units)} units/lessons")
        else:
            print(f"\n⚠️  Could not identify units - may need to adjust selectors")

        return {
            'title': title,
            'description': desc,
            'units_found': len(found_units)
        }

    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        return None

if __name__ == "__main__":
    # Test with Algebra course
    result = scrape_khan_course("https://www.khanacademy.org/math/algebra")

    if result:
        print(f"\n{'='*80}")
        print("Summary:")
        print(f"  Title: {result['title']}")
        print(f"  Description: {result['description'][:60] if result['description'] else 'None'}...")
        print(f"  Units found: {result['units_found']}")
        print(f"{'='*80}\n")
