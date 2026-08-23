"""
One-time backfill: resync every class messaging group to the adults-only
membership model (teachers as admins + guardians of active students as members,
students removed). Run once after deploying the 2026-08-22 change to
services/class_group_sync_service.py; safe to re-run — the sync is idempotent.

Only classes that already HAVE a group are touched: groups are still created
lazily (first enrollment change, or a teacher opening the class Messages tab),
and creating hundreds of empty chats here would notify nobody usefully.

Usage:
    cd backend && python scripts/resync_class_chats_to_families.py [--dry-run]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import get_supabase_admin_client  # noqa: E402
from services.class_group_sync_service import sync_class_group  # noqa: E402


def main(dry_run: bool) -> None:
    admin = get_supabase_admin_client()
    groups = (admin.table('group_conversations')
              .select('id, source_class_id, name')
              .not_.is_('source_class_id', 'null')
              .eq('is_active', True).execute()).data or []
    print(f'{len(groups)} class-linked group chats found')
    for g in groups:
        class_id = g['source_class_id']
        if dry_run:
            members = (admin.table('group_members').select('id, role')
                       .eq('group_id', g['id']).execute()).data or []
            non_admin = sum(1 for m in members if m.get('role') != 'admin')
            print(f"  would resync {g.get('name')} ({class_id}): "
                  f"{len(members)} members, {non_admin} non-admin")
            continue
        result = sync_class_group(class_id)
        print(f"  synced {g.get('name')} ({class_id}) -> {result or 'FAILED'}")
    print('done')


if __name__ == '__main__':
    main(dry_run='--dry-run' in sys.argv)
