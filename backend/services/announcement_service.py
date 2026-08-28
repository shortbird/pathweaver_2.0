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

from database import get_supabase_admin_client
from utils import rich_text
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from utils.roles import get_effective_role

logger = get_logger(__name__)

# The audiences an announcement can be aimed at.
ROLE_AUDIENCES = {'students', 'parents', 'advisors'}

# Rows per insert when snapshotting recipients (well under PostgREST limits).
RECIPIENT_SNAPSHOT_CHUNK = 500

# A message can be nudged at most once per this window.
NUDGE_COOLDOWN_HOURS = 24


def _admin():
    return get_supabase_admin_client()


def normalize_audiences(audiences: Any, fallback: Any = None) -> List[str]:
    """Clean a requested audience list, tolerating the old single `audience`
    field ('everyone' meaning all roles)."""
    if not audiences:
        single = fallback or 'everyone'
        audiences = list(ROLE_AUDIENCES) if single == 'everyone' else [single]
    if isinstance(audiences, str):
        audiences = [audiences]
    return [a for a in audiences if a in ROLE_AUDIENCES]


def _age_from_dob(dob: Optional[str]) -> Optional[int]:
    from datetime import date
    if not dob:
        return None
    try:
        d = date.fromisoformat(str(dob)[:10])
    except (ValueError, TypeError):
        return None
    today = date.today()
    return today.year - d.year - ((today.month, today.day) < (d.month, d.day))


def _students_in_classes(class_ids: List[str]) -> Set[str]:
    """Student ids actively enrolled in any of these classes.

    Paged: a whole-school class selection is one row per enrollment, which is
    the read that silently truncates at the PostgREST cap — and a truncated
    recipient list is a family who never gets the message.
    """
    if not class_ids:
        return set()
    from utils.db_fetch import fetch_all_rows
    rows = fetch_all_rows(lambda: (
        _admin().table('class_enrollments').select('id, student_id')
        .in_('class_id', class_ids).eq('status', 'active')))
    return {r['student_id'] for r in rows if r.get('student_id')}


def targeted_student_ids(org_id: str, class_ids: Optional[List[str]] = None,
                         teacher_ids: Optional[List[str]] = None,
                         min_age: Optional[int] = None,
                         max_age: Optional[int] = None) -> Optional[Set[str]]:
    """The students a targeted send is aimed at, or None for "the whole school".

    Every filter given is an AND: "the 9-12 year olds in Ms Rogers' classes" is
    one group, not three. Returning None rather than an empty set for "no
    filters" keeps "everyone" distinguishable from "nobody matched", which is
    the difference between a school-wide notice and a silent no-op.
    """
    if not any([class_ids, teacher_ids, min_age is not None, max_age is not None]):
        return None

    ids: Optional[Set[str]] = None
    if teacher_ids:
        from utils.db_fetch import fetch_all_rows
        taught = fetch_all_rows(lambda: (
            _admin().table('org_classes').select('id, primary_instructor_id')
            .eq('organization_id', org_id).in_('primary_instructor_id', teacher_ids)))
        ids = _students_in_classes([c['id'] for c in taught])
    if class_ids:
        in_classes = _students_in_classes(class_ids)
        ids = in_classes if ids is None else (ids & in_classes)
    if min_age is not None or max_age is not None:
        rows = (_admin().table('users').select('id, date_of_birth')
                .eq('organization_id', org_id).execute()).data or []
        in_range = set()
        for r in rows:
            age = _age_from_dob(r.get('date_of_birth'))
            if age is None:
                continue
            if min_age is not None and age < min_age:
                continue
            if max_age is not None and age > max_age:
                continue
            in_range.add(r['id'])
        ids = in_range if ids is None else (ids & in_range)
    return ids or set()


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
    students = [m for m in members if get_effective_role(m) == 'student']
    advisors = [m for m in members if get_effective_role(m) == 'advisor']
    # A targeted send narrows to these students; their parents follow from them,
    # so "the parents of the Tuesday choir" needs no separate parent query.
    if student_ids is not None:
        students = [m for m in students if m['id'] in student_ids]
    # ...and to these teachers. Before this, picking two teachers and audience
    # "Teachers" notified EVERY advisor in the org — the filter only ever
    # narrowed students (iCreate, 2026-08-22: "sent a message to just the
    # teachers ... it came through to the parents too" — three of the org's
    # advisors are also parents, and all thirty advisors were messaged).
    if advisor_ids is not None:
        advisors = [m for m in advisors if m['id'] in advisor_ids]

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
        by_role['parents'] = parents
    for ids in by_role.values():
        ids.discard(exclude_user_id)
    return by_role


