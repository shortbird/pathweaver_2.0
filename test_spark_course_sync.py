"""
Test SPARK Course Sync Webhook

Tests the /spark/webhook/course endpoint to verify:
1. Quest creation from course data
2. Sample task creation from assignments
3. HMAC signature validation

Usage:
    python test_spark_course_sync.py [--prod]

Environment variables required:
    SPARK_WEBHOOK_SECRET - HMAC secret for signing webhook payloads
"""

import os
import sys
import json
import hmac
import hashlib
import requests
from datetime import datetime

# Configuration
if '--prod' in sys.argv:
    BACKEND_URL = 'https://optio-prod-backend.onrender.com'
    print("Using PRODUCTION backend")
else:
    BACKEND_URL = 'https://optio-dev-backend.onrender.com'
    print("Using DEVELOPMENT backend")

SPARK_WEBHOOK_SECRET = os.getenv('SPARK_WEBHOOK_SECRET')

if not SPARK_WEBHOOK_SECRET:
    print('Error: SPARK_WEBHOOK_SECRET environment variable not set')
    print('\nTo set it:')
    print('  export SPARK_WEBHOOK_SECRET=<secret>')
    print('\nGet the secret from:')
    print('  Render Dashboard → optio-dev-backend → Environment → SPARK_WEBHOOK_SECRET')
    sys.exit(1)

# Test course data with assignments
course_data = {
    "spark_org_id": "24",  # Demo org ID from SPARK developer
    "spark_course_id": "test_course_biology_101",
    "course_title": "Biology 101 - Test Course",
    "course_description": "Introduction to biology - automated test course with assignments",
    "assignments": [
        {
            "spark_assignment_id": "assign_bio_001",
            "title": "Cell Structure Lab Report",
            "description": "Complete the cell structure lab and submit a detailed report with diagrams",
            "due_date": "2025-02-15T23:59:59Z"
        },
        {
            "spark_assignment_id": "assign_bio_002",
            "title": "Photosynthesis Essay",
            "description": "Write a 500-word essay explaining the process of photosynthesis",
            "due_date": "2025-02-22T23:59:59Z"
        },
        {
            "spark_assignment_id": "assign_bio_003",
            "title": "Ecosystem Project",
            "description": "Create a presentation about a local ecosystem",
            "due_date": "2025-03-01T23:59:59Z"
        }
    ]
}


def calculate_signature(payload):
    """Calculate HMAC-SHA256 signature for webhook payload"""
    # Sort keys for consistent signature
    payload_str = json.dumps(payload, separators=(',', ':'), sort_keys=True)
    signature = hmac.new(
        SPARK_WEBHOOK_SECRET.encode(),
        payload_str.encode(),
        hashlib.sha256
    ).hexdigest()
    return signature


def test_course_sync_webhook():
    """Test the course sync webhook endpoint"""
    print('\nTesting SPARK Course Sync Webhook')
    print('=' * 50)
    print(f'\nBackend URL: {BACKEND_URL}')
    print(f'Course ID: {course_data["spark_course_id"]}')
    print(f'Course Title: {course_data["course_title"]}')
    print(f'Assignment Count: {len(course_data["assignments"])}')
    print('\nAssignments:')
    for idx, assignment in enumerate(course_data['assignments'], 1):
        print(f'  {idx}. {assignment["title"]} (ID: {assignment["spark_assignment_id"]})')

    # Calculate signature
    signature = calculate_signature(course_data)
    print(f'\nCalculated HMAC signature: {signature[:20]}...')

    # Make request
    print(f'\nSending POST request to /spark/webhook/course...\n')

    try:
        response = requests.post(
            f'{BACKEND_URL}/spark/webhook/course',
            headers={
                'Content-Type': 'application/json',
                'X-Spark-Signature': signature
            },
            json=course_data,
            timeout=30
        )

        print(f'Response Status: {response.status_code}')

        try:
            response_data = response.json()
            print(f'Response Body: {json.dumps(response_data, indent=2)}')
        except json.JSONDecodeError:
            print(f'Response Text: {response.text}')
            response_data = {}

        if response.ok:
            print('\n✓ SUCCESS - Course sync webhook processed successfully')
            if 'quest_id' in response_data:
                print(f'  Quest ID: {response_data["quest_id"]}')
            if 'task_count' in response_data:
                print(f'  Tasks Created/Updated: {response_data["task_count"]}')
            if 'message' in response_data:
                print(f'  Message: {response_data["message"]}')

            print('\nNext Steps:')
            print('1. Verify quest exists in Supabase (quests table)')
            print('2. Verify sample tasks created (quest_sample_tasks table)')
            print('3. Check that spark_assignment_id is set for each task')
            print('4. Test SSO login to verify auto-enrollment works')

            if 'quest_id' in response_data:
                print_verification_queries(response_data['quest_id'])

            return response_data

        else:
            print('\n✗ FAILED - Course sync webhook returned error')
            print(f'  Status: {response.status_code}')
            error_msg = response_data.get('error', 'Unknown error')
            print(f'  Error: {error_msg}')
            sys.exit(1)

    except requests.exceptions.RequestException as e:
        print(f'\n✗ ERROR - Failed to call course sync webhook')
        print(f'  Error: {str(e)}')
        sys.exit(1)


def print_verification_queries(quest_id):
    """Print SQL queries for manual verification"""
    print(f'\nVerification Queries (run in Supabase SQL Editor):')
    print('=' * 50)
    print(f'''
-- Verify quest created
SELECT
    id,
    title,
    description,
    quest_type,
    lms_course_id,
    lms_platform,
    is_active
FROM quests
WHERE id = '{quest_id}';

-- Verify sample tasks created
SELECT
    id,
    title,
    description,
    pillar,
    xp_value,
    spark_assignment_id,
    order_index
FROM quest_sample_tasks
WHERE quest_id = '{quest_id}'
ORDER BY order_index;

-- Check if quest has OnFire Learning material link
SELECT id, title, material_link
FROM quests
WHERE id = '{quest_id}';
''')


if __name__ == '__main__':
    test_course_sync_webhook()
    print('\nTest completed successfully!')
