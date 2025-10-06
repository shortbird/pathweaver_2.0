"""
Image service for fetching quest images from Pexels API.
Enhanced with AI-powered educational search term generation.
"""
import os
import requests
from typing import Optional, Dict
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

        prompt = f"""You are helping find a visually compelling stock photo for this educational quest. The image should make students excited to do the quest.

Quest Title: {quest_title}
{f'Description: {quest_description[:200]}' if quest_description else ''}

Generate ONE concise search term (2-4 words) that will find a visually exciting, relevant photo.

FOCUS ON:
- The ACTIVITY or CONCEPT itself (not the classroom/educational setting)
- Visual drama, action, or compelling imagery
- What makes this quest exciting or interesting
- The actual subject matter students will experience

AVOID:
- Generic classroom or school settings
- "student learning X" phrases
- Educational context words like "classroom", "lesson", "teaching"
- Bulletin boards, worksheets, or school supplies

EXAMPLES:
Quest: "Egg Drop Engineering Challenge" → "egg falling physics experiment"
Quest: "Build a Robot Arm" → "robotic arm mechanical engineering"
Quest: "Create Digital Art" → "digital painting creative design"
Quest: "Explore Ancient Rome" → "roman colosseum architecture"
Quest: "Photography Basics" → "professional camera photography"

Return ONLY the search term, nothing else.
"""

        response = model.generate_content(prompt)
        search_term = response.text.strip().strip('"').strip("'")

        # Validate it's not too long
        if len(search_term.split()) <= 6:
            print(f"AI generated search term: '{search_term}' for quest: {quest_title}")
            return search_term

    except Exception as e:
        print(f"AI search term generation failed: {str(e)}")

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

    # Build search strategy - AI first, then fallbacks
    search_terms = []

    # Try AI-enhanced search first (free, doesn't count against Pexels limit)
    ai_term = generate_educational_search_prompt(quest_title, quest_description)
    if ai_term:
        search_terms.append(ai_term)

    # Fallback strategies
    search_terms.extend([
        quest_title,  # Fallback 1: quest title
        pillar if pillar else None,  # Fallback 2: pillar name
        'education learning',  # Fallback 3: generic education
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