def targeted_advisor_ids(org_id: str, class_ids: Optional[List[str]] = None,
                         teacher_ids: Optional[List[str]] = None) -> Optional[Set[str]]:
    """The advisors a targeted send is aimed at, or None for "all advisors".

    Picking teachers means those teachers; picking classes means the teachers
    of those classes. Age filters don't narrow teachers — ages describe
    students. Mirrors targeted_student_ids' None-vs-empty contract."""
    if not (class_ids or teacher_ids):
        return None
    ids: Set[str] = set(teacher_ids or [])
    if class_ids:
        from utils import class_membership
        for cid in class_ids:
            ids |= class_membership.class_teacher_ids(cid)
    return ids


def target_label(audiences: List[str], class_ids: Optional[List[str]] = None,
                 teacher_ids: Optional[List[str]] = None,
                 min_age: Optional[int] = None,
                 max_age: Optional[int] = None) -> Optional[str]:
    """What `target_audience` records for a targeted send.

    None means "not targeted", and publish falls back to the role list. The
    archive is read months later by someone asking who was told; "parents" on a
    message that went to one class would be a lie of omission.
    """
    bits = []
    if class_ids:
        bits.append(f'{len(class_ids)} class{"es" if len(class_ids) != 1 else ""}')
    if teacher_ids:
        bits.append(f'{len(teacher_ids)} teacher{"s" if len(teacher_ids) != 1 else ""}')
    if min_age is not None or max_age is not None:
        if min_age is not None and max_age is not None:
            bits.append(f'ages {min_age}-{max_age}')
        elif min_age is not None:
            bits.append(f'ages {min_age}+')
        else:
            bits.append(f'ages up to {max_age}')
    if not bits:
        return None
    return f'{",".join(sorted(audiences))} ({"; ".join(bits)})'


def publish(org_id: str, author_id: str, title: str, content: str,
            audiences: List[str], student_ids: Optional[Set[str]] = None,
            send_email: bool = True, target_label: Optional[str] = None,
            advisor_ids: Optional[Set[str]] = None,
            source_announcement_id: Optional[str] = None) -> Dict[str, Any]:
    """Store the announcement and fan it out (notifications + optional email).

    `send_email` defaults to True so every existing caller keeps behaving
    exactly as it did. The SIS Messaging page passes False for a targeted send:
    iCreate found that an in-app note to one class was also 300 emails, and
    asked for the email to be the deliberate half ("maybe we keep announcements
    within the community dashboard only and have the ability to check the box
    only if we want it emailed too" — 857b5f70).

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
    """
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
    for rid in recipient_ids:
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
        _email_fanout(org_id, title, content, list(recipient_ids))
    logger.info(f"Announcement '{title[:40]}' by {author_id[:8]} sent to {sent} "
                f"({','.join(audiences)}; email={'yes' if send_email else 'no'})")
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
        _admin().table('notifications').delete()\
            .eq('notification_type', 'announcement')\
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
                 .eq('notification_type', 'announcement')
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


