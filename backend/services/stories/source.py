"""What a story is drafted from: one dataclass, whichever source it came from.

`StorySource` is the seam between the loaders (source_completion,
source_quest, and Phase 2's source_learning_moment) and everything after them
(the safety pass, the prompt, the drafter). A task story has one `TaskSource`;
a quest story has one per finalized task plus the student's reflections.

Everything textual in here has already been through the scrubber. The loaders
build the scrubber from the student's identity names and scrub as they read,
so no later stage holds a copy of a name to forget to remove. Image bytes are
transient: they are held for the safety pass and the draft, and never stored.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from generated.credits import TRANSCRIPT_SUBJECT_NAMES, XP_PER_CREDIT
from utils.evidence_labels import block_items
from utils.logger import get_logger
from utils.storage_urls import canonical_stored_url, parse_object_ref
from utils.subject_xp import SUBJECT_NORMALIZATION, get_subject_xp_distribution

from services.stories.anonymize import Scrubber, grade_band

logger = get_logger(__name__)

FINALIZED = 'finalized'


# ── dataclasses ──────────────────────────────────────────────────────────────

@dataclass
class ImageCandidate:
    """One image the story might show. `data` is bytes for the safety pass."""
    index: int                    # 1-based across the whole source: the [I<n>] label
    task_index: int
    block_id: Optional[str]
    item_index: int
    source_ref: str               # canonical private URL, never leaves the admin API
    mime_type: str
    data: Optional[bytes] = None
    label: str = 'a photo'


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
        return [img for task in self.tasks for img in task.images]

    def release_images(self) -> None:
        """Drop the bytes. The story keeps pointers, never pixels."""
        for img in self.image_candidates:
            img.data = None


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


def build_task(repo, completion: Dict[str, Any], *, index: int, scrubber: Scrubber,
               admin, image_offset: int = 0, load_images: bool = True) -> TaskSource:
    """Everything the story needs about one finalized submission."""
    from repositories.credit_ai_review_repository import CreditAIReviewRepository
    from services.credit_ai_review import evidence_loader
    from services.credit_ai_review.prompt import criteria_for

    task = repo.task(completion.get('user_quest_task_id')) or {}
    rounds = repo.rounds_for_completion(completion['id'])
    criteria, criteria_source = criteria_for(task) if task else ([], 'task_description')
    xp = int(task.get('xp_value') or 0)

    review = CreditAIReviewRepository(client=admin).latest_complete_for_completion(
        completion['id']) or {}
    review_body = review.get('review') if isinstance(review.get('review'), dict) else {}
    ai_criteria = [
        {
            'index': c.get('index'),
            'criterion': scrubber.scrub(str(c.get('criterion') or '')),
            'verdict': c.get('verdict'),
            'note': scrubber.scrub(str(c.get('note') or '')),
        }
        for c in (review_body.get('criteria') or []) if isinstance(c, dict)
    ]
    celebrate = ((review_body.get('feedback') or {}).get('celebrate')
                 if isinstance(review_body.get('feedback'), dict) else None)

    evidence_texts: List[str] = []
    images: List[ImageCandidate] = []
    flags: List[str] = []
    snapshot = rounds[-1].get('evidence_snapshot') if rounds else None
    if load_images and isinstance(snapshot, list) and snapshot:
        refs = _source_refs(snapshot)
        # Never the File API: a story has no use for a child's video, and an
        # upload it does not need is an upload it should not make.
        load = evidence_loader.load_evidence(snapshot, admin=admin, file_api_enabled=False)
        try:
            for part in load.parts:
                if part.kind == 'text' and part.text:
                    evidence_texts.append(scrubber.scrub(part.text.strip()))
                elif (part.kind == 'inline' and part.data
                      and (part.mime_type or '').startswith('image/')):
                    ref = refs.get((part.block_index, part.item_index))
                    if not ref:
                        continue
                    images.append(ImageCandidate(
                        index=image_offset + len(images) + 1,
                        task_index=index,
                        block_id=ref['block_id'],
                        item_index=part.item_index,
                        source_ref=ref['source_ref'],
                        mime_type=part.mime_type or 'image/jpeg',
                        data=part.data,
                        label=scrubber.scrub(ref['label']),
                    ))
            flags = list(load.flags or [])
        finally:
            evidence_loader.release(load)

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
