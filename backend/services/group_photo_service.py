"""Group photos: one capture, tagged to several students, written into each
one's learning journal -- and, from the SIS console, a note to their parents.

Ticket 85949de5 (Apogee Cache Valley, 2026-10-13): "a Photos page where a
coach takes or uploads a picture, taps every student in it, saves; each tagged
student's parents get an email; the photo also goes into each tagged student's
journal; works for group photos not tied to a lesson."

Treehouse's facilitator Capture tab (routes/treehouse.py /capture/upload and
/capture) already did the core of it. This module is that code, moved out of
the route so the SIS console's Photos page (routes/sis/photos.py) and
Treehouse share one implementation instead of two (tickets skill 2b: a second
photo uploader is the bloat the rule exists to stop). Treehouse keeps its
behaviour: it skips a student outside its org rather than refusing, and it
sends no parent notes.

One storage object per photo, however many students are tagged. Every tagged
student's evidence block points at the same file, so
LearningEventsService.delete_learning_event checks
GroupPhotoRepository.object_referenced_elsewhere before it removes a file.
Copying the object per student was the other option; it multiplies storage
and upload time by the class size for no gain a reference check does not give.

Parent notes (SIS only): one bell notification per guardian per tagged child,
linking to that child's journal, and ONE email per guardian per capture naming
every child of theirs in it. The email carries no photo: student images live
in private buckets behind expiring signed URLs, and a minor's picture in a
forwarded email is handed to a stranger (the weekly digest's rule,
EmailService.send_parent_weekly_digest). A parent stops the emails with the
signed link in the footer (services/parent_digest_links, kind 'photos'), which
writes notification_preferences 'child_photo_email' = false; the bell row is
its own type, 'child_photo_added', muted from notification settings.
"""

import threading
from datetime import date, timedelta
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from repositories.group_photo_repository import GroupPhotoRepository
from services import sis_service
from utils.logger import get_logger
from utils.storage_urls import canonical_stored_url, parse_object_ref

logger = get_logger(__name__)

NOTIFICATION_TYPE = 'child_photo_added'
EMAIL_PREFERENCE = 'child_photo_email'

MAX_STUDENTS = 200
MAX_MEDIA = 10
MAX_CAPTION = 2000
RECENT_LIMIT = 20


