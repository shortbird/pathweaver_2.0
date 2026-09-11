"""Publishing an announcement to a school's families.

One path, two callers. The web platform's announcements composer has always
posted here; the SIS Community Hub now can too, because posting there and
watching nothing reach families is exactly what happened to iCreate on
2026-08-01 ("I just posted an announcement from the admin side and it doesn't
show up in the announcements on the non-admin side of things").

The Community Hub is the board: families and students read it in the app, but
only if they go and look. This is the other thing — a message that goes OUT,
with a durable row families can read, an in-app notification, and an email to
people who never open the app. Posting and sending are separate acts on purpose;
the composer offers both.

Extracted from routes/announcements.py; the route is now a thin caller.
"""

import threading
from typing import Any, Dict, Iterable, List, Optional, Set

from flask import current_app

from utils import rich_text
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from utils.roles import get_effective_roles

logger = get_logger(__name__)

# The audiences an announcement can be aimed at.
ROLE_AUDIENCES = {'students', 'parents', 'advisors'}

# Rows per insert when snapshotting recipients (well under PostgREST limits).
RECIPIENT_SNAPSHOT_CHUNK = 500


# admin client justified: publishing fans a message out to every recipient
#   in the school, which is by definition rows the author cannot see under RLS
from utils.admin_client import admin_client as _admin


def normalize_audiences(audiences: Any, fallback: Any = None) -> List[str]:
    """Clean a requested audience list, tolerating the old single `audience`
    field ('everyone' meaning all roles)."""
    if not audiences:
        single = fallback or 'everyone'
        audiences = list(ROLE_AUDIENCES) if single == 'everyone' else [single]
    if isinstance(audiences, str):
        audiences = [audiences]
    return [a for a in audiences if a in ROLE_AUDIENCES]


def recipients_for(org_id: str, audiences: Iterable[str],
                   exclude_user_id: Optional[str] = None,
                   student_ids: Optional[Set[str]] = None,
                   advisor_ids: Optional[Set[str]] = None) -> Set[str]:
    """Every user id that should receive an announcement for these audiences.

    Parents are resolved per student, so a platform parent (no organization_id
    of their own) still gets their child's school announcements.
    """
    by_role = recipients_by_role(org_id, audiences, exclude_user_id,
                                 student_ids, advisor_ids)
    return set().union(*by_role.values()) if by_role else set()


def recipients_by_role(org_id: str, audiences: Iterable[str],
                       exclude_user_id: Optional[str] = None,
                       student_ids: Optional[Set[str]] = None,
                       advisor_ids: Optional[Set[str]] = None
                       ) -> Dict[str, Set[str]]:
    """The same resolution as recipients_for, split by the audience each person
    is reached through.

    Exists so the composer can show who a send is about to reach BEFORE it goes
    out. The picker offers two overlapping ways to narrow a send and gave no
    feedback about the result, so it was possible to believe a message had gone
    to families when it had gone to students (iCreate, 2026-08-26: "I love that
    we can narrow it down, but it's still confusing"). A preview is only worth
    trusting if it cannot disagree with the send, so the send is built on this.
    """
    # Paged: this is every account in the school and it grows with every family
    # that joins, and a truncated read here silently drops recipients.
    members = fetch_all_rows(lambda: (
        _admin().table('users').select('id, role, org_role, org_roles')
        .eq('organization_id', org_id)
    ))

    def _roles_of(m):
        # EVERY role the person holds, not just the primary. get_effective_role
        # collapses ['campus_coordinator', 'advisor'] to whichever the array
        # leads with, so anyone whose advisor role was not primary silently
        # dropped out of teacher sends and the preview count (iCreate,
        # 2026-08-28: "I selected 6 teachers ... it says 'goes to 5 people'").
        return set(get_effective_roles(m))

    students = [m for m in members if 'student' in _roles_of(m)]
    advisors = [m for m in members if 'advisor' in _roles_of(m)]
    # A targeted send narrows to these students; their parents follow from them,
    # so "the parents of the Tuesday choir" needs no separate parent query.
    if student_ids is not None:
        students = [m for m in students if m['id'] in student_ids]
    # ...and to these teachers. Before this, picking two teachers and audience
    # "Teachers" notified EVERY advisor in the org — the filter only ever
    # narrowed students (iCreate, 2026-08-22: "sent a message to just the
    # teachers ... it came through to the parents too" — three of the org's
    # advisors are also parents, and all thirty advisors were messaged).
    # Somebody the sender picked BY NAME is included even when they hold no
    # advisor role at all: the staff picker offers coordinators and admins, and
    # an explicit selection is not a role query (Katrine, 2026-08-28).
    if advisor_ids is not None:
        by_id = {m['id']: m for m in members}
        advisors = [by_id[i] for i in advisor_ids if i in by_id]

    by_role: Dict[str, Set[str]] = {}
    if 'students' in audiences:
        by_role['students'] = {m['id'] for m in students}
    if 'advisors' in audiences:
        by_role['advisors'] = {m['id'] for m in advisors}
    if 'parents' in audiences:
        from services.notification_service import NotificationService
        notifier = NotificationService()
        parents: Set[str] = set()
        for s in students:
            try:
                for p in (notifier.get_parents_for_student(s['id']) or []):
                    if p.get('id'):
                        parents.add(p['id'])
            except Exception as e:  # noqa: BLE001
                logger.warning(f"Could not resolve parents for student {s['id']}: {e}")
        # The SIS's third parent link: household guardians. A second guardian in
        # the household of a dependent child has no parent_student_links row and
        # managed_by_parent_id already names guardian #1, so resolving parents
        # per student alone skipped them (iCreate, 2026-08-26: "Marika didn't
        # get it (seems like she should have as a parent?)").
        parents |= _household_guardians_of([s['id'] for s in students])
        by_role['parents'] = parents
    for role, ids in by_role.items():
        # The author does not notify themselves — unless they were picked by
        # name, which is an explicit request to be included.
        if role == 'advisors' and advisor_ids is not None and exclude_user_id in advisor_ids:
            continue
        ids.discard(exclude_user_id)
    return by_role


