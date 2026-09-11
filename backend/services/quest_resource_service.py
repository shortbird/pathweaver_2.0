"""Files, links and videos attached to a quest and to its individual tasks.

There has been nowhere to put them. A quest carries `material_link` -- one
free-text URL, rendered as a single anchor -- and a task carries nothing. So a
teacher with a worksheet for step 3 and a demo video for step 5 could paste both
into a task description, or put them on the class as materials, where they land
in one undifferentiated list with no way to say which task they belong to
(iCreate, 2026-09-10: "resources attached to quest and to individual tasks").

Two rules worth stating up front, because both are load-bearing:

* No stored markup. There is no embed_html column and this module never accepts
  one. Storing HTML a school pastes in and rendering it back to students is a
  stored-XSS hole in a page children open. A video is a URL; the client matches
  it against the providers videoUtils knows and renders anything else as a link.

* Store canonical, serve signed. `org-documents` is private, so an uploaded
  file's row holds a pointer a browser cannot fetch, and every read signs it.
  One batched signing call per quest, never one per resource.
"""

import uuid
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from utils.document_uploads import (
    DOCUMENT_BUCKET, DOCUMENT_EXTENSIONS, MAX_DOCUMENT_BYTES, MAX_TITLE_LEN,
)
# admin client justified: quest_resources is deny-all RLS (service role only,
# like class_materials); every caller here has already passed the per-quest gate
# in routes/sis/quest_resources.py, and reads return a quest's own attachments.
from utils.admin_client import admin_client as _admin
from repositories.quest_resource_repository import QuestResourceRepository
from utils.logger import get_logger
from utils.storage_urls import public_object_url, sign_in_place
from utils.timestamps import now_iso

logger = get_logger(__name__)

KINDS = ('link', 'file', 'video')


def _clean_url(raw: str) -> str:
    """An http(s) URL, or a ValueError.

    Same check the class-materials link route makes. javascript: and data: URLs
    are the reason it exists -- both would be handed straight to a student's
    browser as an href.
    """
    url = (raw or '').strip()
    if not url:
        raise ValueError('A link needs a URL')
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise ValueError('Links have to start with http:// or https://')
    return url


def _clean_title(raw: str, fallback: str = '') -> str:
    title = (raw or '').strip() or fallback
    if not title:
        raise ValueError('A resource needs a title')
    return title[:MAX_TITLE_LEN]


def _repo(admin=None) -> QuestResourceRepository:
    return QuestResourceRepository(client=admin or _admin())


def _belongs_to_quest(repo, quest_id: str, task_id: Optional[str]) -> bool:
    return True if not task_id else repo.task_belongs_to_quest(quest_id, task_id)


def list_for_quest(quest_id: str, admin=None) -> Dict[str, Any]:
    """Everything attached to this quest.

    Returns ``{'quest': [...], 'by_task': {template_task_id: [...]}}``. One
    signing call covers every uploaded file across both, because a quest with a
    resource on each of twelve tasks would otherwise be twelve storage round
    trips on a page load.
    """
    rows = _repo(admin).list_for_quest(quest_id)
    sign_in_place(rows, ['url'], DOCUMENT_BUCKET)

    out: Dict[str, Any] = {'quest': [], 'by_task': {}}
    for row in rows:
        task_id = row.get('task_id')
        if task_id:
            out['by_task'].setdefault(task_id, []).append(row)
        else:
            out['quest'].append(row)
    return out


def add_link(quest: Dict[str, Any], *, task_id: Optional[str], kind: str,
             title: str, url: str, user_id: str, admin=None) -> Dict[str, Any]:
    """Attach a link or a video. `kind` must be 'link' or 'video'."""
    repo = _repo(admin)
    if kind not in ('link', 'video'):
        raise ValueError('kind has to be "link" or "video"')
    clean_url = _clean_url(url)
    if not _belongs_to_quest(repo, quest['id'], task_id):
        raise ValueError('That task is not part of this quest')

    row = {
        'organization_id': quest.get('organization_id'),
        'quest_id': quest['id'],
        'task_id': task_id or None,
        'kind': kind,
        'title': _clean_title(title, fallback=urlparse(clean_url).netloc),
        'url': clean_url,
        'sort_order': repo.next_sort_order(quest['id'], task_id),
        'created_by': user_id,
        'created_at': now_iso(),
    }
    return repo.create(row)


