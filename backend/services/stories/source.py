"""What a story is drafted from: one dataclass, whichever source it came from.

`StorySource` is the seam between the loaders (source_completion,
source_quest, and Phase 2's source_learning_moment) and everything after them
(the safety pass, the prompt, the drafter). A task story has one `TaskSource`;
a quest story has one per finalized task plus the student's reflections.

Everything textual in here has already been through the scrubber. The loaders
build the scrubber from the student's identity names and scrub as they read,
so no later stage holds a copy of a name to forget to remove. Media bytes are
transient: an image is held for the safety pass and the draft, a video or a
PDF for the safety pass only, and none of them is ever stored.

Every form of evidence has a candidate type here, so nothing a student
submitted is silently absent from the page:

  image, video, PDF   `ImageCandidate` (kind image | video | document); these
                      become `story_assets` rows and public copies
  typed text          `QuoteCandidate` (caption None): the student's own words
  docx/doc/txt/csv    `QuoteCandidate` (caption "From <title>"): the first
                      1500 characters; the file itself is never published
  external link       `LinkCandidate`: YouTube, Vimeo, a website, a Google Doc

Quotes and links are not assets (nothing to copy). They live on the evidence
section's items with an `included` flag and a `safety` verdict.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from config.constants import MAX_VIDEO_SIZE
from generated.credits import TRANSCRIPT_SUBJECT_NAMES, XP_PER_CREDIT
from utils.evidence_labels import block_items
from utils.logger import get_logger
from utils.storage_urls import canonical_stored_url, parse_object_ref
from utils.subject_xp import SUBJECT_NORMALIZATION, get_subject_xp_distribution

from services.stories.anonymize import Scrubber, grade_band

logger = get_logger(__name__)

FINALIZED = 'finalized'

#: A PDF larger than this is not published (and not sent to the model): the
#: story worker shares a 512MB container, and Gemini's inline request ceiling
#: is about this size.
MAX_DOCUMENT_SIZE = 20 * 1024 * 1024

#: The longest quotation the page shows. Cut on a sentence boundary, with an
#: ellipsis, so a quote never ends mid-word.
MAX_QUOTE_CHARS = 1500

#: How much of a PDF's text the drafter is shown. Prompt-only; the PDF is
#: published as a file, not as text.
MAX_DOCUMENT_EXCERPT_CHARS = 2500


# ── dataclasses ──────────────────────────────────────────────────────────────

@dataclass
class ImageCandidate:
    """One file the story might publish. `data` is bytes for the safety pass.

    `kind` is 'image', 'video' or 'document' (a PDF). The class keeps its
    original name because every stage downstream (safety, drafter, assemble)
    was written against it; `MediaCandidate` below is the same class under the
    name that now fits.
    """
    index: int                    # 1-based across the whole source: the [I<n>] label
    task_index: int
    block_id: Optional[str]
    item_index: int
    source_ref: str               # canonical private URL, never leaves the admin API
    mime_type: str
    data: Optional[bytes] = None
    label: str = 'a photo'
    kind: str = 'image'           # image | video | document
    file_name: Optional[str] = None  # the upload's name; admin-side only, never in a prompt
    excerpt: Optional[str] = None    # a document's scrubbed text, for the drafter only

    @property
    def is_video(self) -> bool:
        return self.kind == 'video'

    @property
    def is_document(self) -> bool:
        return self.kind == 'document'

    @property
    def is_image(self) -> bool:
        return self.kind == 'image'


MediaCandidate = ImageCandidate


@dataclass
class QuoteCandidate:
    """The student's words, or the first page of a document they wrote.

    `text` is scrubbed and capped at MAX_QUOTE_CHARS on a sentence boundary.
    `caption` is None for typed text and "From <title>" for a document.
    `text_index` is the position of the full text in `TaskSource.evidence_texts`,
    so the prompt can label it [Q<n>] without printing it twice.
    """
    index: int                    # 1-based across the whole source: the [Q<n>] label
    task_index: int
    block_id: Optional[str]
    item_index: int
    text: str
    caption: Optional[str]
    origin: str                   # text | document
    text_index: int = 0


@dataclass
class LinkCandidate:
    """An external URL the student submitted. Never fetched here, never copied.

    `title` is scrubbed: the student's own title for the link, else what the
    loader read from the video's oEmbed record, else the hostname.
    """
    index: int                    # 1-based across the whole source: the [L<n>] label
    task_index: int
    block_id: Optional[str]
    item_index: int
    url: str
    title: str
    host: str
    provider: Optional[str] = None   # youtube | vimeo | None
    video_id: Optional[str] = None


@dataclass
class RoundSource:
    round_number: int
    date: Optional[str]           # YYYY-MM-DD of the submission
    action: Optional[str]         # approved | grow_this | ...
    feedback: Optional[str]       # scrubbed, otherwise verbatim
    what_changed: Optional[str]


@dataclass
class TaskSource:
    index: int                    # 1-based: the [T<n>] label
    completion_id: str
    task_id: Optional[str]
    title: str
    description: str
    criteria: List[str]
    criteria_source: str
    subject_split: Dict[str, int]  # transcript keys -> XP
    xp: int
    evidence_texts: List[str] = field(default_factory=list)
    images: List[ImageCandidate] = field(default_factory=list)
    quotes: List[QuoteCandidate] = field(default_factory=list)
    links: List[LinkCandidate] = field(default_factory=list)
    ai_criteria: List[Dict[str, Any]] = field(default_factory=list)
    celebrate: Optional[str] = None
    rounds: List[RoundSource] = field(default_factory=list)
    finalized_at: Optional[str] = None
    diploma_status: Optional[str] = None
    is_confidential: bool = False
    merged_into: Optional[str] = None
    evidence_flags: List[str] = field(default_factory=list)

    @property
    def criteria_met(self) -> int:
        return sum(1 for c in self.ai_criteria if c.get('verdict') == 'met')

    @property
    def primary_subject(self) -> Optional[str]:
        return primary_subject_of(self.subject_split)


@dataclass
class StudentSource:
    user_id: str
    first_name: Optional[str]
    date_of_birth: Optional[str]
    grade_level: Optional[str]
    setting: str                  # academy | homeschool
    is_org_student: bool
    organization_id: Optional[str]
    identity_names: List[str]
    org_names: List[str]

    @property
    def grade_band(self) -> Optional[str]:
        return grade_band(self.date_of_birth, self.grade_level)


@dataclass
class QuestSource:
    quest_id: Optional[str]
    title: str
    description: str
    big_idea: str


@dataclass
class StorySource:
    source_type: str              # credit_submission | quest
    source_id: str
    student: StudentSource
    quest: QuestSource
    tasks: List[TaskSource]
    reflections: List[str] = field(default_factory=list)
    user_quest_id: Optional[str] = None
    quest_completed_at: Optional[str] = None

    @property
    def is_org_student(self) -> bool:
        return self.student.is_org_student

    @property
    def finalized_at(self) -> Optional[str]:
        stamps = [t.finalized_at for t in self.tasks if t.finalized_at]
        return max(stamps) if stamps else None

    @property
    def subject_split(self) -> Dict[str, int]:
        return pool_subjects(self.tasks)

    @property
    def xp_total(self) -> int:
        return sum(int(t.xp or 0) for t in self.tasks)

    @property
    def primary_subject(self) -> Optional[str]:
        return primary_subject_of(self.subject_split)

    @property
    def image_candidates(self) -> List[ImageCandidate]:
        """Every file candidate -- images, videos and PDFs -- in [I<n>] order."""
        return [img for task in self.tasks for img in task.images]

    @property
    def video_candidates(self) -> List[ImageCandidate]:
        return [c for c in self.image_candidates if c.is_video]

    @property
    def document_candidates(self) -> List[ImageCandidate]:
        return [c for c in self.image_candidates if c.is_document]

    @property
    def quote_candidates(self) -> List[QuoteCandidate]:
        """Every quote, in the order the student wrote them: the [Q<n>] order."""
        return [q for task in self.tasks for q in task.quotes]

    @property
    def link_candidates(self) -> List[LinkCandidate]:
        return [link for task in self.tasks for link in task.links]

    def release_images(self) -> None:
        """Drop the bytes. The story keeps pointers, never pixels."""
        for img in self.image_candidates:
            img.data = None

    def release_videos(self) -> None:
        """Drop the video and PDF bytes early. Both are only ever needed for
        the safety pass; the drafter cannot read them (it gets a PDF's excerpt
        instead) and the publish step downloads the original again."""
        for candidate in self.image_candidates:
            if candidate.is_video or candidate.is_document:
                candidate.data = None


# ── subjects and credit ──────────────────────────────────────────────────────

def subject_key(value: Optional[str]) -> str:
    text = (value or '').strip()
    if not text:
        return ''
    return SUBJECT_NORMALIZATION.get(text, text.lower().replace(' ', '_'))


def subject_display(key: Optional[str]) -> str:
    """'pe' -> 'Physical Education'. Unknown keys are title-cased."""
    k = subject_key(key)
    if not k:
        return 'Electives'
    return TRANSCRIPT_SUBJECT_NAMES.get(k) or k.replace('_', ' ').title()


def subject_slug(display: Optional[str]) -> str:
    return (display or '').strip().lower().replace('&', 'and').replace(' ', '-')


def pool_subjects(tasks: List[TaskSource]) -> Dict[str, int]:
    pooled: Dict[str, int] = {}
    for task in tasks:
        for subject, xp in (task.subject_split or {}).items():
            key = subject_key(subject)
            if key and int(xp or 0) > 0:
                pooled[key] = pooled.get(key, 0) + int(xp)
    return pooled


def primary_subject_of(split: Dict[str, int]) -> Optional[str]:
    """The subject with the most XP. Ties go to the first declared."""
    if not split:
        return None
    return max(split.items(), key=lambda kv: kv[1])[0]


def subject_split_rows(split: Dict[str, int]) -> List[Dict[str, Any]]:
    rows = [{'subject': subject_display(k), 'xp': int(v)} for k, v in split.items() if v]
    return sorted(rows, key=lambda r: -r['xp'])


def credit_fraction_for(xp: int) -> float:
    return round((xp or 0) / XP_PER_CREDIT, 2)


def credit_display(fraction: Any) -> str:
    """'0.5 credit', '1 credit', '1.5 credits'. Plural only above one, the way
    the landers and the transcript already say it."""
    try:
        value = float(fraction or 0)
    except (TypeError, ValueError):
        value = 0.0
    text = f'{value:.2f}'.rstrip('0').rstrip('.')
    if text in ('', '-0'):
        text = '0'
    unit = 'credits' if value > 1.0 + 1e-9 else 'credit'
    return f'{text} {unit}'


def task_subject_split(task: Dict[str, Any], xp: int,
                       rounds: List[Dict[str, Any]]) -> Dict[str, int]:
    """What the credit actually counted for.

    The last round's `approved_subjects` is what a human approved; the task's
    own split is the fallback for rounds that predate that column or hold a
    bare list of names.
    """
    for r in reversed(rounds or []):
        approved = r.get('approved_subjects')
        if isinstance(approved, dict) and approved:
            split: Dict[str, int] = {}
            for subject, amount in approved.items():
                try:
                    amount_int = int(round(float(amount)))
                except (TypeError, ValueError):
                    continue
                key = subject_key(subject)
                if key and amount_int > 0:
                    split[key] = split.get(key, 0) + amount_int
            if split:
                return split
    return {subject_key(k): int(v) for k, v in
            (get_subject_xp_distribution(task or {}, int(xp or 0)) or {}).items() if v}


# ── the student ──────────────────────────────────────────────────────────────

def _name_fields(row: Optional[Dict[str, Any]]) -> List[str]:
    if not row:
        return []
    return [str(row.get(k)) for k in ('first_name', 'last_name', 'display_name', 'preferred_name')
            if row.get(k)]


def build_student(repo, user_id: str) -> Optional[StudentSource]:
    student = repo.student(user_id)
    if not student:
        return None
    names = _name_fields(student)
    for parent in repo.parent_rows(student):
        names.extend(_name_fields(parent))
    org_id = student.get('organization_id')
    org_name = repo.org_name(org_id) if org_id else None
    enrollment = repo.active_academy_enrollment(user_id)
    return StudentSource(
        user_id=user_id,
        first_name=(student.get('preferred_name') or student.get('first_name') or None),
        date_of_birth=student.get('date_of_birth'),
        grade_level=(enrollment or {}).get('grade_level'),
        setting='academy' if enrollment else 'homeschool',
        is_org_student=bool(org_id),
        organization_id=org_id,
        identity_names=list(dict.fromkeys(n for n in names if n)),
        org_names=[org_name] if org_name else [],
    )


def scrubber_for(student: StudentSource) -> Scrubber:
    return Scrubber(student.identity_names, student.org_names)


# ── one task ─────────────────────────────────────────────────────────────────

def _date_of(value: Any) -> Optional[str]:
    if not value:
        return None
    return str(value)[:10]


def _what_changed(previous: Any, current: Any) -> Optional[str]:
    """One sentence on what the student changed between rounds, or None.

    Compared on what each piece IS (path, link, text hash), not on block ids,
    because a resubmission rewrites the block rows and every id changes.
    """
    from services.credit_ai_review.evidence_loader import item_fingerprint

    def prints(snapshot: Any) -> set:
        out = set()
        for block in (snapshot or []) if isinstance(snapshot, list) else []:
            if isinstance(block, dict):
                for item in block_items(block.get('content')):
                    out.add(item_fingerprint(item))
        return out

    before, after = prints(previous), prints(current)
    added, removed = len(after - before), len(before - after)
    if not added and not removed:
        return 'Resubmitted the same evidence.'
    parts = []
    if added:
        parts.append(f'added {added} piece{"s" if added != 1 else ""} of evidence')
    if removed:
        parts.append(f'removed {removed}')
    return (' and '.join(parts)).capitalize() + '.'


def rounds_from_rows(rows: List[Dict[str, Any]], scrubber: Scrubber) -> List[RoundSource]:
    out: List[RoundSource] = []
    previous_snapshot: Any = None
    for r in rows or []:
        number = int(r.get('round_number') or (len(out) + 1))
        action = r.get('reviewer_action') or r.get('org_reviewer_action')
        feedback = r.get('reviewer_feedback') or r.get('org_reviewer_feedback')
        out.append(RoundSource(
            round_number=number,
            # The site coerces this to a Date, so a round always carries one:
            # the submission date, or the review date for a round that
            # predates submitted_at being recorded.
            date=_date_of(r.get('submitted_at')) or _date_of(r.get('reviewed_at'))
            or _date_of(r.get('org_reviewed_at')),
            action=action,
            feedback=scrubber.scrub(feedback.strip()) if isinstance(feedback, str) and feedback.strip() else None,
            what_changed=_what_changed(previous_snapshot, r.get('evidence_snapshot')) if out else None,
        ))
        previous_snapshot = r.get('evidence_snapshot')
    return out


def _source_refs(snapshot: Any) -> Dict[tuple, Dict[str, Any]]:
    """(block_index, item_index) -> {block_id, source_ref, label} for every
    stored upload in the snapshot. Same enumeration the evidence loader uses,
    so its part indexes line up with these."""
    refs: Dict[tuple, Dict[str, Any]] = {}
    blocks = [b for b in (snapshot or []) if isinstance(b, dict)] if isinstance(snapshot, list) else []
    for block_index, block in enumerate(blocks, start=1):
        for item_index, item in enumerate(block_items(block.get('content')), start=1):
            if not isinstance(item, dict):
                continue
            url = item.get('url')
            if not url or not parse_object_ref(url):
                continue
            refs[(block_index, item_index)] = {
                'block_id': block.get('id'),
                'source_ref': canonical_stored_url(url),
                'label': str(item.get('filename') or item.get('file_name')
                             or item.get('title') or 'a photo')[:120],
            }
    return refs


# ── video uploads ────────────────────────────────────────────────────────────
#
# A `video` block whose item lives in one of our buckets is handled here, not
# by the evidence loader. The loader exists to feed a model a whole submission
# within one request's budget; it would inline a small video (spending the
# image budget on it), skip a large one with a "too large" flag, or -- with
# the File API on -- upload it and then delete the handle in release() before
# the safety pass could look at it. The story wants none of that. It wants the
# bytes, once, for the safety pass, and then a pointer.

#: What an upload's extension says it is, when the sniff needs a hint.
_VIDEO_MIME_BY_EXT = {
    'mp4': 'video/mp4', 'm4v': 'video/x-m4v', 'mov': 'video/quicktime',
    'webm': 'video/webm', 'mkv': 'video/x-matroska', 'avi': 'video/x-msvideo',
    'mpg': 'video/mpeg', 'mpeg': 'video/mpeg', '3gp': 'video/3gpp',
}


def _upload_name(item: Dict[str, Any]) -> str:
    return str(item.get('filename') or item.get('file_name') or item.get('title') or '')


def _strip_extension(name: str) -> str:
    base = name.rsplit('/', 1)[-1]
    if '.' in base:
        stem, ext = base.rsplit('.', 1)
        if stem and len(ext) <= 5 and ext.isalnum():
            return stem
    return base


def _is_stored_video(block: Dict[str, Any], item: Any) -> bool:
    if (block.get('block_type') or '') != 'video' or not isinstance(item, dict):
        return False
    url = item.get('url')
    return bool(url and parse_object_ref(url))


def _split_stored_videos(snapshot: List[Any]) -> Tuple[List[Any], Dict[tuple, int],
                                                       List[Tuple[int, int, Dict[str, Any], Dict[str, Any]]]]:
    """Take the stored video uploads out of the loader's view of the snapshot.

    Returns (loader_snapshot, index_map, videos):

      loader_snapshot  the snapshot with those items removed from their blocks.
                       Block positions are kept, so the loader's [E<n>] numbers
                       still line up with `_source_refs`.
      index_map        (block_index, loader_item_index) -> original item_index,
                       for the blocks that lost an item.
      videos           (block_index, item_index, block, item) for each video.
    """
    loader_snapshot: List[Any] = []
    index_map: Dict[tuple, int] = {}
    videos: List[Tuple[int, int, Dict[str, Any], Dict[str, Any]]] = []
    blocks = [b for b in snapshot if isinstance(b, dict)]
    for block_index, block in enumerate(blocks, start=1):
        items = block_items(block.get('content'))
        taken = [i for i, item in enumerate(items, start=1) if _is_stored_video(block, item)]
        if not taken:
            loader_snapshot.append(block)
            continue
        kept: List[Any] = []
        for item_index, item in enumerate(items, start=1):
            if item_index in taken:
                videos.append((block_index, item_index, block, item))
            else:
                kept.append(item)
                index_map[(block_index, len(kept))] = item_index
        loader_snapshot.append({**block, 'content': {'items': kept}})
    return loader_snapshot, index_map, videos


def _video_candidate(admin, block: Dict[str, Any], item: Dict[str, Any], *, index: int,
                     task_index: int, block_index: int, item_index: int,
                     scrubber: Scrubber) -> Tuple[Optional[ImageCandidate], Optional[str]]:
    """(candidate, flag). Exactly one of the two is set.

    The bytes are downloaded here and held for the safety pass. Anything over
    MAX_VIDEO_SIZE -- the ceiling the upload path already enforces -- is
    skipped rather than read, because the story worker shares a 512MB
    container with everything else.
    """
    from services.credit_ai_review.evidence_loader import sniff_mime
    from services.stories import assets as assets_mod

    name = _upload_name(item)
    label = scrubber.scrub(_strip_extension(name) or 'a video')[:120]
    tag = f'[E{block_index}] {label}'

    url = item.get('url') or ''
    declared_size = item.get('file_size')
    if isinstance(declared_size, int) and declared_size > MAX_VIDEO_SIZE:
        return None, f'{tag}: the video is too large for a story'

    client = assets_mod._admin_client(admin)
    # Ask the bucket before pulling the bytes: a signed upload can be ten
    # times the ceiling, and the ceiling is a memory limit, not a preference.
    known_size = assets_mod.object_size(client, url)
    if known_size is not None and known_size > MAX_VIDEO_SIZE:
        return None, f'{tag}: the video is too large for a story'

    blob = assets_mod._download(client, url)
    if not blob:
        return None, f'{tag}: the video could not be read'
    if len(blob) > MAX_VIDEO_SIZE:
        return None, f'{tag}: the video is too large for a story'

    ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
    mime = sniff_mime(blob, declared=_VIDEO_MIME_BY_EXT.get(ext), filename=name)
    if not mime.startswith('video/'):
        return None, f'{tag}: the file is not a video ({mime})'

    return ImageCandidate(
        index=index,
        task_index=task_index,
        block_id=block.get('id'),
        item_index=item_index,
        source_ref=canonical_stored_url(item.get('url')) or '',
        mime_type=mime,
        data=blob,
        label=label,
        kind='video',
        file_name=name or None,
    ), None


# ── quotes, documents and links ──────────────────────────────────────────────

_SENTENCE_END_RE = re.compile(r'[.!?]["\')\]]?(?=\s|$)')
_MIN_QUOTE_CUT = 200

#: Where a video link points, and the id the page needs to embed it.
_YOUTUBE_ID_RE = re.compile(
    r'(?:youtube\.com/(?:[^/]+/.+/|(?:v|e(?:mbed)?|shorts|live)/|.*[?&]v=)|youtu\.be/)([A-Za-z0-9_-]{11})')
_VIMEO_ID_RE = re.compile(r'vimeo\.com/(?:video/)?(\d+)')


def clip_quote(text: str, limit: int = MAX_QUOTE_CHARS) -> str:
    """`text` cut to `limit` characters on the last sentence boundary, plus "...".

    A quotation that stops mid-sentence reads as a mistake. The cut goes back
    to the last full stop, question mark or exclamation mark before the limit;
    when there is none far enough in, it goes back to the last space instead.
    An ellipsis marks every cut, so a reader knows there is more.
    """
    cleaned = ' '.join((text or '').split())
    if len(cleaned) <= limit:
        return cleaned
    head = cleaned[:limit]
    ends = [m.end() for m in _SENTENCE_END_RE.finditer(head)]
    if ends and ends[-1] >= _MIN_QUOTE_CUT:
        return head[:ends[-1]].rstrip() + '...'
    space = head.rfind(' ')
    cut = head[:space] if space >= _MIN_QUOTE_CUT else head
    return cut.rstrip(' ,;:') + '...'


def hostname_of(url: str) -> str:
    """The host a link points at, lower-case, without a leading www."""
    try:
        host = (urlparse(url or '').hostname or '').lower()
    except ValueError:
        return ''
    return host[4:] if host.startswith('www.') else host


def link_video(url: str) -> Tuple[Optional[str], Optional[str]]:
    """('youtube' | 'vimeo', id) when the URL is a video page, else (None, None)."""
    if not url or not isinstance(url, str):
        return None, None
    m = _YOUTUBE_ID_RE.search(url)
    if m:
        return 'youtube', m.group(1)
    m = _VIMEO_ID_RE.search(url)
    if m:
        return 'vimeo', m.group(1)
    return None, None


#: Uploads are stored as `<uuid>_<YYYYMMDD>_<HHMMSS>_<original name>`; the
#: prefix is machine noise (same rule as web/src/utils/evidenceItems.js).
_STAMPED_UPLOAD_RE = re.compile(r'^[0-9a-f-]{36}_\d{8}_\d{6}_(.+)$', re.IGNORECASE)


def document_title(name: str) -> str:
    """What a document is called on the page: the file's own name, without
    the storage stamp, the folder, the percent-encoding or the extension."""
    from urllib.parse import unquote
    base = unquote(str(name or '')).rsplit('/', 1)[-1]
    m = _STAMPED_UPLOAD_RE.match(base)
    if m:
        base = m.group(1)
    return _strip_extension(base).strip()


def _is_external_link(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    url = item.get('url')
    return (isinstance(url, str) and '://' in url and not parse_object_ref(url)
            and not url.lower().startswith('data:'))


def _link_title(item: Dict[str, Any], part: Any, url: str, scrubber: Scrubber) -> str:
    """The student's title for the link, else the video's oEmbed title, else the host.

    The oEmbed text the loader reads is "title -- author -- description"; only
    the title is wanted here, and never the author.
    """
    own = item.get('title')
    if isinstance(own, str) and own.strip() and '://' not in own:
        return scrubber.scrub(own.strip())[:200]
    if (part is not None and getattr(part, 'kind', None) == 'text' and part.text
            and getattr(part, 'source', None) in ('youtube', 'vimeo')):
        first = re.split(r'\s+(?:—|--|-)\s+', part.text.strip(), maxsplit=1)[0].strip()
        if first:
            return scrubber.scrub(first)[:200]
    return hostname_of(url) or 'a link'


def _story_budget():
    """The evidence loader's budget, adjusted for a story rather than a review.

    A PDF is inlined up to MAX_DOCUMENT_SIZE so the safety pass and the public
    copy see the same bytes, and the total inline room is raised to match; the
    loader here is not assembling one model request, so that ceiling is a
    memory bound, not an API one. A YouTube link is never a file_uri part: the
    drafter cannot watch it, and the oEmbed title the loader reads instead is
    what the link card shows.
    """
    from services.credit_ai_review.evidence_loader import Budget
    budget = Budget.from_config()
    budget.max_pdf_inline_bytes = MAX_DOCUMENT_SIZE
    budget.max_pdf_inline_pages = 1000
    budget.max_inline_bytes = max(budget.max_inline_bytes, 3 * MAX_DOCUMENT_SIZE)
    budget.max_youtube_parts = 0
    return budget


def _document_excerpt(blob: bytes, scrubber: Scrubber) -> Optional[str]:
    from services.credit_ai_review.evidence_loader import _pdf_text
    text = _pdf_text(blob)
    if not text:
        return None
    return scrubber.scrub(' '.join(text.split()))[:MAX_DOCUMENT_EXCERPT_CHARS] or None


def build_task(repo, completion: Dict[str, Any], *, index: int, scrubber: Scrubber,
               admin, image_offset: int = 0, load_images: bool = True,
               quote_offset: int = 0, link_offset: int = 0) -> TaskSource:
    """Everything the story needs about one finalized submission.

    `images` holds every file candidate for the task -- images, videos and
    PDFs -- in the order the evidence was submitted; `quotes` and `links` the
    text and the external URLs, likewise. The three offsets keep the [I<n>],
    [Q<n>] and [L<n>] numbers unique across a quest's tasks.
    """
    from repositories.credit_ai_review_repository import CreditAIReviewRepository
    from services.credit_ai_review import evidence_loader
    from services.credit_ai_review.prompt import criteria_for

    task = repo.task(completion.get('user_quest_task_id')) or {}
    rounds = repo.rounds_for_completion(completion['id'])
    criteria, criteria_source = criteria_for(task) if task else ([], 'task_description')
    xp = int(task.get('xp_value') or 0)

    review = CreditAIReviewRepository(client=admin).latest_complete_for_completion(
        completion['id']) or {}
    raw_review = review.get('review')
    review_body: Dict[str, Any] = raw_review if isinstance(raw_review, dict) else {}
    ai_criteria = [
        {
            'index': c.get('index'),
            'criterion': scrubber.scrub(str(c.get('criterion') or '')),
            'verdict': c.get('verdict'),
            'note': scrubber.scrub(str(c.get('note') or '')),
        }
        for c in (review_body.get('criteria') or []) if isinstance(c, dict)
    ]
    feedback = review_body.get('feedback')
    celebrate = feedback.get('celebrate') if isinstance(feedback, dict) else None

    evidence_texts: List[str] = []
    images: List[ImageCandidate] = []
    quotes: List[QuoteCandidate] = []
    links: List[LinkCandidate] = []
    flags: List[str] = []
    snapshot = rounds[-1].get('evidence_snapshot') if rounds else None
    if load_images and isinstance(snapshot, list) and snapshot:
        refs = _source_refs(snapshot)
        loader_snapshot, index_map, videos = _split_stored_videos(snapshot)
        blocks = [b for b in snapshot if isinstance(b, dict)]
        # The loader never uses the File API here. Stored videos were taken
        # out of its view above and are read by _video_candidate, whose bytes
        # the safety pass uploads itself and deletes itself; a handle the
        # loader made would be gone (release()) before that pass ran.
        load = evidence_loader.load_evidence(loader_snapshot, budget=_story_budget(),
                                             admin=admin, file_api_enabled=False)
        parts_by_item: Dict[tuple, Any] = {}
        try:
            for part in load.parts:
                item_index = index_map.get((part.block_index, part.item_index), part.item_index)
                parts_by_item[(part.block_index, item_index)] = part
                block = blocks[part.block_index - 1] if 0 < part.block_index <= len(blocks) else {}
                if part.kind == 'text' and part.text:
                    text = scrubber.scrub(part.text.strip())
                    evidence_texts.append(text)
                    # The student's own words, or the first page of a document
                    # they wrote, become a quotation. Text the loader pulled
                    # off a web page or a Google Doc does not: that is a link,
                    # and the page shows it as one.
                    if part.source == 'typed':
                        quotes.append(QuoteCandidate(
                            index=quote_offset + len(quotes) + 1, task_index=index,
                            block_id=block.get('id'), item_index=item_index,
                            text=clip_quote(text), caption=None, origin='text',
                            text_index=len(evidence_texts) - 1))
                    elif part.source == 'upload':
                        title = scrubber.scrub(document_title(part.label or '')).strip()
                        quotes.append(QuoteCandidate(
                            index=quote_offset + len(quotes) + 1, task_index=index,
                            block_id=block.get('id'), item_index=item_index,
                            text=clip_quote(text),
                            caption=f'From {title}' if title else 'From a document',
                            origin='document', text_index=len(evidence_texts) - 1))
                elif part.kind == 'inline' and part.data and part.source == 'upload':
                    ref = refs.get((part.block_index, item_index))
                    if not ref:
                        continue
                    mime = (part.mime_type or '').lower()
                    if mime.startswith('image/'):
                        images.append(ImageCandidate(
                            index=image_offset + len(images) + 1,
                            task_index=index,
                            block_id=ref['block_id'],
                            item_index=item_index,
                            source_ref=ref['source_ref'],
                            mime_type=part.mime_type or 'image/jpeg',
                            data=part.data,
                            label=scrubber.scrub(ref['label']),
                        ))
                    elif mime == 'application/pdf':
                        # The loader sniffed these bytes as a PDF and kept them
                        # whole. The safety pass reads the same bytes; the
                        # publish step copies the original.
                        name = ref['label'] if ref['label'] != 'a photo' else (part.label or '')
                        label = scrubber.scrub(document_title(name)).strip()
                        images.append(ImageCandidate(
                            index=image_offset + len(images) + 1,
                            task_index=index,
                            block_id=ref['block_id'],
                            item_index=item_index,
                            source_ref=ref['source_ref'],
                            mime_type='application/pdf',
                            data=part.data,
                            label=label or 'a document',
                            kind='document',
                            file_name=name or None,
                            excerpt=_document_excerpt(part.data, scrubber),
                        ))
            flags = list(load.flags or [])
        finally:
            evidence_loader.release(load)

        # External links come from the snapshot, not from the loader's parts:
        # a page the loader could not fetch is still a link the student
        # submitted, and the page shows it as one.
        for block_index, block in enumerate(blocks, start=1):
            for item_index, item in enumerate(block_items(block.get('content')), start=1):
                if not _is_external_link(item):
                    continue
                url = item['url'].strip()
                provider, video_id = link_video(url)
                links.append(LinkCandidate(
                    index=link_offset + len(links) + 1, task_index=index,
                    block_id=block.get('id'), item_index=item_index, url=url,
                    title=_link_title(item, parts_by_item.get((block_index, item_index)),
                                      url, scrubber),
                    host=hostname_of(url), provider=provider, video_id=video_id))

        for block_index, item_index, block, item in videos:
            candidate, flag = _video_candidate(
                admin, block, item, index=image_offset + len(images) + 1, task_index=index,
                block_index=block_index, item_index=item_index, scrubber=scrubber)
            if candidate is not None:
                images.append(candidate)
            elif flag:
                flags.append(flag)

    return TaskSource(
        index=index,
        completion_id=completion['id'],
        task_id=task.get('id'),
        title=scrubber.scrub(str(task.get('title') or 'Untitled task')),
        description=scrubber.scrub(str(task.get('description') or '')),
        criteria=[scrubber.scrub(c) for c in criteria],
        criteria_source=criteria_source,
        subject_split=task_subject_split(task, xp, rounds),
        xp=xp,
        evidence_texts=evidence_texts,
        images=images,
        quotes=quotes,
        links=links,
        ai_criteria=ai_criteria,
        celebrate=scrubber.scrub(celebrate) if isinstance(celebrate, str) else None,
        rounds=rounds_from_rows(rounds, scrubber),
        finalized_at=completion.get('finalized_at'),
        diploma_status=completion.get('diploma_status'),
        is_confidential=bool(completion.get('is_confidential')),
        merged_into=completion.get('merged_into'),
        evidence_flags=flags,
    )


def build_quest(repo, quest_id: Optional[str], scrubber: Scrubber) -> QuestSource:
    quest = repo.quest(quest_id) if quest_id else None
    quest = quest or {}
    return QuestSource(
        quest_id=quest.get('id'),
        title=scrubber.scrub(str(quest.get('title') or 'a project')),
        description=scrubber.scrub(str(quest.get('description') or '')),
        big_idea=scrubber.scrub(str(quest.get('big_idea') or '')),
    )


def reflections_from(notes: Any, scrubber: Scrubber) -> List[str]:
    """`user_quests.reflection_notes` in whatever shape the editor wrote it."""
    out: List[str] = []

    def add(text: Any) -> None:
        if isinstance(text, str) and text.strip():
            out.append(scrubber.scrub(text.strip()))

    if isinstance(notes, str):
        add(notes)
    elif isinstance(notes, list):
        for item in notes:
            if isinstance(item, dict):
                add(item.get('text') or item.get('reflection') or item.get('answer'))
            else:
                add(item)
    elif isinstance(notes, dict):
        for value in notes.values():
            if isinstance(value, (str, list, dict)):
                out.extend(reflections_from(value, scrubber))
    return out
