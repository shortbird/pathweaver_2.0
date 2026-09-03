"""Erasure primitives: every row, file and auth record that IS a user.

Data-access layer for account deletion. The scheduling/retry policy on top of
this lives in services/account_deletion_service.py; this module only knows
*what* deleting a person means. It sits in `repositories/` so the dependent
repository can reuse it without a repositories -> services import.

What a full erasure covers
--------------------------
1. **Storage objects** — avatars, evidence media, message attachments, bug-report
   screenshots. These live under user-id-keyed prefixes across several buckets
   and were never touched by any deletion path.
2. **Rows the cascade misses.** `public.users.id` is `REFERENCES auth.users(id)
   ON DELETE CASCADE`, and most user-linked tables cascade off `public.users`, so
   deleting the *auth* user takes the bulk of it. But a dozen tables carry a
   `user_id` with **no foreign key at all** (`quest_task_completions`,
   `learning_events`, `tutor_conversations`, `password_reset_tokens`,
   `user_task_evidence_documents`, ...) — nothing cascades to them and they
   silently outlive the account. Those are deleted explicitly, first.
3. **Blocking references.** A handful of columns are `ON DELETE NO ACTION`, so a
   leftover row *blocks* the delete instead of following it. The nullable ones
   (authorship: `quests.created_by`, `quest_task_completions.reviewed_by`, ...)
   are nulled out, which anonymizes the record without destroying content other
   people depend on. The NOT NULL ones on shared/staff content are deliberately
   NOT force-deleted: the delete fails loudly and a human decides, rather than
   this job quietly deleting a school's curriculum. They are enumerated in
   `BLOCKING_REFS` so that failure can say WHICH one blocked -- the auth API
   reports all of them as the same unattributable "Database error deleting
   user".
4. **The auth user** — deleted last, which cascades `public.users` and everything
   hanging off it.

Failure policy
--------------
Errors are collected and raised as `AccountDeletionError`; nothing is swallowed.
The erasure also stops at the first phase boundary that reports an error, before
touching the account row the retry has to find it by — so a failed run leaves an
intact, retryable account rather than a half-deleted one.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Tuple

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


class AccountDeletionError(Exception):
    """One or more steps of an erasure failed; the account is NOT deleted."""

    def __init__(self, user_id: str, errors: List[str]):
        self.user_id = user_id
        self.errors = errors
        super().__init__(f"Account deletion for {user_id} failed: " + '; '.join(errors[:5]))


# ---------------------------------------------------------------------------
# What belongs to a user
# ---------------------------------------------------------------------------

# Rows that ARE the user's data and must be deleted explicitly, in this order.
# Every entry is verified against the live schema (2026-08-15). Tables marked
# "no FK" have no foreign key to users at all, so nothing cascades to them —
# these are the ones a naive "delete the users row" leaves behind forever.
OWNED_ROWS: Tuple[Tuple[str, str], ...] = (
    # --- AI tutor (no FK on tutor_*.user_id; messages cascade off conversations)
    ('tutor_safety_reports', 'user_id'),        # no FK
    ('tutor_conversations', 'user_id'),         # no FK; cascades tutor_messages
    ('tutor_settings', 'user_id'),              # no FK

    # --- Evidence / portfolio (no FK; blocks cascade off the document)
    ('user_task_evidence_documents', 'user_id'),  # no FK; cascades evidence_document_blocks
    ('learning_events', 'user_id'),               # no FK; cascades event blocks/topics/views
    ('lesson_reflections', 'user_id'),            # no FK
    ('quest_task_completions', 'user_id'),        # no FK
    ('user_skill_details', 'user_id'),            # no FK
    ('diplomas', 'user_id'),                      # no FK

    # --- Credentials / tokens (no FK; a live reset token outliving the account
    #     is a security problem, not just a privacy one)
    ('password_reset_tokens', 'user_id'),         # no FK

    # --- NOT NULL + ON DELETE NO ACTION on the user's OWN rows: these block the
    #     users delete unless removed first.
    ('course_generation_jobs', 'user_id'),
    ('parental_consent_log', 'user_id'),
    ('feed_share_tokens', 'student_id'),

    # --- Cascading tables listed anyway: deleting them here is what makes a
    #     partial (auth-delete-failed) run leave less behind, and it gives the
    #     audit log real per-table counts.
    ('user_quest_tasks', 'user_id'),
    ('user_quests', 'user_id'),
    ('user_skill_xp', 'user_id'),
    ('user_subject_xp', 'user_id'),
    ('direct_messages', 'sender_id'),
    ('direct_messages', 'recipient_id'),
    ('student_access_logs', 'student_id'),
    ('observer_access_audit', 'student_id'),
    ('observer_access_audit', 'observer_id'),
    ('observer_student_links', 'student_id'),
    ('observer_student_links', 'observer_id'),
    ('observer_comments', 'student_id'),
    ('observer_comments', 'observer_id'),
    ('advisor_notes', 'subject_id'),
    ('peer_comments', 'student_id'),
    ('peer_comments', 'author_id'),
    ('peer_connections', 'requester_id'),
    ('peer_connections', 'addressee_id'),
    ('device_tokens', 'user_id'),
    ('push_subscriptions', 'user_id'),
    ('notification_preferences', 'user_id'),
    ('notifications', 'user_id'),
    ('user_activity_events', 'user_id'),
    ('user_blocks', 'blocker_id'),
    ('user_blocks', 'blocked_id'),
)

# Nullable references from OTHER people's records to this user, on FKs that do
# NOT cascade (ON DELETE NO ACTION). Left as-is they block the delete; nulling
# them anonymizes the authorship trail while preserving the record itself.
# Verified against the live schema (2026-08-15).
ANONYMIZE_REFS: Tuple[Tuple[str, str], ...] = (
    ('advisor_student_assignments', 'assigned_by'),
    # These three reference auth.users DIRECTLY rather than public.users, on
    # ON DELETE NO ACTION, and were in neither list -- so a staff member who had
    # reviewed an AI quest, run a generation job or written a docs article would
    # have blocked at the auth delete with GoTrue's unattributable "Database
    # error deleting user", and _blocking_refs could not have named the holder
    # either. All three are nullable, so the authorship trail anonymizes rather
    # than blocking. (Audited against the live schema 2026-09-01: these were the
    # only non-cascading FKs to auth.users besides lesson_reflections, which is
    # already deleted in OWNED_ROWS.)
    ('ai_generated_quests', 'reviewer_id'),
    ('ai_generation_jobs', 'created_by'),
    ('docs_articles', 'created_by'),
    ('ai_prompt_components', 'modified_by'),
    # Self-service family registration stamps the PARENT here
    # (sis_parent_service.register_for_class), so this is the one actor column a
    # departing family populates themselves. NOT NULL until the 20260825
    # migration, which is why it blocked every such parent's erasure.
    ('class_enrollments', 'enrolled_by'),
    ('curriculum_attachments', 'deleted_by'),
    ('curriculum_lessons', 'last_edited_by'),
    ('curriculum_uploads', 'reviewed_by'),
    ('diploma_review_rounds', 'reviewer_id'),
    ('diplomas', 'public_consent_given_by'),
    ('group_members', 'added_by'),
    ('org_invitations', 'accepted_by'),
    ('organization_course_access', 'granted_by'),
    ('organization_quest_access', 'granted_by'),
    ('parental_consent_log', 'reviewed_by_admin_id'),
    ('planned_credits', 'created_by'),
    ('prior_learning_records', 'credited_by'),
    ('prior_learning_records', 'reviewed_by'),
    ('quest_task_completions', 'credit_reviewer_id'),
    ('quest_task_completions', 'reviewed_by'),
    ('quests', 'created_by'),
    ('quests', 'curriculum_last_edited_by'),
    ('role_change_log', 'changed_by'),
    ('sis_form_submissions', 'assigned_to'),
    ('sis_form_submissions', 'resolved_by'),
    ('sis_form_submissions', 'student_user_id'),
    ('sis_onboarding_assignments', 'assigned_by'),
    ('sis_onboarding_templates', 'created_by'),
    ('sis_staff_assignments', 'created_by'),
    ('sis_time_entries', 'approved_by'),
    ('sis_time_entries', 'edited_by'),
    # The FERPA disclosure trail on OTHER students' records. The row belongs to
    # the student who was looked at (`student_id`, deleted above), so only "who
    # looked" goes blank. The FK is ON DELETE SET NULL and would do this by
    # itself -- it is here because the column was NOT NULL until 20260827100000,
    # which made SET NULL throw 23502 and blocked the erasure of every parent,
    # advisor, observer and admin on the platform (Sentry OPTIO-BACKEND-75/76).
    # Nulling it explicitly means that failure surfaces as a named line in
    # `errors` instead of GoTrue's opaque "Database error deleting user".
    ('student_access_logs', 'accessor_id'),
    ('transcript_overrides', 'updated_by'),
    ('transcript_share_tokens', 'revoked_by'),
    ('transfer_credits', 'created_by'),
    ('users', 'ai_features_enabled_by'),
    ('users', 'parental_consent_verified_by'),
)

# NOT NULL references from OTHER people's records to this user, on FKs that do
# not cascade. Nothing can be done to these automatically: the column cannot be
# nulled and the row is a school's content, not the departing person's, so
# force-deleting it would quietly destroy a curriculum or a credit review over
# one account closure. They block the erasure on purpose.
#
# They are listed here only so the block can NAME ITSELF. GoTrue reports every
# one of them as the same opaque "Database error deleting user", which in
# Sentry OPTIO-BACKEND-75/76 cost a full schema investigation to attribute to a
# single column. Checked before the auth delete, they become one readable line.
#
# Verified against the live schema (2026-08-25).
BLOCKING_REFS: Tuple[Tuple[str, str], ...] = (
    ('class_advisors', 'assigned_by'),
    ('class_quests', 'added_by'),
    ('courses', 'created_by'),
    ('credit_review_messages', 'author_id'),
    ('curriculum_attachments', 'uploaded_by'),
    ('curriculum_lessons', 'created_by'),
    ('curriculum_uploads', 'uploaded_by'),
    ('org_classes', 'created_by'),
    ('prior_learning_evidence', 'uploaded_by'),
    ('prior_learning_records', 'submitted_by'),
    ('sis_secure_documents', 'uploaded_by'),
    ('student_weekly_xp_goals', 'set_by'),
    ('task_feedback', 'reviewer_id'),
    ('transcript_share_tokens', 'issued_by'),
)

# Storage prefixes that are keyed by user id. `{uid}` is substituted; every
# object under the resulting prefix (recursively) is removed.
#
# Deliberately NOT listed: `user-photos/staged/{registration_id}` (keyed by an
# iCreate registration, not a user) and the org/staff/curriculum buckets, whose
# objects belong to an organization rather than to the person.
USER_STORAGE_PREFIXES: Tuple[Tuple[str, str], ...] = (
    ('quest-evidence', '{uid}'),
    ('quest-evidence', 'evidence-tasks/{uid}'),
    ('quest-evidence', 'evidence-blocks/{uid}'),
    ('quest-evidence', 'learning-events/{uid}'),
    ('quest-evidence', 'task-evidence/{uid}'),
    ('quest-evidence', 'prior-learning/{uid}'),
    ('quest-evidence', 'transcripts/{uid}'),
    ('quest-evidence', 'parent-evidence/{uid}'),
    ('quest-evidence', 'parent_identity/{uid}'),
    ('user-uploads', '{uid}'),
    ('user-uploads', 'avatars/{uid}'),
    ('user-uploads', 'messages/{uid}'),
    ('user-photos', '{uid}'),
    ('bug-reports', '{uid}'),
    ('quest-images', '{uid}'),
    ('staff-photos', '{uid}'),
)

# Learning-moment media is keyed by the EVENT id, not the user, so the event ids
# have to be collected before the rows are deleted.
MOMENT_STORAGE_BUCKET = 'user-uploads'
MOMENT_STORAGE_PREFIX = 'learning_moments/{event_id}'

# Columns read off users before deletion. Explicit rather than select('*'):
# the users row also carries phone, full postal address, DOB, allergies and
# medications, and none of that belongs in a deletion code path.
USER_SNAPSHOT_COLUMNS = 'id, email, first_name, last_name, role, organization_id, created_at'

_STORAGE_PAGE = 100


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

def _list_prefix(client, bucket: str, prefix: str) -> List[str]:
    """Every object path under `prefix` (recursive). Empty list if none.

    Supabase's storage `list` is a single directory level and pages at 100, so
    this walks folders itself. Entries with no `id` are folders.
    """
    paths: List[str] = []
    offset = 0
    while True:
        entries = client.storage.from_(bucket).list(
            prefix, {'limit': _STORAGE_PAGE, 'offset': offset}
        ) or []
        for entry in entries:
            name = entry.get('name') if isinstance(entry, dict) else None
            if not name or name == '.emptyFolderPlaceholder':
                continue
            child = f'{prefix}/{name}' if prefix else name
            if isinstance(entry, dict) and entry.get('id') is None:
                paths.extend(_list_prefix(client, bucket, child))
            else:
                paths.append(child)
        if len(entries) < _STORAGE_PAGE:
            break
        offset += _STORAGE_PAGE
    return paths


def delete_storage_prefixes(client, prefixes: Iterable[Tuple[str, str]],
                            errors: List[str]) -> int:
    """Remove every object under each (bucket, prefix). Returns objects removed.

    Failures are appended to `errors` rather than raised, so one unreachable
    bucket doesn't abandon the rest of the erasure — the caller still fails the
    run at the end, so the account stays retryable.
    """
    removed = 0
    for bucket, prefix in prefixes:
        try:
            paths = _list_prefix(client, bucket, prefix)
        except Exception as e:  # noqa: BLE001 - one bucket's failure is reported, not fatal here
            errors.append(f'storage list {bucket}/{prefix}: {e}')
            continue
        if not paths:
            continue
        for i in range(0, len(paths), 100):
            batch = paths[i:i + 100]
            try:
                client.storage.from_(bucket).remove(batch)
                removed += len(batch)
            except Exception as e:  # noqa: BLE001
                errors.append(f'storage remove {bucket} ({len(batch)} objects): {e}')
    return removed


# ---------------------------------------------------------------------------
# The erasure itself
# ---------------------------------------------------------------------------

def _delete_rows(client, table: str, column: str, user_id: str,
                 counts: Dict[str, int], errors: List[str]) -> None:
    try:
        result = client.table(table).delete().eq(column, user_id).execute()
        n = len(result.data) if result.data else 0
        if n:
            counts[f'{table}.{column}'] = counts.get(f'{table}.{column}', 0) + n
    except Exception as e:  # noqa: BLE001 - collected, then raised by the caller
        errors.append(f'delete {table}.{column}: {e}')


def _null_refs(client, table: str, column: str, user_id: str,
               counts: Dict[str, int], errors: List[str]) -> None:
    try:
        result = client.table(table).update({column: None}).eq(column, user_id).execute()
        n = len(result.data) if result.data else 0
        if n:
            counts[f'anonymized:{table}.{column}'] = n
    except Exception as e:  # noqa: BLE001
        errors.append(f'anonymize {table}.{column}: {e}')


def _blocking_refs(client, user_id: str) -> List[str]:
    """Rows on NOT NULL non-cascading FKs that will stop the auth delete.

    Read-only. Returns one `table.column (n rows)` string per blocker, so the
    failure says what is holding the account instead of GoTrue's "Database error
    deleting user" -- which names nothing and is identical for all fourteen.

    A lookup that itself fails is skipped, not reported as a blocker: this exists
    to explain a failure, and must never invent one.
    """
    found: List[str] = []
    for table, column in BLOCKING_REFS:
        try:
            n = (client.table(table).select('id', count='exact')
                 .eq(column, user_id).limit(1).execute()).count or 0
        except Exception as e:  # noqa: BLE001 - diagnostics only
            logger.debug(f'[ACCOUNT_DELETE] blocker probe {table}.{column} failed: {e}')
            continue
        if n:
            found.append(f'{table}.{column} ({n} row{"s" if n != 1 else ""})')
    return found


def purge_user(user_id: str, admin=None, reason: str = '',
               deletion_type: str = 'scheduled') -> Dict[str, Any]:
    """Permanently erase a user: storage, rows, auth account.

    Idempotent: every step is a filtered delete or a nulling update, so a re-run
    after a partial failure finishes the job instead of double-deleting. Safe to
    call for a user whose rows are already gone.

    Raises:
        AccountDeletionError: if ANY step failed. The account is left in a
            deletable state so the next attempt can finish it; it is never
            reported as complete.
    """
    # admin client justified: GDPR Article 17 erasure spans every table holding the user's rows plus storage and auth.admin; RLS cannot be used because deleting the users row revokes the subject's own access mid-operation, and the caller (self-delete route, dependent repo, or cron sweep) has already authorized the deletion
    client = admin or get_supabase_admin_client()
    errors: List[str] = []
    counts: Dict[str, int] = {}

    snapshot = None
    try:
        rows = client.table('users').select(USER_SNAPSHOT_COLUMNS).eq('id', user_id).execute().data
        snapshot = rows[0] if rows else None
    except Exception as e:  # noqa: BLE001
        errors.append(f'read user: {e}')

    # 1. Storage. Collect learning-event ids first: their media is keyed by the
    #    event, so once the rows are gone the objects are unreachable orphans.
    prefixes = [(b, p.format(uid=user_id)) for b, p in USER_STORAGE_PREFIXES]
    try:
        events = client.table('learning_events').select('id').eq('user_id', user_id).execute().data or []
        for event in events:
            prefixes.append(
                (MOMENT_STORAGE_BUCKET, MOMENT_STORAGE_PREFIX.format(event_id=event['id']))
            )
    except Exception as e:  # noqa: BLE001
        errors.append(f'read learning_events for storage cleanup: {e}')

    counts['storage_objects'] = delete_storage_prefixes(client, prefixes, errors)

    # Stop here if storage failed: nothing else has been touched yet, so the
    # account is fully intact and a retry loses nothing. Pressing on would
    # delete the learning_events rows that are the ONLY way to find that
    # event-keyed media again — orphaning it in the bucket forever.
    if errors:
        logger.error(f"[ACCOUNT_DELETE] user={user_id} aborted before row deletion: {errors}")
        raise AccountDeletionError(user_id, errors)

    # 2. Rows that are the user's own data (and the ones that would block).
    for table, column in OWNED_ROWS:
        _delete_rows(client, table, column, user_id, counts, errors)

    # 3. Other people's records that merely point at this user.
    for table, column in ANONYMIZE_REFS:
        _null_refs(client, table, column, user_id, counts, errors)

    # Stop before the account itself if any of that failed. The users row is
    # what the sweep finds the account BY: deleting it while data survives
    # would strand the leftovers with nothing left to retry from.
    if errors:
        logger.error(f"[ACCOUNT_DELETE] user={user_id} aborted before account removal: {errors}")
        raise AccountDeletionError(user_id, errors)

    # 4. The auth user. public.users.id REFERENCES auth.users(id) ON DELETE
    #    CASCADE, so this removes the profile row and everything cascading off
    #    it. Accounts with no auth user (legacy/dependent rows) fall through to
    #    an explicit profile delete.
    auth_deleted = False
    try:
        client.auth.admin.delete_user(user_id)
        auth_deleted = True
    except Exception as e:  # noqa: BLE001
        # "not found" is success for our purposes: the auth account is gone.
        if 'not found' in str(e).lower() or 'does not exist' in str(e).lower():
            auth_deleted = True
        else:
            # GoTrue collapses every blocking foreign key into one opaque
            # "Database error deleting user". Name the actual holder, or the
            # operator has nothing to act on. (Sentry OPTIO-BACKEND-75/76.)
            blockers = _blocking_refs(client, user_id)
            detail = f'{e}'
            if blockers:
                detail += f" -- blocked by {', '.join(blockers)}; these are " \
                          f"school records that cannot be reassigned automatically"
            errors.append(f'delete auth user: {detail}')
    counts['auth_user_deleted'] = 1 if auth_deleted else 0

    # 5. Verify the profile row is actually gone; delete it directly if the auth
    #    cascade didn't cover it (accounts with no auth user). Never assume — a
    #    silently surviving users row is exactly the failure this module exists
    #    to prevent.
    #
    #    Skipped when the auth delete failed: the account must stay findable, as
    #    `deletion_status='pending'` lives on this very row.
    if auth_deleted:
        try:
            remaining = client.table('users').select('id').eq('id', user_id).execute().data
            if remaining:
                client.table('users').delete().eq('id', user_id).execute()
                still = client.table('users').select('id').eq('id', user_id).execute().data
                if still:
                    errors.append('users row still present after delete')
        except Exception as e:  # noqa: BLE001
            errors.append(f'delete users row: {e}')

    if errors:
        logger.error(f"[ACCOUNT_DELETE] user={user_id} FAILED: {errors}")
        raise AccountDeletionError(user_id, errors)

    # 6. Audit trail. Written only on success, and only after the account is
    #    gone, so the log never claims a deletion that didn't happen. The
    #    user_id FK was dropped (see the 20260815 migration) precisely so this
    #    row can outlive the user.
    try:
        client.table('account_deletion_log').insert({
            'user_id': user_id,
            'email': (snapshot or {}).get('email'),
            'first_name': (snapshot or {}).get('first_name'),
            'last_name': (snapshot or {}).get('last_name'),
            'deletion_requested_at': datetime.now(timezone.utc).isoformat(),
            'deletion_completed_at': datetime.now(timezone.utc).isoformat(),
            'reason': reason or f'{deletion_type} deletion',
            'user_data': {'deletion_type': deletion_type, 'counts': counts},
        }).execute()
    except Exception as e:  # noqa: BLE001 - the account IS deleted; don't undo it over the log
        logger.error(f"[ACCOUNT_DELETE] user={user_id} deleted but audit log insert failed: {e}")

    logger.info(f"[ACCOUNT_DELETE] user={user_id} erased: {counts}")
    return {'user_id': user_id, 'counts': counts}