class GroupPhotoError(Exception):
    """A capture the caller must fix. `status` is the HTTP answer."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def run_in_background(fn: Callable[[], None]) -> None:
    """Fire-and-forget, the established pattern (announcement emails). A
    capture for a class is dozens of notifications and emails; the coach
    should not wait on SendGrid. Tests replace this to run inline."""
    threading.Thread(target=fn, daemon=True).start()


def _first_name(row: Optional[Dict[str, Any]], fallback: str) -> str:
    row = row or {}
    return (row.get('first_name') or (row.get('display_name') or '').split(' ')[0]
            or fallback).strip()


def _join_names(names: List[str]) -> str:
    if len(names) <= 1:
        return ''.join(names)
    return ', '.join(names[:-1]) + f' and {names[-1]}'


# -- evidence blocks ------------------------------------------------------------

def evidence_block(event_id: str, idx: int, media_item: Dict[str, Any]) -> Dict[str, Any]:
    """A learning_event_evidence_blocks row from a capture media item.

    The upload endpoint hands the client a signed, expiring twin beside the
    durable pointer, and a capture form posts back whichever it holds. Reduce
    it before it reaches a row, or the moment renders for one TTL and is
    broken after (routes/advisor/learning_moments.py does the same).
    """
    mtype = media_item.get('type', 'image')
    if mtype == 'link':
        return {'learning_event_id': event_id, 'block_type': 'link', 'order_index': idx,
                'content': {'url': media_item.get('url'), 'title': media_item.get('title', ''), 'caption': ''}}
    file_url = media_item.get('file_url')
    if isinstance(file_url, str):
        file_url = canonical_stored_url(file_url)
    common = {
        'learning_event_id': event_id, 'order_index': idx,
        'file_url': file_url, 'file_name': media_item.get('file_name'),
        'file_size': media_item.get('file_size', 0),
    }
    if mtype in ('document', 'video'):
        return {**common, 'block_type': mtype,
                'content': {'url': file_url, 'filename': media_item.get('file_name', ''), 'caption': ''}}
    return {**common, 'block_type': 'image',
            'content': {'url': file_url, 'caption': '', 'alt_text': media_item.get('file_name', '')}}


# -- upload -----------------------------------------------------------------------

def upload_files(files: Iterable[Any], uploader_id: str, *, security_scan: bool = True,
                 client=None) -> List[Dict[str, Any]]:
    """Upload a capture's photos and videos before any journal row exists.

    MediaUploadService runs the image safety gate (known-CSAM hash match, then
    the classifier) on every picture whatever `security_scan` says;
    security_scan adds the magic-byte / polyglot check. The uploader owns the
    storage path: one learning event per tagged student is made only once the
    capture is saved. One bad file fails the batch, because a partial upload
    would leave a coach saving a capture without the photo they took.
    """
    files = [f for f in (files or []) if f and getattr(f, 'filename', None)]
    if not files:
        raise GroupPhotoError('No files provided')
    if len(files) > MAX_MEDIA:
        raise GroupPhotoError(f'Up to {MAX_MEDIA} files at a time')

    from services.media_upload_service import MediaUploadService
    if client is None:
        from database import get_supabase_admin_client
        # admin client justified: staff-gated upload into the shared evidence
        #   bucket before any event exists; the route checked the caller.
        client = get_supabase_admin_client()
    uploader = MediaUploadService(client)
    uploaded = []
    for f in files:
        result = uploader.upload_evidence_file(
            f, user_id=uploader_id, context_type='event', context_id=uploader_id,
            security_scan=security_scan,
        )
        if not result.success:
            status = 413 if result.error_code == 'FILE_TOO_LARGE' else 400
            raise GroupPhotoError(f'{f.filename}: {result.error_message}', status)
        uploaded.append({
            'url': result.file_url,
            'display_url': result.display_url,
            'original_name': f.filename,
            'stored_name': result.filename,
            'size': result.file_size,
            'content_type': result.content_type,
        })
    return uploaded


# -- the service ----------------------------------------------------------------

class GroupPhotoService:
    def __init__(self, repository: Optional[GroupPhotoRepository] = None):
        self.repository = repository or GroupPhotoRepository()

    # reads ------------------------------------------------------------------

    def roster(self, org_id: str) -> List[Dict[str, Any]]:
        """The school's current students, as the People page lists them
        (sis_service.get_roster pages past the 1,000-row cap)."""
        return [
            {'id': p['student_id'], 'name': p.get('name') or 'Student',
             'avatar_url': p.get('avatar_url')}
            for p in sis_service.get_roster(org_id)
            if p.get('is_student')
            and p.get('enrollment_status') not in sis_service.INACTIVE_ENROLLMENT_STATUSES
        ]

    def students_in_org(self, org_id: str, student_ids: Iterable[str]) -> Tuple[List[str], Dict[str, Dict]]:
        """(ids that are students of this org, in the order asked, {id: row})."""
        wanted = [str(s) for s in dict.fromkeys(student_ids or []) if s]
        rows = {u['id']: u for u in self.repository.users(wanted)}
        ok = [sid for sid in wanted
              if sid in rows and rows[sid].get('organization_id') == org_id
              and sis_service.is_student(rows[sid])]
        return ok, rows

    # writes -----------------------------------------------------------------

    def create_capture(self, org_id: str, actor_id: str, student_ids: Iterable[str], *,
                       description: str = '', media: Optional[List[Dict[str, Any]]] = None,
                       event_date: Optional[str] = None, attached_task_id: Optional[str] = None,
                       default_description: str = 'Captured by staff',
                       refuse_outsiders: bool = True) -> Dict[str, Any]:
        """One learning_events row per tagged student, each with the media as
        evidence blocks. Returns {created: [{student_id, event_id}], students: {id: row}}.

        refuse_outsiders=True (the SIS console) refuses the whole capture when
        any tagged id is not a student of `org_id`, and writes nothing.
        False (Treehouse, as it always was) skips those ids.
        """
        wanted = [str(s) for s in dict.fromkeys(student_ids or []) if s]
        media = list(media or [])
        description = (description or '').strip()
        if not wanted:
            raise GroupPhotoError('Tag at least one student')
        if not description and not media:
            raise GroupPhotoError('Add a caption or a photo')

        valid, rows = self.students_in_org(org_id, wanted)
        if refuse_outsiders and len(valid) != len(wanted):
            raise GroupPhotoError('Every tagged student must be in this school', 403)

        created = []
        for sid in valid:
            event = {
                'user_id': sid, 'captured_by_user_id': actor_id,
                'description': description or default_description,
                'source_type': 'advisor_captured', 'pillars': [],
            }
            if event_date:
                event['event_date'] = event_date
            # Only attach a task when it genuinely belongs to this student.
            if attached_task_id and self.repository.task_belongs_to(attached_task_id, sid):
                event['attached_task_id'] = attached_task_id
            row = self.repository.insert_event(event)
            if not row:
                continue
            self.repository.insert_blocks([evidence_block(row['id'], i, m) for i, m in enumerate(media)])
            created.append({'student_id': sid, 'event_id': row['id']})
        return {'created': created, 'students': rows}

    def capture(self, org_id: str, actor_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """The SIS console's save: validate, write each journal, tell the parents.

        Body: {student_ids: [...], caption?, event_date? (YYYY-MM-DD, default
        today), media: [{type: 'image'|'video', file_url, file_name, file_size}]}.
        """
        student_ids = data.get('student_ids') or []
        if not isinstance(student_ids, list):
            raise GroupPhotoError('student_ids must be a list')
        if len(student_ids) > MAX_STUDENTS:
            raise GroupPhotoError(f'Up to {MAX_STUDENTS} students at a time')
        caption = (data.get('caption') or data.get('description') or '').strip()
        if len(caption) > MAX_CAPTION:
            raise GroupPhotoError(f'Keep the caption under {MAX_CAPTION} characters')
        media = self._clean_media(data.get('media') or [])
        event_date = self._clean_date(data.get('event_date'))

        result = self.create_capture(org_id, actor_id, student_ids, description=caption,
                                     media=media, event_date=event_date,
                                     default_description='Photo from school')
        created = result['created']
        notified = self.notify_parents(org_id, actor_id, created, caption, media)
        return {'count': len(created), 'created': created, **notified}

    @staticmethod
    def _clean_media(media: Any) -> List[Dict[str, Any]]:
        """Photos and videos that point at our own storage. A capture links an
        uploaded object; an arbitrary URL in a child's journal is not a photo."""
        if not isinstance(media, list):
            raise GroupPhotoError('media must be a list')
        if len(media) > MAX_MEDIA:
            raise GroupPhotoError(f'Up to {MAX_MEDIA} photos at a time')
        out = []
        for m in media:
            if not isinstance(m, dict) or m.get('type', 'image') not in ('image', 'video'):
                raise GroupPhotoError('Only photos and videos can be added here')
            if not parse_object_ref(m.get('file_url')):
                raise GroupPhotoError('Upload the photo first')
            out.append({'type': m.get('type', 'image'), 'file_url': m['file_url'],
                        'file_name': m.get('file_name'), 'file_size': m.get('file_size') or 0})
        return out

    @staticmethod
    def _clean_date(value: Any) -> Optional[str]:
        """None means the column default (today). A day ahead is allowed: the
        page sends the coach's local date, which can lead UTC."""
        if not value:
            return None
        try:
            day = date.fromisoformat(str(value)[:10])
        except ValueError:
            raise GroupPhotoError('event_date must be YYYY-MM-DD') from None
        if day > date.today() + timedelta(days=1):
            raise GroupPhotoError('The date cannot be in the future')
        return day.isoformat()

    # parent notes -----------------------------------------------------------

    def notify_parents(self, org_id: str, actor_id: str, created: List[Dict[str, str]],
                       caption: str, media: List[Dict[str, Any]]) -> Dict[str, int]:
        """Work out who hears about this capture, answer with the counts at
        once, and send in the background. Students are never sent anything:
        a guardian who is also a student of the school is skipped."""
        from utils.class_membership import guardians_by_student

        event_by_student = {c['student_id']: c['event_id'] for c in created}
        if not event_by_student:
            return {'families_notified': 0, 'parents_notified': 0}
        by_student = guardians_by_student(list(event_by_student))
        guardian_ids = set().union(*by_student.values()) if by_student else set()
        people = {u['id']: u for u in self.repository.users(
            list(guardian_ids) + list(event_by_student) + [actor_id])}
        guardian_ids = {g for g in guardian_ids
                        if g in people and g not in event_by_student
                        and not sis_service.is_student(people[g])}
        if not guardian_ids:
            return {'families_notified': 0, 'parents_notified': 0}

        children_of: Dict[str, List[str]] = {}
        for sid in event_by_student:   # tagged order
            for g in sorted(by_student.get(sid) or ()):
                if g in guardian_ids:
                    children_of.setdefault(g, []).append(sid)
        # Siblings share a family: count each distinct set of guardians once.
        families = {frozenset(g for g in (by_student.get(sid) or ()) if g in guardian_ids)
                    for sid in event_by_student}
        families.discard(frozenset())

        plan = {
            'org_id': org_id,
            'coach': _first_name(people.get(actor_id), 'Your school'),
            'caption': caption,
            'kind': 'video' if media and all(m.get('type') == 'video' for m in media)
                    else ('photo' if media else 'note'),
            'children_of': children_of,
            'events': event_by_student,
            'names': {sid: _first_name(people.get(sid), 'your child') for sid in event_by_student},
            'guardians': {g: people[g] for g in children_of},
        }
        run_in_background(lambda: self._send(plan))
        return {'families_notified': len(families), 'parents_notified': len(children_of)}

    def _send(self, plan: Dict[str, Any]) -> None:
        """Bell rows, then one email per mailbox. Every send is best-effort:
        the capture is saved already, and one failure must not stop the rest."""
        from services.announcement_email_service import _canonical_mailbox, _is_placeholder
        from services.email_service import email_service
        from services.notification_service import NotificationService
        from services import parent_digest_links
        from app_config import Config

        org_id = plan['org_id']
        coach, kind, caption = plan['coach'], plan['kind'], plan['caption']
        names = plan['names']
        noun = {'photo': 'a new photo', 'video': 'a new video', 'note': 'a note'}[kind]
        about = 'about' if kind == 'note' else 'of'

        try:
            notifier = NotificationService()
        except Exception as e:  # noqa: BLE001
            logger.warning(f'group photo: notification service unavailable: {e}')
            notifier = None
        for g, kids in plan['children_of'].items():
            for sid in kids:
                if notifier is None:
                    break
                try:
                    notifier.create_notification(
                        user_id=g, notification_type=NOTIFICATION_TYPE,
                        title=f'New {kind} of {names[sid]}' if kind != 'note' else f'A note about {names[sid]}',
                        message=f'{coach} added {noun} {about} {names[sid]} to their journal.'
                                + (f' "{caption[:140]}"' if caption else ''),
                        link=f'/parent/child/{sid}/journal',
                        metadata={'student_id': sid, 'event_id': plan['events'][sid]},
                        organization_id=org_id,
                    )
                except Exception as e:  # noqa: BLE001
                    logger.warning(f'group photo: notification to {g[:8]} failed: {e}')

        try:
            muted = self.repository.disabled_for(plan['children_of'], EMAIL_PREFERENCE)
            org_name = self.repository.org_name(org_id) or 'school'
        except Exception as e:  # noqa: BLE001
            logger.warning(f'group photo: email lookup failed for org {org_id}: {e}')
            return

        # One mailbox, one email (announcement_email_service's rule): a parent
        # whose two accounts are plus-aliases of one inbox gets one copy, and
        # it names every child either account is linked to.
        mailboxes: Dict[str, Dict[str, Any]] = {}
        for g, kids in plan['children_of'].items():
            row = plan['guardians'][g]
            addr = (row.get('email') or '').strip().lower()
            if g in muted or _is_placeholder(addr):
                continue
            box = mailboxes.setdefault(_canonical_mailbox(addr),
                                       {'to': addr, 'guardian': g, 'row': row, 'kids': []})
            box['kids'] += [k for k in kids if k not in box['kids']]

        app_base = (Config.FRONTEND_URL or '').rstrip('/')
        for box in mailboxes.values():
            try:
                email_service.send_child_photo_email(
                    to_email=box['to'],
                    parent_name=_first_name(box['row'], 'there'),
                    coach_name=coach,
                    org_name=org_name,
                    kind=kind,
                    caption=caption,
                    children=[{'name': names[k], 'url': f'{app_base}/parent/child/{k}/journal'}
                              for k in box['kids']],
                    unsubscribe_url=parent_digest_links.unsubscribe_url(box['guardian'], 'photos'),
                )
            except Exception as e:  # noqa: BLE001
                logger.warning(f'group photo: email to guardian {box["guardian"][:8]} failed: {e}')

    # recent -----------------------------------------------------------------

    def recent(self, org_id: str, student_ids: Optional[List[str]] = None,
               limit: int = RECENT_LIMIT) -> List[Dict[str, Any]]:
        """The school's newest staff captures, one entry per capture (the rows
        a capture wrote share their storage objects, or else their author,
        caption and minute)."""
        from utils.storage_urls import sign_stored_urls

        if student_ids is None:
            student_ids = [s['id'] for s in self.roster(org_id)]
        rows = self.repository.recent_staff_captures(student_ids, limit * 10)
        if not rows:
            return []
        blocks: Dict[str, List[Dict[str, Any]]] = {}
        for b in self.repository.blocks_for([r['id'] for r in rows]):
            blocks.setdefault(b['learning_event_id'], []).append(b)

        groups: Dict[tuple, Dict[str, Any]] = {}
        for r in rows:
            mine = blocks.get(r['id'], [])
            urls = tuple(b.get('file_url') or '' for b in mine)
            key = ((r.get('captured_by_user_id'), urls) if any(urls) else
                   (r.get('captured_by_user_id'), r.get('description'), (r.get('created_at') or '')[:16]))
            g = groups.get(key)
            if g is None:
                if len(groups) >= limit:
                    continue
                g = groups[key] = {
                    'id': r['id'], 'created_at': r.get('created_at'), 'event_date': r.get('event_date'),
                    'caption': r.get('description'), 'captured_by': r.get('captured_by_user_id'),
                    'student_ids': [],
                    'media': [{'type': b.get('block_type'), 'url': b.get('file_url')} for b in mine],
                }
            if r['user_id'] not in g['student_ids']:
                g['student_ids'].append(r['user_id'])

        out = list(groups.values())
        people = {u['id']: u for u in self.repository.users(
            {sid for g in out for sid in g['student_ids']} | {g['captured_by'] for g in out if g['captured_by']})}
        signed = sign_stored_urls([m['url'] for g in out for m in g['media'] if m.get('url')])
        for g in out:
            g['students'] = [{'id': sid, 'name': _first_name(people.get(sid), 'Student')
                              + (f" {people[sid].get('last_name')}" if people.get(sid, {}).get('last_name') else '')}
                             for sid in g.pop('student_ids')]
            g['captured_by_name'] = _first_name(people.get(g.pop('captured_by')), 'Staff')
            for m in g['media']:
                m['url'] = signed.get(m['url'], m['url']) if m.get('url') else None
        return out
