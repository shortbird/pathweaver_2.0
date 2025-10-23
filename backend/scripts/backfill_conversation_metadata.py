"""
Backfill script to update missing conversation metadata.

This script updates tutor_conversations records that have NULL values for:
- message_count
- last_message_at

Run this once to fix existing conversations created before the metadata
update function was added.

Usage:
    python backend/scripts/backfill_conversation_metadata.py
"""

import os
import sys
from datetime import datetime

from utils.logger import get_logger

logger = get_logger(__name__)

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import get_supabase_admin_client


def backfill_conversation_metadata():
    """Update conversation metadata for all conversations with NULL last_message_at"""

    logger.info("Starting conversation metadata backfill...")
    supabase = get_supabase_admin_client()

    # Find all conversations with NULL last_message_at
    conversations = supabase.table('tutor_conversations').select(
        'id, user_id, created_at'
    ).is_('last_message_at', 'null').execute()

    total = len(conversations.data)
    logger.info(f"Found {total} conversations needing metadata updates")

    if total == 0:
        logger.info("No conversations need updating. Exiting.")
        return

    updated_count = 0
    error_count = 0

    for idx, conversation in enumerate(conversations.data, 1):
        conversation_id = conversation['id']

        try:
            # Get message count and most recent message
            messages = supabase.table('tutor_messages').select(
                'id, created_at', count='exact'
            ).eq('conversation_id', conversation_id).order(
                'created_at', desc=True
            ).limit(1).execute()

            message_count = messages.count if messages.count else 0

            # Determine last_message_at
            if messages.data and len(messages.data) > 0:
                last_message_at = messages.data[0]['created_at']
            else:
                # No messages, use conversation created_at
                last_message_at = conversation['created_at']

            # Update conversation
            supabase.table('tutor_conversations').update({
                'message_count': message_count,
                'last_message_at': last_message_at,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', conversation_id).execute()

            updated_count += 1
            logger.info(f"[{idx}/{total}] Updated conversation {conversation_id}: {message_count} messages")

        except Exception as e:
            error_count += 1
            logger.error(f"[{idx}/{total}] ERROR updating conversation {conversation_id}: {e}")

    logger.info(f"
Backfill complete!")
    logger.info(f"Successfully updated: {updated_count}")
    logger.error(f"Errors: {error_count}")
    logger.info(f"Total processed: {total}")


if __name__ == '__main__':
    try:
        backfill_conversation_metadata()
    except Exception as e:
        logger.error(f"FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
