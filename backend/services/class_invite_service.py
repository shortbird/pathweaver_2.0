"""
Class invite enrollment (blocks P2).

The accept half of a class invite link: an org_invitations row carrying
metadata {invitation_type: 'class', class_id} enrolls the accepting user in
that class. The generate half lives in routes/classes/invites.py; the accept
endpoints in routes/admin/user_invitations.py call this after the org join.
"""

from utils.logger import get_logger

logger = get_logger(__name__)


def enroll_class_invite(supabase, user_id, inv):
    """Enroll an accepted class-invite user in the invitation's class.

    Best-effort by design: the org join must never fail because the class
    vanished between validate and accept. Returns the class name on success,
    None otherwise (not a class invite, missing/archived class, org mismatch).
    """
    metadata = inv.get('metadata') or {}
    if metadata.get('invitation_type') != 'class' or not metadata.get('class_id'):
        return None
    try:
        cls = supabase.table('org_classes') \
            .select('id, name, organization_id, status') \
            .eq('id', metadata['class_id']) \
            .maybe_single() \
            .execute()
        cls_row = cls.data if cls else None
        if not cls_row or cls_row.get('organization_id') != inv['organization_id'] \
                or cls_row.get('status') != 'active':
            logger.warning(f"Class invite {inv['id']}: class {metadata['class_id']} "
                           f"unavailable, org join proceeds without enrollment")
            return None
        supabase.table('class_enrollments').upsert({
            'class_id': cls_row['id'],
            'student_id': user_id,
            'enrolled_by': inv['invited_by'],
            'status': 'active',
        }, on_conflict='class_id,student_id').execute()
        logger.info(f"Class invite enrolled {user_id} in class {cls_row['id']}")
        return cls_row.get('name')
    except Exception as e:
        logger.error(f"Class invite enrollment failed for {user_id}: {e}")
        return None
