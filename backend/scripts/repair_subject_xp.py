#!/usr/bin/env python3
"""Repair missing diploma credits (user_subject_xp) from completed tasks."""
import os
import sys
from datetime import datetime
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client
from utils.school_subjects import normalize_subject_key, SCHOOL_SUBJECTS

dry_run = '--live' not in sys.argv
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

tanner = client.table('users').select('id').eq('email', 'tannerbowman@gmail.com').execute()
user_id = tanner.data[0]['id']

print("=" * 60)
print("Repair Missing Diploma Credits (user_subject_xp)")
print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
print("=" * 60)

# Get all completions with task diploma_subjects
completions = client.table('quest_task_completions').select(
    'id, completed_at, user_quest_tasks!inner(diploma_subjects, xp_value)'
).eq('user_id', user_id).execute()

# Calculate what subject XP should be (normalized to DB keys)
subject_xp_totals = {}
unmapped_subjects = {}

for c in (completions.data or []):
    t = c.get('user_quest_tasks', {})
    diploma_subjects = t.get('diploma_subjects')
    xp_awarded = t.get('xp_value', 0)

    if not diploma_subjects or not xp_awarded:
        continue

    # Handle dict format: {'Math': 75, 'Science': 25}
    if isinstance(diploma_subjects, dict):
        for subject, percentage in diploma_subjects.items():
            if isinstance(percentage, (int, float)) and percentage > 0:
                subject_xp = int(xp_awarded * percentage / 100)
                if subject_xp > 0:
                    # Normalize to DB key
                    normalized = normalize_subject_key(subject)
                    if normalized:
                        subject_xp_totals[normalized] = subject_xp_totals.get(normalized, 0) + subject_xp
                    else:
                        unmapped_subjects[subject] = unmapped_subjects.get(subject, 0) + subject_xp

    # Handle array format: ['Electives'] - split XP evenly
    elif isinstance(diploma_subjects, list) and diploma_subjects:
        per_subject_xp = xp_awarded // len(diploma_subjects)
        for subject in diploma_subjects:
            if per_subject_xp > 0:
                # Normalize to DB key
                normalized = normalize_subject_key(subject)
                if normalized:
                    subject_xp_totals[normalized] = subject_xp_totals.get(normalized, 0) + per_subject_xp
                else:
                    unmapped_subjects[subject] = unmapped_subjects.get(subject, 0) + per_subject_xp

print(f"\n=== Subject XP from all completions (normalized) ===")
for subject, xp in sorted(subject_xp_totals.items()):
    print(f"  {subject}: {xp} XP")

if unmapped_subjects:
    print(f"\n=== Unmapped subjects (need to add to normalize_subject_key) ===")
    for subject, xp in sorted(unmapped_subjects.items()):
        print(f"  {subject}: {xp} XP")

# Get current user_subject_xp records
current_records = client.table('user_subject_xp').select('*').eq('user_id', user_id).execute()
current_by_subject = {r['school_subject']: r for r in (current_records.data or [])}

print(f"\n=== Current user_subject_xp records ===")
for subject in sorted(current_by_subject.keys()):
    record = current_by_subject[subject]
    print(f"  {subject}: {record['xp_amount']} XP (updated: {record.get('updated_at', 'N/A')[:16] if record.get('updated_at') else 'N/A'})")

# Calculate differences
print(f"\n=== Differences ===")
changes_needed = {}
for subject, expected_xp in subject_xp_totals.items():
    current = current_by_subject.get(subject, {}).get('xp_amount', 0)
    if expected_xp != current:
        changes_needed[subject] = {
            'expected': expected_xp,
            'current': current,
            'difference': expected_xp - current
        }
        print(f"  {subject}: current={current}, expected={expected_xp}, diff={expected_xp - current}")

if not changes_needed:
    print("\n  No differences found! Subject XP is accurate.")
    sys.exit(0)

total_missing = sum(c['difference'] for c in changes_needed.values() if c['difference'] > 0)
print(f"\nTotal missing subject XP: {total_missing}")

if dry_run:
    print("\nDRY RUN - no changes made. Run with --live to apply.")
    sys.exit(0)

# Apply fixes
print("\nApplying fixes...")
for subject, change in changes_needed.items():
    if change['difference'] <= 0:
        continue  # Don't reduce XP

    if subject in current_by_subject:
        # Update existing record
        record_id = current_by_subject[subject]['id']
        client.table('user_subject_xp').update({
            'xp_amount': change['expected'],
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', record_id).execute()
        print(f"  Updated {subject}: {change['current']} -> {change['expected']}")
    else:
        # Insert new record
        client.table('user_subject_xp').insert({
            'user_id': user_id,
            'school_subject': subject,
            'xp_amount': change['expected'],
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }).execute()
        print(f"  Created {subject}: {change['expected']} XP")

# Verify
print("\n=== Verification ===")
final_records = client.table('user_subject_xp').select('school_subject, xp_amount').eq('user_id', user_id).execute()
for r in sorted((final_records.data or []), key=lambda x: x['school_subject']):
    print(f"  {r['school_subject']}: {r['xp_amount']} XP")

print("\nDone!")