def _household_guardians_of(student_ids: List[str]) -> Set[str]:
    """Guardians who share a household with any of these students."""
    if not student_ids:
        return set()
    try:
        member_rows = fetch_all_rows(lambda: (
            _admin().table('household_members').select('household_id, user_id')
            .in_('user_id', student_ids)
        ))
        household_ids = list({r['household_id'] for r in member_rows})
        if not household_ids:
            return set()
        guardian_rows = fetch_all_rows(lambda: (
            _admin().table('household_members').select('user_id, relationship')
            .in_('household_id', household_ids).eq('relationship', 'guardian')
        ))
        return {r['user_id'] for r in guardian_rows if r.get('user_id')}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Could not resolve household guardians: {e}")
        return set()


def publish(org_id: str, author_id: str, title: str, content: str,
            audiences: List[str], student_ids: Optional[Set[str]] = None,
            send_email: bool = True, send_app: bool = True,
            target_label: Optional[str] = None,
            advisor_ids: Optional[Set[str]] = None,
            source_announcement_id: Optional[str] = None,
            attachments: Optional[List[dict]] = None) -> Dict[str, Any]:
    """Store the announcement and fan it out (notifications + optional email).

    `send_email` defaults to True so every existing caller keeps behaving
    exactly as it did. The SIS composer passes False for a targeted send:
    iCreate found that an in-app note to one class was also 300 emails, and
    asked for the email to be the deliberate half ("maybe we keep announcements
    within the community dashboard only and have the ability to check the box
    only if we want it emailed too" — 857b5f70).

    `send_app` (default True, same reasoning) is the other half of the channel
    choice (iCreate, 2026-08-31: email OR app message OR both): False skips the
    notification/push fan-out and marks the row in_app=false, which keeps it
    off the family-facing announcements surfaces — it exists as staff history
    and as email. The route refuses a send with both flags off.

    `student_ids` narrows delivery to a set of students and their parents; see
    targeted_student_ids.

    The durable row is what the family-facing Announcements page reads, so it is
    written first and its failure is logged rather than raised — delivery still
    happens either way.

    A body written with the editor is stored as sanitized HTML; everything that
    reads it as text (the notification preview, the plain half of the email)
    flattens it first. See utils/rich_text.py.

    `source_announcement_id` links the row back to the Community Hub board post
    that spawned it, so revise()/retract_for_source() can keep the two halves
    in step.

    `attachments` (iCreate, 2026-08-31) is the same pre-uploaded
    {url, type, name, size} list a message send carries; it is cleaned with the
    same helper, stored on the row (readers sign the private URLs per read),
    and linked at the bottom of the email.
    """
    from services import messaging_extras_service as msg_extras
    attachments = msg_extras.clean_attachments(attachments)
    content = rich_text.sanitize(content)
    announcement_id = None
    try:
        ins = _admin().table('announcements').insert({
            'organization_id': org_id,
            'author_id': author_id,
            'title': title,
            'message': content,
            # The board post this send came from, when there is one. Without it
            # the family feed had to guess the two rows were the same notice by
            # matching title + day, and an edit to the title made them two.
            'source_announcement_id': source_announcement_id,
            # A targeted send records WHO it went to, not just which roles, so
            # the archive does not read as school-wide six months later.
            'target_audience': (target_label if target_label
                                else 'everyone' if set(audiences) == ROLE_AUDIENCES
                                else ','.join(sorted(audiences))),
            # Targeted rows are visible in the archive only to their snapshot
            # recipients — the role token in the label must not widen them to
            # the whole role (see announcements_archive).
            'is_targeted': bool(target_label),
            # Email-only sends stay off the family-facing surfaces (the
            # announcements list and archive both filter on this).
            'in_app': send_app,
            'attachments': attachments or None,
        }).execute()
        announcement_id = ins.data[0]['id'] if ins.data else None
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Announcement row insert failed (continuing): {e}")

    recipient_ids = recipients_for(org_id, audiences, exclude_user_id=author_id,
                                   student_ids=student_ids,
                                   advisor_ids=advisor_ids)
    _snapshot_recipients(announcement_id, recipient_ids)

    from services.notification_service import NotificationService
    notifier = NotificationService()
    preview = rich_text.preview(content)
    sent = 0
    for rid in (recipient_ids if send_app else []):
        try:
            notifier.create_notification(
                user_id=rid,
                notification_type='announcement',
                title=title,
                message=preview,
                # The school page holds the sent-message archive this refers
                # to. Web routes /school directly; the mobile app's deep-link
                # router remaps it to the School stack — so a push tap lands on
                # the message itself, not the bell list.
                link='/school',
                # full_content is what the notification expands to, on web and
                # mobile alike — both render it as text (react-markdown escapes
                # raw HTML; React Native has no notion of it), so it is the
                # flattened body. The formatted version lives on the
                # announcements page the notification links to.
                metadata={'announcement_id': announcement_id, 'audiences': audiences,
                          'full_content': rich_text.to_text(content)},
                organization_id=org_id,
            )
            sent += 1
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Announcement notify failed for {rid}: {e}")

    if send_email:
        _email_fanout(org_id, title, content, list(recipient_ids),
                      attachments=attachments)
    logger.info(f"Announcement '{title[:40]}' by {author_id[:8]} sent to {sent} "
                f"({','.join(audiences)}; app={'yes' if send_app else 'no'}; "
                f"email={'yes' if send_email else 'no'})")
    return {'sent': sent, 'announcement_id': announcement_id,
            'recipients': len(recipient_ids), 'emailed': bool(send_email)}


