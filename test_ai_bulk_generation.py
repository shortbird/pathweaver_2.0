#!/usr/bin/env python3
"""
Test script for AI Bulk Quest Generation
This script tests the new bulk generation functionality
"""

import os
import json
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
API_BASE_URL = "http://localhost:5000/api"
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

def login_admin():
    """Login as admin and get access token"""
    response = requests.post(f"{API_BASE_URL}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token")
    else:
        print(f"Login failed: {response.status_code}")
        print(response.json())
        return None

def test_bulk_generation(token):
    """Test bulk quest generation"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Test parameters for small batch
    test_params = {
        "count": 5,  # Start with just 5 quests for testing
        "distribution": {
            "categories": "even",
            "difficulties": {
                "beginner": 0.4,
                "intermediate": 0.4,
                "advanced": 0.2
            },
            "themes": ["Technology", "Nature", "Community"]
        }
    }
    
    print("\n🚀 Testing Bulk Quest Generation")
    print(f"Parameters: {json.dumps(test_params, indent=2)}")
    
    response = requests.post(
        f"{API_BASE_URL}/ai-quests/generate-batch",
        headers=headers,
        json=test_params
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Success! Generated {data.get('generated_count', 0)} quests")
        print(f"   - Auto-approved: {data.get('approved_count', 0)}")
        print(f"   - Failed: {data.get('failed_count', 0)}")
        print(f"   - Job ID: {data.get('job_id')}")
        return data.get('job_id')
    else:
        print(f"\n❌ Generation failed: {response.status_code}")
        print(response.json())
        return None

def check_generation_job(token, job_id):
    """Check the status of a generation job"""
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    response = requests.get(
        f"{API_BASE_URL}/ai-quests/generation-jobs",
        headers=headers
    )
    
    if response.status_code == 200:
        jobs = response.json().get('jobs', [])
        for job in jobs:
            if job.get('id') == job_id:
                print(f"\n📊 Job Status:")
                print(f"   - Status: {job.get('status')}")
                print(f"   - Generated: {job.get('generated_count')}")
                print(f"   - Approved: {job.get('approved_count')}")
                print(f"   - Rejected: {job.get('rejected_count')}")
                if job.get('error_message'):
                    print(f"   - Error: {job.get('error_message')}")
                return job
    return None

def check_review_queue(token):
    """Check quests in review queue"""
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    response = requests.get(
        f"{API_BASE_URL}/ai-quests/review-queue",
        headers=headers
    )
    
    if response.status_code == 200:
        quests = response.json().get('quests', [])
        print(f"\n📝 Review Queue: {len(quests)} quests pending")
        
        if quests:
            print("\nTop 3 quests by quality score:")
            for quest in quests[:3]:
                print(f"   - {quest.get('quest_data', {}).get('title')}")
                print(f"     Score: {quest.get('quality_score', 0):.1f}%")
                print(f"     Category: {quest.get('quest_data', {}).get('skill_category')}")
        return quests
    else:
        print(f"Failed to fetch review queue: {response.status_code}")
        return []

def auto_publish_high_quality(token):
    """Auto-publish high quality quests"""
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    response = requests.post(
        f"{API_BASE_URL}/ai-quests/auto-publish",
        headers=headers
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"\n✅ Auto-published {data.get('published_count', 0)} high-quality quests")
        return data
    else:
        print(f"Auto-publish failed: {response.status_code}")
        return None

def main():
    """Main test function"""
    print("=" * 50)
    print("AI BULK QUEST GENERATION TEST")
    print("=" * 50)
    
    # Check if Gemini API key is configured
    if not os.getenv('GEMINI_API_KEY'):
        print("\n⚠️  WARNING: GEMINI_API_KEY not found in .env file")
        print("The generation will fall back to sample quests")
        print("To use AI generation, add your Gemini API key to the .env file")
    
    # Login as admin
    print("\n1. Logging in as admin...")
    token = login_admin()
    
    if not token:
        print("❌ Failed to login. Please check admin credentials.")
        return
    
    print("✅ Login successful")
    
    # Test bulk generation
    print("\n2. Testing bulk generation...")
    job_id = test_bulk_generation(token)
    
    if job_id:
        # Wait a moment for processing
        import time
        print("\n⏳ Waiting for generation to complete...")
        time.sleep(5)
        
        # Check job status
        print("\n3. Checking job status...")
        check_generation_job(token, job_id)
        
        # Check review queue
        print("\n4. Checking review queue...")
        quests = check_review_queue(token)
        
        # Auto-publish high quality quests
        if quests:
            print("\n5. Auto-publishing high-quality quests...")
            auto_publish_high_quality(token)
    
    print("\n" + "=" * 50)
    print("TEST COMPLETE")
    print("=" * 50)
    print("\n📌 Next steps:")
    print("   1. Check the admin panel at http://localhost:3000/admin/quests")
    print("   2. Click 'Bulk Generate' to test the UI")
    print("   3. Review and approve generated quests")
    print("   4. Monitor generation jobs in the History tab")

if __name__ == "__main__":
    main()