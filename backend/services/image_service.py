"""
Image service for fetching quest images from Pexels API.
"""
import os
import requests
from typing import Optional, Dict

PEXELS_API_KEY = os.getenv('PEXELS_API_KEY')
PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search'

def search_quest_image(quest_title: str, pillar: Optional[str] = None) -> Optional[str]:
    """
    Search for a relevant image using Pexels API.

    Args:
        quest_title: The title of the quest
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
                    # Return the medium-sized image URL
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