def retract(announcement_id: str) -> None:
    """Take a sent announcement down: delete the durable row and the bell
    notifications that point at it.

    Deleting the row alone is not enough — the notification survives it and the
    message reappears when the bell is opened. Best-effort on the sweep: the
    announcement is gone either way.
    """
    _admin().table('announcements').delete().eq('id', announcement_id).execute()
    try:
        # The column is `type`, not `notification_type` -- the latter is the
        # KEYWORD ARGUMENT NotificationService.create_notification takes, which
        # it writes into 'type' (notification_service.py:90). Filtering on the
        # argument name asks PostgREST for a column that does not exist, the
        # request 400s, the except below swallows it, and the sweep this
        # function exists to perform silently never happens -- the exact failure
        # the docstring above describes. Same fix in revise_for_source.
        _admin().table('notifications').delete()\
            .eq('type', 'announcement')\
            .filter('metadata->>announcement_id', 'eq', announcement_id).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Announcement {announcement_id} deleted but notifications "
                       f"not swept: {e}")


def retract_for_source(source_announcement_id: str) -> int:
    """Retract every send that came from this Community Hub board post.

    Deleting the board post used to leave the fan-out row alive, so a notice the
    admin had taken down stayed on the family archive and the parent dashboard
    for good (iCreate, 2026-08-28: "Summit Program Info" was gone from the admin
    side and still on the parent page). Returns how many sends were pulled.
    """
    try:
        rows = (_admin().table('announcements').select('id')
                .eq('source_announcement_id', source_announcement_id)
                .execute()).data or []
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Could not find sends for board post "
                       f"{source_announcement_id}: {e}")
        return 0
    for row in rows:
        try:
            retract(row['id'])
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Could not retract announcement {row['id']}: {e}")
    return len(rows)


