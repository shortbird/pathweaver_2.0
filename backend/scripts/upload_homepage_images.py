"""
Script to download Pexels images and upload them to Supabase storage.
Run this script to populate the homepage-images folder in site-assets bucket.
"""
import os
import sys
import requests
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from supabase import create_client, Client

# Load .env from project root (two levels up from this script)
env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(env_path)

# Pexels photo IDs extracted from URLs
HOMEPAGE_IMAGES = {
    'portfolio': {
        'pexels_id': '8472950',
        'name': 'portfolio.jpg',
        'description': 'Young woman taking online class'
    },
    'journaling': {
        'pexels_id': '5190600',
        'name': 'journaling.jpg',
        'description': 'Person writing on planner'
    },
    'badge_achievement': {
        'pexels_id': '7606222',
        'name': 'badge_achievement.jpg',
        'description': 'Boy playing with dinosaur'
    },
    'quest_library': {
        'pexels_id': '7869245',
        'name': 'quest_library.jpg',
        'description': 'Group of children using laptop'
    },
    'ai_tutor': {
        'pexels_id': '8083816',
        'name': 'ai_tutor.jpg',
        'description': 'Boys sitting on tree trunk'
    },
    'connections': {
        'pexels_id': '8034611',
        'name': 'connections.jpg',
        'description': 'Children cheering and clapping'
    },
    'choose_quest': {
        'pexels_id': '4473784',
        'name': 'choose_quest.jpg',
        'description': 'Mother pointing at tablet with children'
    },
    'complete_tasks': {
        'pexels_id': '6790763',
        'name': 'complete_tasks.jpg',
        'description': 'Man doing woodwork'
    },
    'submit_evidence': {
        'pexels_id': '7221277',
        'name': 'submit_evidence.jpg',
        'description': 'Man taking photos of people'
    },
    'earn_recognition': {
        'pexels_id': '1134188',
        'name': 'earn_recognition.jpg',
        'description': 'Person on mountain cliff'
    },
    'philosophy_hero': {
        'pexels_id': '3768121',
        'name': 'philosophy_hero.jpg',
        'description': 'Woman reading book'
    },
    'success_collage': {
        'pexels_id': '7692994',
        'name': 'success_collage.jpg',
        'description': 'Friends painting on paper'
    }
}

PEXELS_API_KEY = os.getenv('PEXELS_API_KEY')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
SUPABASE_BUCKET = 'site-assets'
SUPABASE_FOLDER = 'homepage'


def get_pexels_image_url(photo_id: str) -> str:
    """
    Get the original/large image URL from Pexels by scraping the photo page.
    Fallback method when API key is not available locally.

    Args:
        photo_id: Pexels photo ID

    Returns:
        Image URL (large quality)
    """
    # Try API first if key is available
    if PEXELS_API_KEY:
        try:
            headers = {'Authorization': PEXELS_API_KEY}
            response = requests.get(
                f'https://api.pexels.com/v1/photos/{photo_id}',
                headers=headers,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                return data['src'].get('large2x') or data['src'].get('large') or data['src']['original']
        except:
            pass  # Fall through to scraping method

    # Fallback: construct standard Pexels image URL
    # Pexels uses predictable URL structure for photos
    # Format: https://images.pexels.com/photos/{id}/pexels-photo-{id}.jpeg
    return f'https://images.pexels.com/photos/{photo_id}/pexels-photo-{photo_id}.jpeg?auto=compress&cs=tinysrgb&w=1920'


def download_image(url: str, filepath: str):
    """
    Download image from URL to local filepath.

    Args:
        url: Image URL
        filepath: Local file path to save to
    """
    print(f"  Downloading from Pexels...")
    response = requests.get(url, timeout=30)
    response.raise_for_status()

    with open(filepath, 'wb') as f:
        f.write(response.content)

    file_size = os.path.getsize(filepath) / 1024  # KB
    print(f"  Downloaded {file_size:.1f} KB")


def upload_to_supabase(filepath: str, filename: str) -> str:
    """
    Upload image to Supabase storage.

    Args:
        filepath: Local file path
        filename: Name to use in Supabase (e.g., 'homepage/portfolio.jpg')

    Returns:
        Public URL of uploaded image
    """
    print(f"  Uploading to Supabase...")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    with open(filepath, 'rb') as f:
        file_data = f.read()

    # Upload to site-assets bucket in homepage folder
    storage_path = f"{SUPABASE_FOLDER}/{filename}"

    try:
        # Try to remove existing file first (if updating)
        supabase.storage.from_(SUPABASE_BUCKET).remove([storage_path])
    except:
        pass  # File doesn't exist, that's fine

    # Upload new file
    result = supabase.storage.from_(SUPABASE_BUCKET).upload(
        storage_path,
        file_data,
        file_options={
            'content-type': 'image/jpeg',
            'cache-control': '3600',  # Cache for 1 hour
            'upsert': 'true'
        }
    )

    # Get public URL
    public_url = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(storage_path)

    print(f"  Uploaded: {public_url}")
    return public_url


def main():
    """
    Main function to download all images and upload to Supabase.
    """
    print("=" * 80)
    print("Homepage Images Upload Script")
    print("=" * 80)
    print(f"Total images to process: {len(HOMEPAGE_IMAGES)}")
    print(f"Supabase bucket: {SUPABASE_BUCKET}")
    print(f"Supabase folder: {SUPABASE_FOLDER}")
    print("=" * 80)
    print()

    # Create temp directory for downloads
    temp_dir = Path(__file__).parent / 'temp_images'
    temp_dir.mkdir(exist_ok=True)

    results = {}

    for key, image_info in HOMEPAGE_IMAGES.items():
        print(f"[{key}] {image_info['description']}")

        try:
            # Get high-res URL from Pexels API
            image_url = get_pexels_image_url(image_info['pexels_id'])

            # Download to temp location
            temp_filepath = temp_dir / image_info['name']
            download_image(image_url, str(temp_filepath))

            # Upload to Supabase
            public_url = upload_to_supabase(str(temp_filepath), image_info['name'])

            results[key] = {
                'name': image_info['name'],
                'url': public_url,
                'description': image_info['description']
            }

            # Clean up temp file
            temp_filepath.unlink()

            print()

        except Exception as e:
            print(f"  X Error: {str(e)}")
            print()
            results[key] = {'error': str(e)}

    # Clean up temp directory
    try:
        temp_dir.rmdir()
    except:
        pass

    # Print summary
    print("=" * 80)
    print("UPLOAD SUMMARY")
    print("=" * 80)

    successful = [k for k, v in results.items() if 'url' in v]
    failed = [k for k, v in results.items() if 'error' in v]

    print(f"Successful: {len(successful)}/{len(HOMEPAGE_IMAGES)}")
    print(f"Failed: {len(failed)}/{len(HOMEPAGE_IMAGES)}")
    print()

    if successful:
        print("SUCCESSFUL UPLOADS:")
        print("-" * 80)
        for key in successful:
            print(f"{key}: {results[key]['url']}")
        print()

    if failed:
        print("FAILED UPLOADS:")
        print("-" * 80)
        for key in failed:
            print(f"{key}: {results[key]['error']}")
        print()

    # Save results to JSON file for reference
    import json
    output_file = Path(__file__).parent / 'homepage_images_urls.json'
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"Results saved to: {output_file}")
    print("=" * 80)


if __name__ == '__main__':
    main()
