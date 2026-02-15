#!/usr/bin/env python3
"""Add missing subject XP from completions since last user_subject_xp update."""
import os
import sys
from datetime import datetime
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client
from utils.school_subjects import normalize_subject_key

dry_run = '--live' not in sys.argv
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

print("=" * 60)
print("Add Missing Subject XP from Recent Completions")
print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
print("=" * 60)

# Get current user_subject_xp records with their last update timestamps
current_records = client.table('user_subject_xp').select('*').eq('user_id', user_id).execute()
subject_data = {}
for r in (current_records.data or []):
    subject_data[r['school_subject']] = {
        'id': r['id'],
        'current_xp': r['xp_amount'],
        'updated_at': r['updated_at']
    }

print(f"\n=== Current user_subject_xp records ===")
for subject, data in sorted(subject_data.items()):
    print(f"  {subject}: {data['current_xp']} XP (updated: {data['updated_at'][:16]})")

# Get all completions
completions = client.table('quest_task_completions').select(
    'completed_at, user_quest_tasks!inner(diploma_subjects, xp_value)'
).eq('user_id', user_id).execute()

# Calculate subject XP that should have been added after each subject's last update
missing_xp = {}
for c in (completions.data or []):
    t = c.get('user_quest_tasks', {})
    diploma_subjects = t.get('diploma_subjects')
    xp_value = t.get('xp_value', 0)
    completed_at = c['completed_at']

    if not diploma_subjects or not xp_value:
        continue

    # Handle dict format: {'Math': 75, 'Science': 25}
    if isinstance(diploma_subjects, dict):
        for subject, percentage in diploma_subjects.items():
            if isinstance(percentage, (int, float)) and percentage > 0:
                subject_xp = int(xp_value * percentage / 100)
                if subject_xp > 0:
                    normalized = normalize_subject_key(subject)
                    if normalized and normalized in subject_data:
                        last_updated = subject_data[normalized]['updated_at']
                        if completed_at > last_updated:
                            missing_xp[normalized] = missing_xp.get(normalized, 0) + subject_xp

    # Handle array format: ['Electives'] - split XP evenly
    elif isinstance(diploma_subjects, list) and diploma_subjects:
        per_subject_xp = xp_value // len(diploma_subjects)
        for subject in diploma_subjects:
            if per_subject_xp > 0:
                normalized = normalize_subject_key(subject)
                if normalized and normalized in subject_data:
                    last_updated = subject_data[normalized]['updated_at']
                    if completed_at > last_updated:
                        missing_xp[normalized] = missing_xp.get(normalized, 0) + per_subject_xp

print(f"\n=== Missing subject XP (from completions after last update) ===")
total_missing = 0
for subject, xp in sorted(missing_xp.items()):
    current = subject_data[subject]['current_xp']
    print(f"  {subject}: +{xp} XP (current: {current}, new: {current + xp})")
    total_missing += xp

print(f"\nTotal missing: {total_missing} XP")

if not missing_xp:
    print("\nNo missing subject XP to add!")
    sys.exit(0)

if dry_run:
    print("\nDRY RUN - no changes made. Run with --live to apply.")
    sys.exit(0)

# Apply fixes
print("\nApplying fixes...")
for subject, xp_to_add in missing_xp.items():
    record_id = subject_data[subject]['id']
    current = subject_data[subject]['current_xp']
    new_total = current + xp_to_add

    client.table('user_subject_xp').update({
        'xp_amount': new_total,
        'updated_at': datetime.utcnow().isoformat()
    }).eq('id', record_id).execute()

    print(f"  {subject}: {current} -> {new_total} (+{xp_to_add})")

# Verify
print("\n=== Verification ===")
final_records = client.table('user_subject_xp').select('school_subject, xp_amount').eq('user_id', user_id).execute()
for r in sorted((final_records.data or []), key=lambda x: x['school_subject']):
    print(f"  {r['school_subject']}: {r['xp_amount']} XP")

print("\nDone!")