def nudge(announcement: Dict[str, Any]) -> Dict[str, Any]:
    """Re-notify everyone this announcement was sent to who hasn't read it.

    `announcement` is the announcements row (id, organization_id, title,
    message, last_nudged_at) — the route fetches it for its own auth checks and
    hands it over. Returns {'notified': n} on success, otherwise
    {'error': msg, 'status': http_code}:

    - 409 when nudged within the last NUDGE_COOLDOWN_HOURS — a reminder that
      can be spammed stops being a reminder;
    - 409 when no recipient snapshot exists (messages sent before read
      receipts): re-resolving recipients now could nudge people the original
      send never reached.

    In-app only, no email — the nudge is a tap on the shoulder, not a resend.
    """
    from datetime import datetime, timedelta, timezone
    from utils.db_fetch import fetch_all_rows

    announcement_id = announcement['id']
    org_id = announcement.get('organization_id')

    last = announcement.get('last_nudged_at')
    if last:
        try:
            last_dt = datetime.fromisoformat(str(last).replace('Z', '+00:00'))
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - last_dt < timedelta(hours=NUDGE_COOLDOWN_HOURS):
                return {'error': 'This message was already nudged in the last '
                                 '24 hours. Try again tomorrow.',
                        'status': 409}
        except ValueError:
            logger.warning(f"Unparseable last_nudged_at on {announcement_id}: {last!r}")

    # Paged: an org-wide send is one row per recipient, which is exactly the
    # read that truncates at the PostgREST cap. PK is (announcement_id,
    # user_id), so user_id is the unique paging key within one announcement.
    recipients = {r['user_id'] for r in fetch_all_rows(lambda: (
        _admin().table('announcement_recipients').select('user_id')
        .eq('announcement_id', announcement_id)), order_by='user_id')}
    if not recipients:
        return {'error': 'This message predates read receipts, so there is no '
                         'record of who it was sent to. Only newer messages '
                         'can be nudged.',
                'status': 409}

    readers = {r['user_id'] for r in fetch_all_rows(lambda: (
        _admin().table('announcement_reads').select('user_id')
        .eq('announcement_id', announcement_id)), order_by='user_id')}
    unread = recipients - readers

    org_name = None
    try:
        org = _admin().table('organizations').select('name')\
            .eq('id', org_id).single().execute().data
        org_name = (org or {}).get('name')
    except Exception:  # noqa: BLE001
        pass

    title = announcement.get('title') or ''
    nudge_title = (f'Reminder from {org_name}: {title}' if org_name
                   else f'Reminder: {title}')
    body = announcement.get('message') or ''

    from services.notification_service import NotificationService
    notifier = NotificationService()
    notified = 0
    for uid in unread:
        try:
            notifier.create_notification(
                user_id=uid,
                # Same type as the original send, so it renders on the bell and
                # gets mobile push without any frontend change.
                notification_type='announcement',
                title=nudge_title,
                message=rich_text.preview(body),
                # The message itself lives on the school page's archive — same
                # link the original notification carried.
                link='/school',
                metadata={'announcement_id': announcement_id, 'nudge': True,
                          'full_content': rich_text.to_text(body)},
                organization_id=org_id,
            )
            notified += 1
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Nudge notify failed for {uid}: {e}")

    try:
        _admin().table('announcements').update(
            {'last_nudged_at': datetime.now(timezone.utc).isoformat()}
        ).eq('id', announcement_id).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Could not stamp last_nudged_at on {announcement_id}: {e}")

    logger.info(f"Announcement {announcement_id} nudged: {notified} of "
                f"{len(recipients)} recipients still unread")
    return {'notified': notified}


def _email_fanout(org_id: str, title: str, content: str, recipients: List[str]) -> None:
    """Email the announcement in a daemon thread — parents who never open the
    app still get it, and a slow SMTP hop never holds up the request."""
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
                send_announcement_emails(org_id, title, content, recipients)
            except Exception as e:  # noqa: BLE001
                logger.error(f"Announcement email fan-out failed: {e}", exc_info=True)

    threading.Thread(target=_run, daemon=True).start()
