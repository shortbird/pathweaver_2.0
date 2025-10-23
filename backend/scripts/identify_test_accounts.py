"""
Script to identify test accounts in the database for cleanup review.
This script only identifies accounts - it does NOT delete anything.
Review the output before proceeding with any cleanup.
"""

import os
import sys
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from database import get_supabase_admin_client

def identify_test_accounts():
    """Identify potential test accounts based on common patterns"""
    supabase = get_supabase_admin_client()

    print("=" * 80)
    logger.info("IDENTIFYING TEST ACCOUNTS - REVIEW ONLY")
    print("=" * 80)
    print()

    # Patterns that suggest test accounts
    test_patterns = [
        '%test%',
        '%demo%',
        '%example%',
        '%fake%',
        '%temp%',
        '%sample%',
        '%+test%',  # email+test@domain.com pattern
    ]

    all_potential_test_accounts = []

    for pattern in test_patterns:
        logger.info(f"Searching for email pattern: {pattern}")
        try:
            # Query using Supabase
            response = supabase.table('users').select(
                'id, email, display_name, role, created_at, subscription_tier, total_xp'
            ).ilike('email', pattern).execute()

            if response.data:
                logger.info(f"  Found {len(response.data)} accounts")
                all_potential_test_accounts.extend(response.data)
            else:
                logger.info(f"  No accounts found")
        except Exception as e:
            logger.error(f"  Error querying: {e}")
        print()

    # Remove duplicates based on id
    unique_accounts = {acc['id']: acc for acc in all_potential_test_accounts}
    test_accounts = list(unique_accounts.values())

    print("=" * 80)
    logger.info(f"FOUND {len(test_accounts)} POTENTIAL TEST ACCOUNTS")
    print("=" * 80)
    print()

    if test_accounts:
        logger.info("ID                                   | Email                          | Display Name        | Role    | Tier       | XP   | Created")
        print("-" * 150)
        for acc in sorted(test_accounts, key=lambda x: x.get('created_at', '')):
            print(f"{acc['id'][:36]:36} | {acc.get('email', 'N/A')[:30]:30} | {str(acc.get('display_name', 'N/A'))[:19]:19} | {acc.get('role', 'N/A')[:7]:7} | {acc.get('subscription_tier', 'N/A')[:10]:10} | {acc.get('total_xp', 0):4} | {acc.get('created_at', 'N/A')[:10]}")

    print()
    print("=" * 80)
    logger.info("IMPORTANT: MANUAL REVIEW REQUIRED")
    print("=" * 80)
    logger.info("Review the accounts above carefully before deleting.")
    logger.info("Some accounts may be:")
    print("  - Real users with 'test' in their email (e.g., testuser@company.com)")
    logger.info("  - Development accounts that should be kept")
    logger.info("  - Admin accounts used for testing")
    print()
    logger.info(f"Total accounts identified: {len(test_accounts)}")
    print()

    # Additional safety check: look for accounts with significant activity
    logger.info("ACCOUNTS WITH SIGNIFICANT ACTIVITY (>100 XP):")
    print("-" * 80)
    active_accounts = [acc for acc in test_accounts if acc.get('total_xp', 0) > 100]
    if active_accounts:
        for acc in active_accounts:
            print(f"  {acc.get('email', 'N/A')}: {acc.get('total_xp', 0)} XP - REVIEW CAREFULLY")
    else:
        logger.info("  None found")
    print()

    return test_accounts

if __name__ == "__main__":
    try:
        accounts = identify_test_accounts()
        logger.info("Script completed successfully.")
        print()
        logger.info("Next steps:")
        logger.info("1. Review the list above")
        logger.info("2. Determine which accounts are actually test accounts")
        logger.info("3. Create a cleanup script with specific IDs to delete")
        logger.info("4. Test on a backup or development database first")
    except Exception as e:
        logger.error(f"ERROR: {e}")
        import traceback
        traceback.print_exc()