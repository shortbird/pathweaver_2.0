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
from utils.logger import get_logger
from utils.roles import get_effective_role

logger = get_logger(__name__)

# The audiences an announcement can be aimed at.
ROLE_AUDIENCES = {'students', 'parents', 'advisors'}


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
                   student_ids: Optional[Set[str]] = None) -> Set[str]:
    """Every user id that should receive an announcement for these audiences.

    Parents are resolved per student, so a platform parent (no organization_id
    of their own) still gets their child's school announcements.
    """
    members = (
        _admin().table('users').select('id, role, org_role, org_roles')
        .eq('organization_id', org_id).execute()
    ).data or []
    students = [m for m in members if get_effective_role(m) == 'student']
    advisors = [m for m in members if get_effective_role(m) == 'advisor']
    # A targeted send narrows to these students; their parents follow from them,
    # so "the parents of the Tuesday choir" needs no separate parent query.
    if student_ids is not None:
        students = [m for m in students if m['id'] in student_ids]

    recipient_ids: Set[str] = set()
    if 'students' in audiences:
        recipient_ids.update(m['id'] for m in students)
    if 'advisors' in audiences:
        recipient_ids.update(m['id'] for m in advisors)
    if 'parents' in audiences:
        from services.notification_service import NotificationService
        notifier = NotificationService()
        for s in students:
            try:
                for p in (notifier.get_parents_for_student(s['id']) or []):
                    if p.get('id'):
                        recipient_ids.add(p['id'])
            except Exception as e:  # noqa: BLE001
                logger.warning(f"Could not resolve parents for student {s['id']}: {e}")
    recipient_ids.discard(exclude_user_id)
    return recipient_ids


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
            send_email: bool = True, target_label: Optional[str] = None) -> Dict[str, Any]:
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
    """
    content = rich_text.sanitize(content)
    announcement_id = None
    try:
        ins = _admin().table('announcements').insert({
            'organization_id': org_id,
            'author_id': author_id,
            'title': title,
            'message': content,
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
                                   student_ids=student_ids)

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