def revise_for_source(source_announcement_id: str, title: Optional[str] = None,
                      content: Optional[str] = None) -> int:
    """Carry an edit of a board post through to the send it spawned.

    The two rows are one notice to a family. Left unsynced, editing the board
    post's title made the family feed stop recognising them as the same thing
    and show both (iCreate, 2026-08-27: "The announcements show two
    announcements on a family portal even though I only edited the original").
    Returns how many sends were updated.
    """
    fields: Dict[str, Any] = {}
    if title is not None:
        fields['title'] = title
    if content is not None:
        fields['message'] = rich_text.sanitize(content)
    if not fields:
        return 0
    try:
        rows = (_admin().table('announcements').update(fields)
                .eq('source_announcement_id', source_announcement_id)
                .execute()).data or []
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Could not revise sends for board post "
                       f"{source_announcement_id}: {e}")
        return 0
    # The bell notification carries its own copy of the words, so an edit that
    # stops at the announcements row leaves the old text in everyone's list.
    for row in rows:
        try:
            patch: Dict[str, Any] = {}
            if title is not None:
                patch['title'] = title
            if content is not None:
                patch['message'] = rich_text.preview(fields['message'])
            if patch:
                (_admin().table('notifications').update(patch)
                 .eq('type', 'announcement')  # see the note in retract()
                 .filter('metadata->>announcement_id', 'eq', row['id']).execute())
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Revised announcement {row['id']} but its "
                           f"notifications were not updated: {e}")
    return len(rows)


def _snapshot_recipients(announcement_id: Optional[str],
                         recipient_ids: Set[str]) -> None:
    """Record who this send was aimed at, so read stats and nudges have a
    denominator. Recipient resolution is dynamic (parents come via their
    children), so without a snapshot "who was sent this" cannot be answered
    later. Chunked inserts; best-effort — a snapshot failure must never stop
    delivery, it only turns this message's read stats into "no data"."""
    if not announcement_id or not recipient_ids:
        return
    ids = sorted(recipient_ids)
    try:
        for i in range(0, len(ids), RECIPIENT_SNAPSHOT_CHUNK):
            _admin().table('announcement_recipients').insert([
                {'announcement_id': announcement_id, 'user_id': uid}
                for uid in ids[i:i + RECIPIENT_SNAPSHOT_CHUNK]
            ]).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Recipient snapshot failed for announcement "
                       f"{announcement_id}: {e}")


def _email_fanout(org_id: str, title: str, content: str, recipients: List[str],
                  attachments: Optional[List[dict]] = None) -> None:
    """Email the announcement in a daemon thread — parents who never open the
    app still get it, and a slow SMTP hop never holds up the request.

    Attachments arrive as a linked list at the bottom of the body, signed for a
    week: the bucket is private, and an email is often read days later. The app
    surfaces never see these signed twins — they re-sign per read."""
    if not recipients:
        return
    try:
        app = current_app._get_current_object()
    except RuntimeError:  # outside an app context (scripts, tests)
        logger.debug('announcement email fan-out skipped: no app context')
        return

    def _run():
        with app.app_context():
            try:
                from services.announcement_email_service import send_announcement_emails
                body = content
                if attachments:
                    import html as _html
                    from services.messaging_extras_service import ATTACHMENT_BUCKET
                    from utils.storage_urls import sign_stored_urls
                    mapping = sign_stored_urls(
                        [a['url'] for a in attachments],
                        ATTACHMENT_BUCKET, expires_in=7 * 24 * 3600)
                    items = ''.join(
                        f'<li><a href="{mapping.get(a["url"]) or a["url"]}">'
                        f'{_html.escape(a.get("name") or "attachment")}</a></li>'
                        for a in attachments)
                    body = f'{content}<p><strong>Attachments</strong></p><ul>{items}</ul>'
                send_announcement_emails(org_id, title, body, recipients)
            except Exception as e:  # noqa: BLE001
                logger.error(f"Announcement email fan-out failed: {e}", exc_info=True)

    threading.Thread(target=_run, daemon=True).start()
