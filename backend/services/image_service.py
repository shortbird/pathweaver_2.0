"""
Image service for fetching quest images from Pexels API.
Enhanced with AI-powered educational search term generation.
"""
import os
import requests
from typing import Optional, Dict
import re
import google.generativeai as genai
from services.api_usage_tracker import pexels_tracker

PEXELS_API_KEY = os.getenv('PEXELS_API_KEY')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search'

# Configure Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

def generate_educational_search_prompt(quest_title: str, quest_description: Optional[str] = None) -> Optional[str]:
    """
    Use AI to generate an optimized educational search term for Pexels.

    Args:
        quest_title: The title of the quest
        quest_description: Optional description/big_idea

    Returns:
        Single optimized search term, or None if AI fails
    """
    if not GEMINI_API_KEY:
        return None

    try:
        model = genai.GenerativeModel('gemini-2.0-flash-lite')

        prompt = f"""You are helping find a stock photo for an educational quest. Think like a PHOTOGRAPHER - what physical objects and actions would be in the frame?

Quest Title: {quest_title}
{f'Description: {quest_description[:200]}' if quest_description else ''}

Generate ONE search term (2-5 words) using CONCRETE, LITERAL visual elements that a photographer could capture.

CRITICAL RULES:
1. Use SPECIFIC PHYSICAL OBJECTS (calculator, money, egg, robot, paint, camera, etc.)
2. Use LITERAL ACTIONS (falling, building, painting, coding, etc.)
3. NO METAPHORS (avoid: tree, roots, journey, path, growth, foundation when metaphorical)
4. NO ABSTRACT CONCEPTS (avoid: learning, discovery, understanding as primary terms)
5. Think: "What objects are physically in this photo?"

GOOD EXAMPLES (concrete objects):
"Master Your Money" → "budget calculator money spreadsheet"
"Egg Drop Challenge" → "egg falling parachute experiment"
"Build a Robot" → "robotic arm mechanical parts"
"Learn Photography" → "camera lens photography equipment"
"Create Digital Art" → "digital tablet stylus drawing"
"Ancient Rome" → "roman colosseum ruins architecture"
"Coding Basics" → "programming laptop code screen"

BAD EXAMPLES (too metaphorical/abstract):
❌ "financial growth tree" (metaphor - would return tree images)
❌ "learning journey path" (abstract - unclear visuals)
❌ "discovery adventure" (vague - no concrete objects)
❌ "knowledge foundation" (metaphorical)

Return ONLY the search term with concrete objects/actions, nothing else.
"""

        response = model.generate_content(prompt)
        search_term = response.text.strip().strip('"').strip("'")

        # Validate it's not too long
        if len(search_term.split()) > 6:
            print(f"AI term too long, rejecting: '{search_term}'")
            return None

        # Check for abstract/metaphorical words that cause bad results
        abstract_words = [
            'tree', 'roots', 'journey', 'path', 'growth', 'foundation',
            'discovery', 'adventure', 'exploration', 'vision', 'dream'
        ]

        search_lower = search_term.lower()
        for word in abstract_words:
            if word in search_lower:
                # Check if it's being used metaphorically (not in quest title)
                if word.lower() not in quest_title.lower():
                    print(f"AI term contains metaphorical word '{word}', rejecting: '{search_term}'")
                    return None

        print(f"AI generated search term: '{search_term}' for quest: {quest_title}")
        return search_term

    except Exception as e:
        print(f"AI search term generation failed: {str(e)}")

    return None


def extract_key_nouns(quest_title: str) -> Optional[str]:
    """
    Extract key nouns from quest title as fallback when AI fails.

    Args:
        quest_title: The title of the quest

    Returns:
        Space-separated key nouns, or None
    """
    # Remove common filler words
    filler_words = {
        'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by',
        'from', 'this', 'that', 'your', 'you', 'how', 'what', 'when', 'where',
        'why', 'learn', 'explore', 'discover', 'understand', 'master', 'create',
        'build', 'make', 'design', 'develop', 'introduction', 'basics', 'guide'
    }

    # Split title and filter
    words = quest_title.lower().split()
    nouns = [w for w in words if w not in filler_words and len(w) > 2]

    # Take first 3-4 meaningful words
    key_nouns = ' '.join(nouns[:4])

    if key_nouns and len(key_nouns) > 3:
        print(f"Extracted key nouns: '{key_nouns}' from title: {quest_title}")
        return key_nouns

    return None