def upload(quest: Dict[str, Any], *, task_id: Optional[str], file,
           title: str, user_id: str, admin=None) -> Dict[str, Any]:
    """Attach an uploaded document. Same rules as class materials."""
    admin = admin or _admin()
    repo = _repo(admin)
    filename = getattr(file, 'filename', '') or ''
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext not in DOCUMENT_EXTENSIONS:
        raise ValueError(f'That file type is not allowed ({", ".join(sorted(DOCUMENT_EXTENSIONS))})')
    if not _belongs_to_quest(repo, quest['id'], task_id):
        raise ValueError('That task is not part of this quest')

    payload = file.read()
    if len(payload) > MAX_DOCUMENT_BYTES:
        raise ValueError('That file is too large (25MB maximum)')

    org_id = quest.get('organization_id')
    path = f'{org_id}/quest-resources/{quest["id"]}/{uuid.uuid4()}.{ext}'
    admin.storage.from_(DOCUMENT_BUCKET).upload(
        path, payload,
        {'content-type': getattr(file, 'content_type', None) or 'application/octet-stream'})

    row = {
        'organization_id': org_id,
        'quest_id': quest['id'],
        'task_id': task_id or None,
        'kind': 'file',
        'title': _clean_title(title, fallback=filename),
        # The canonical pointer. Reads sign it; storing a signed URL would give
        # the row a lifetime and leave a broken link after it.
        'url': public_object_url(path, DOCUMENT_BUCKET),
        'file_path': path,
        'sort_order': repo.next_sort_order(quest['id'], task_id),
        'created_by': user_id,
        'created_at': now_iso(),
    }
    return repo.create(row)


def remove(quest_id: str, resource_id: str, admin=None) -> bool:
    """Detach a resource, and delete its file if it had one."""
    admin = admin or _admin()
    repo = _repo(admin)
    row = repo.find_in_quest(quest_id, resource_id)
    if not row:
        return False
    path = row.get('file_path')
    repo.delete_by_id(resource_id)
    if path:
        try:
            admin.storage.from_(DOCUMENT_BUCKET).remove([path])
        except Exception as e:  # noqa: BLE001
            # The row is gone either way. An orphaned object costs storage; a
            # failed delete that rolled back the row would leave the teacher
            # staring at a resource they just removed.
            logger.warning(f'quest resources: could not delete {path}: {e}')
    return True


def reorder(quest_id: str, task_id: Optional[str], ordered_ids: List[str],
            admin=None) -> int:
    """Put this task's (or the quest's) resources in the given order."""
    repo = _repo(admin)
    known = repo.ids_in_scope(quest_id, task_id)
    moved = 0
    for position, resource_id in enumerate(ordered_ids or []):
        if resource_id not in known:
            continue
        repo.set_sort_order(resource_id, position)
        moved += 1
    return moved


def copy_for_quest(source_quest_id: str, new_quest_id: str,
                   task_id_map: Dict[str, str], org_id: str, user_id: str,
                   admin=None) -> int:
    """Copy a quest's resources onto its duplicate.

    `task_id_map` is {old template task id: new one}. A resource whose task is
    not in the map is dropped rather than orphaned onto the quest -- landing a
    step-3 worksheet in the quest intro is worse than losing it, because nobody
    would notice it had moved.

    Uploaded files are SHARED, not re-uploaded: the copy points at the same
    object with file_path NULL, so deleting the copy's resource can never remove
    the original's file.
    """
    repo = _repo(admin)
    rows = repo.list_for_copy(source_quest_id)
    copies = []
    for row in rows:
        old_task = row.get('task_id')
        if old_task and old_task not in task_id_map:
            continue
        copies.append({
            'organization_id': org_id,
            'quest_id': new_quest_id,
            'task_id': task_id_map.get(old_task) if old_task else None,
            'kind': row['kind'],
            'title': row['title'],
            'url': row['url'],
            'file_path': None,
            'sort_order': row.get('sort_order') or 0,
            'created_by': user_id,
            'created_at': now_iso(),
        })
    if not copies:
        return 0
    try:
        return repo.create_many(copies)
    except Exception as e:  # noqa: BLE001
        # The duplicate itself already exists and is usable; losing its
        # attachments is not worth failing the whole copy over.
        logger.warning(f'quest resources: copy insert failed for {new_quest_id}: {e}')
        return 0


def can_edit_quest(user_id: str, quest: Dict[str, Any], admin=None) -> bool:
    """Whether this person may attach things to this quest.

    An org admin of the quest's own org, or a teacher who moderates a class the
    quest is attached to -- the same gate routes/sis/class_quests.py applies to
    editing the quest's tasks, since attaching a worksheet to a task is the same
    act as writing the task.

    A quest with no organization (the Optio library) is not editable here at
    all: those are shared across every school, and one school's teacher
    attaching their handout to one would put it in front of all of them.
    """
    admin = admin or _admin()
    org_id = quest.get('organization_id')
    if not org_id:
        return False

    from services import sis_service
    if sis_service.caller_is_admin(user_id):
        return sis_service.resolve_org_id(user_id, org_id) == org_id

    links = (admin.table('class_quests').select('class_id')
             .eq('quest_id', quest['id']).execute()).data or []  # noqa: E501
    if not links:
        return False
    class_ids = [row['class_id'] for row in links if row.get('class_id')]
    if not class_ids:
        return False

    from utils import class_membership
    for class_id in class_ids:
        if user_id in class_membership.class_teacher_ids(class_id):
            return True
    return False
