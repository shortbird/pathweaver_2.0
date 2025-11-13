"""
Upload email assets (logo) to Supabase storage
Run this script once to upload assets for email templates
"""
import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from database import get_supabase_admin_client

def upload_email_assets():
    """Upload email assets to Supabase site-assets bucket"""
    supabase = get_supabase_admin_client()

    # Path to logo file
    logo_path = backend_dir.parent / 'design-system' / 'mockups' / 'logo_types' / 'OptioLogo-FullColor.png'

    if not logo_path.exists():
        print(f"Error: Logo file not found at {logo_path}")
        return False

    print(f"Uploading logo from {logo_path}...")

    try:
        # Read logo file
        with open(logo_path, 'rb') as f:
            logo_content = f.read()

        # Upload to site-assets bucket under email/ folder
        response = supabase.storage.from_('site-assets').upload(
            path='email/optio-logo.png',
            file=logo_content,
            file_options={"content-type": "image/png", "upsert": "true"}
        )

        # Get public URL
        url = supabase.storage.from_('site-assets').get_public_url('email/optio-logo.png')

        print(f"✓ Logo uploaded successfully!")
        print(f"Public URL: {url}")

        return url

    except Exception as e:
        print(f"Error uploading logo: {str(e)}")
        return False

if __name__ == '__main__':
    url = upload_email_assets()
    if url:
        print(f"\nAdd this URL to your email templates:")
        print(f"LOGO_URL = '{url}'")
    else:
        print("\nUpload failed!")
        sys.exit(1)