def generate_badge_search_prompt(badge_name: str, identity_statement: str, teen_focused: bool = True) -> Optional[str]:
    """
    Use AI to generate an optimized teen-focused search term for badge images.

    Args:
        badge_name: The name of the badge
        identity_statement: The "I am..." or "I can..." statement
        teen_focused: If True, adds teen/teenager keywords to search

    Returns:
        Single optimized search term, or None if AI fails
    """
    if not GEMINI_API_KEY:
        return None

    try:
        model = genai.GenerativeModel('gemini-2.0-flash-lite')

        teen_prefix = "teenage teen student " if teen_focused else ""

        prompt = f"""You are helping find a stock photo for a learning badge for teenagers. Think like a PHOTOGRAPHER - what physical objects, actions, and people would be in the frame?

Badge Name: {badge_name}
Identity Statement: {identity_statement}

Generate ONE search term (3-6 words) that starts with "teenage teen student" and includes CONCRETE, LITERAL visual elements.

CRITICAL RULES:
1. ALWAYS start with "teenage teen student" for age-appropriate images
2. Use SPECIFIC PHYSICAL OBJECTS (calculator, microscope, paint, camera, musical instrument, sports equipment, etc.)
3. Use LITERAL ACTIONS (studying, creating, playing, building, writing, etc.)
4. Include DIVERSE REPRESENTATION (avoid specifying race/ethnicity)
5. Think: "What would a teen doing this activity look like in a photo?"

GOOD EXAMPLES (concrete, teen-focused):
"Math Master" + "I can solve complex problems" → "teenage teen student math calculator equations solving"
"Environmental Advocate" + "I make sustainable choices" → "teenage teen student recycling sustainability gardening"
"Creative Writer" + "I express ideas through writing" → "teenage teen student writing notebook journal"
"Musician" + "I create and perform music" → "teenage teen student playing guitar music instrument"
"Athlete" + "I stay active and healthy" → "teenage teen student sports exercise running"
"Coder" + "I build software" → "teenage teen student programming laptop coding computer"

BAD EXAMPLES (too abstract or no teen focus):
❌ "learning journey achievement" (abstract, no teen focus)
❌ "success growth mindset" (metaphorical)
❌ "future leader" (vague, no concrete objects)

Return ONLY the search term starting with "teenage teen student", nothing else.
"""

        response = model.generate_content(prompt)
        search_term = response.text.strip().strip('"').strip("'")

        # Validate it starts with teen keywords (if teen_focused)
        if teen_focused and not any(word in search_term.lower() for word in ['teen', 'student', 'young']):
            search_term = f"teenage teen student {search_term}"

        # Validate it's not too long
        if len(search_term.split()) > 8:
            print(f"AI term too long, rejecting: '{search_term}'")
            return None

        print(f"AI generated badge search term: '{search_term}' for badge: {badge_name}")
        return search_term

    except Exception as e:
        print(f"Badge AI search term generation failed: {str(e)}")

    return None


def search_badge_image(badge_name: str, identity_statement: str, pillar: Optional[str] = None) -> Optional[str]:
    """
    Search for a relevant teen-focused image for a badge using Pexels API.

    Args:
        badge_name: The name of the badge
        identity_statement: The "I am..." or "I can..." statement
        pillar: Optional pillar name for fallback search

    Returns:
        Image URL if found, None otherwise
    """
    if not PEXELS_API_KEY:
        print("Warning: PEXELS_API_KEY not configured")
        return None

    headers = {
        'Authorization': PEXELS_API_KEY
    }

    # Build search strategy - AI first, then smart fallbacks
    search_terms = []

    # Try AI-enhanced search first (free, doesn't count against Pexels limit)
    ai_term = generate_badge_search_prompt(badge_name, identity_statement, teen_focused=True)
    if ai_term:
        search_terms.append(ai_term)

    # Fallback strategies (in order of quality)
    # Extract key words from badge name and identity statement
    key_words = []
    for word in badge_name.split():
        if len(word) > 3:
            key_words.append(word)

    if key_words:
        teen_focused_fallback = f"teenage teen student {' '.join(key_words[:2])}"
        search_terms.append(teen_focused_fallback)

    search_terms.extend([
        f"teenager student {badge_name}",  # Fallback 2: badge name with teen keyword
        f"teen {pillar}" if pillar else None,  # Fallback 3: pillar with teen keyword
        'teenage student learning',  # Fallback 4: generic teen education
    ])

    for search_term in search_terms:
        if not search_term:
            continue

        # Check API limit before making request
        if not pexels_tracker.can_make_request():
            print(f"Pexels API rate limit reached. Skipping image fetch.")
            return None

        try:
            response = requests.get(
                PEXELS_SEARCH_URL,
                headers=headers,
                params={
                    'query': search_term,
                    'per_page': 1,
                    'orientation': 'landscape'  # Better for cards
                },
                timeout=5
            )

            # Track the API call
            pexels_tracker.increment()

            if response.status_code == 200:
                data = response.json()
                if data.get('photos') and len(data['photos']) > 0:
                    # Return the medium-sized image URL
                    print(f"Found image for badge '{badge_name}' using term: '{search_term}'")
                    return data['photos'][0]['src']['medium']

        except requests.RequestException as e:
            print(f"Pexels API error for '{search_term}': {str(e)}")
            continue

    return None


def search_quest_image(quest_title: str, quest_description: Optional[str] = None, pillar: Optional[str] = None) -> Optional[str]:
    """
    Search for a relevant image using Pexels API with AI-enhanced search terms.

    Uses ONLY 1 Pexels API call per quest by using AI to optimize the search term.

    Args:
        quest_title: The title of the quest
        quest_description: Optional description/big_idea for better AI context
        pillar: Optional pillar name for fallback search

    Returns:
        Image URL if found, None otherwise
    """
    if not PEXELS_API_KEY:
        print("Warning: PEXELS_API_KEY not configured")
        return None

    headers = {
        'Authorization': PEXELS_API_KEY
    }

    # Build search strategy - AI first, then smart fallbacks
    search_terms = []

    # Try AI-enhanced search first (free, doesn't count against Pexels limit)
    ai_term = generate_educational_search_prompt(quest_title, quest_description)
    if ai_term:
        search_terms.append(ai_term)

    # Fallback strategies (in order of quality)
    noun_extract = extract_key_nouns(quest_title)  # Extract concrete nouns
    search_terms.extend([
        noun_extract if noun_extract else None,  # Fallback 1: extracted nouns
        quest_title,  # Fallback 2: quest title as-is
        pillar if pillar else None,  # Fallback 3: pillar name
        'education learning',  # Fallback 4: generic education
    ])

    for search_term in search_terms:
        if not search_term:
            continue

        # Check API limit before making request
        if not pexels_tracker.can_make_request():
            print(f"Pexels API rate limit reached. Skipping image fetch.")
            return None

        try:
            response = requests.get(
                PEXELS_SEARCH_URL,
                headers=headers,
                params={
                    'query': search_term,
                    'per_page': 1,
                    'orientation': 'landscape'  # Better for cards
                },
                timeout=5
            )

            # Track the API call
            pexels_tracker.increment()

            if response.status_code == 200:
                data = response.json()
                if data.get('photos') and len(data['photos']) > 0:
                    # Return the medium-sized image URL
                    print(f"Found image for '{quest_title}' using term: '{search_term}'")
                    return data['photos'][0]['src']['medium']

        except requests.RequestException as e:
            print(f"Pexels API error for '{search_term}': {str(e)}")
            continue

    return None


def get_pexels_image_info(quest_title: str, pillar: Optional[str] = None) -> Optional[Dict[str, str]]:
    """
    Get detailed image information from Pexels API.

    Args:
        quest_title: The title of the quest
        pillar: Optional pillar name for fallback search

    Returns:
        Dict with image_url and other metadata if found, None otherwise
    """
    if not PEXELS_API_KEY:
        print("Warning: PEXELS_API_KEY not configured")
        return None

    headers = {
        'Authorization': PEXELS_API_KEY
    }

    # Try search strategies in order
    search_terms = [
        quest_title,  # Primary: quest title
        pillar if pillar else None,  # Fallback 1: pillar name
        'education learning',  # Fallback 2: generic education
    ]

    for search_term in search_terms:
        if not search_term:
            continue

        try:
            response = requests.get(
                PEXELS_SEARCH_URL,
                headers=headers,
                params={'query': search_term, 'per_page': 1},
                timeout=5
            )

            if response.status_code == 200:
                data = response.json()
                if data.get('photos') and len(data['photos']) > 0:
                    photo = data['photos'][0]
                    return {
                        'image_url': photo['src']['medium'],
                        'image_url_large': photo['src']['large'],
                        'image_url_original': photo['src']['original'],
                        'photographer': photo.get('photographer', 'Unknown'),
                        'photographer_url': photo.get('photographer_url', ''),
                        'pexels_url': photo.get('url', ''),
                        'search_term': search_term
                    }

        except requests.RequestException as e:
            print(f"Pexels API error for '{search_term}': {str(e)}")
            continue

    return None
