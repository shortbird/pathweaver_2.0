"""Courses and Credits: a student's diploma subjects and the courses filling them.

Built for families who teach from their own curriculum (the Hearthwood Academy
families moving into Optio Academy, 2026-09). They do not want to turn a math
workbook into a dozen quest tasks. They want to say "we are doing Saxon Math
this year" and, when a semester is done, show that it was done.

An own-curriculum course is a class quest (quest_type='class') marked in
quests.metadata:

    {"course_format": "own_curriculum", "course_length": "semester" | "year"}

It is created with its check-ins already on it, one per semester, each a
required task worth CHECK_IN_XP of the course's subject. A check-in is an
ordinary task: the parent attaches evidence (photos of finished pages, a test,
a video) and requests credit, and Optio staff review it in the same
/credit-dashboard queue as any other credit request. Approval moves the XP into
user_subject_xp, which is what the diploma tracker and the transcript both
read. So a semester course is 1,000 XP = half a credit and a year is 2,000 XP =
one credit, exactly the standard rate (XP_PER_CREDIT).

Because the credit arrives through per-task review, an own-curriculum course
must never ALSO go through the whole-class review (routes/quest/classes.py):
that path awards a separate half credit and would count the course twice.

No grades: Optio credit prints as an A, and these courses follow that.
"""

from generated.credits import DIPLOMA_CREDIT_REQUIREMENTS, XP_PER_CREDIT
from repositories.courses_and_credits_repository import CoursesAndCreditsRepository
from utils.class_credits import CLASS_CREDIT_VALUE, CLASS_TARGET_XP, COURSE_FORMAT_OWN, is_own_curriculum
from utils.school_subjects import (
    SCHOOL_SUBJECT_DESCRIPTIONS,
    SCHOOL_SUBJECTS,
    get_display_name,
    pillar_for_subject,
)
from utils.logger import get_logger

logger = get_logger(__name__)

# One semester of work is half a credit.
CHECK_IN_XP = XP_PER_CREDIT // 2

# Keyed by course_length. Order is the order the form offers them.
COURSE_LENGTHS = {
    'semester': {
        'label': 'One semester',
        'check_in_titles': ['Semester check-in'],
    },
    'year': {
        'label': 'Full year',
        'check_in_titles': ['First semester check-in', 'Second semester check-in'],
    },
}

CHECK_IN_DESCRIPTION = (
    'Show the work from this semester. Photos of finished pages, a test or '
    'quiz, a project, or a short video of your student explaining something '
    'they learned all work. Add a sentence about what they covered.'
)

MAX_TITLE_LENGTH = 120
MAX_NOTE_LENGTH = 1000


class CourseError(ValueError):
    """A request the plan refuses. `code` is the API error code."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def course_credits(length):
    """Credits a finished course of this length is worth."""
    spec = COURSE_LENGTHS.get(length)
    if not spec:
        return 0
    return len(spec['check_in_titles']) * CHECK_IN_XP / XP_PER_CREDIT


def check_in_state(completion):
    """Where one check-in stands, in the words the page uses.

    open       nothing sent yet
    not_sent   work saved and marked done, but credit never requested (a
               request that failed, or a check-in finished from the quest page)
    in_review  waiting on Optio
    needs_more the reviewer asked for more
    approved   credit awarded
    """
    if not completion:
        return 'open'
    status = completion.get('diploma_status') or 'none'
    if status in ('pending_review', 'pending_org_approval'):
        return 'in_review'
    if status == 'grow_this':
        return 'needs_more'
    if status in ('finalized', 'merged', 'approved'):
        return 'approved'
    return 'not_sent'


def course_lengths_payload():
    return [
        {
            'key': key,
            'label': spec['label'],
            'check_ins': len(spec['check_in_titles']),
            'credits': course_credits(key),
            'xp': len(spec['check_in_titles']) * CHECK_IN_XP,
        }
        for key, spec in COURSE_LENGTHS.items()
    ]


# --------------------------------------------------------------------------
# Create
# --------------------------------------------------------------------------

def _find_image(title, context, subject):
    """A header picture, chosen the way every quest's is (the quest create
    route does the same). None when there is none; the quest page then shows
    the Optio brand banner. Never fails the create."""
    try:
        from services.image_service import search_quest_image
        return search_quest_image(title, context, pillar=pillar_for_subject(subject))
    except Exception as e:  # noqa: BLE001 -- a picture is decoration
        logger.warning(f'No header image for own-curriculum course "{title}": {e}')
        return None


def create_course(supabase, student_id, *, title, subject, length,
                  curriculum=None, enrolled_by=None):
    """Create an own-curriculum course for the student, with its check-ins.

    Returns the new quest id. The quest belongs to the student (created_by)
    exactly as a class the student made would; a parent acting for them is
    recorded on the enrollment as enrolled_by_user_id.
    """
    title = (title or '').strip()
    curriculum = (curriculum or '').strip() or None
    if not title:
        raise CourseError('TITLE_REQUIRED', 'Give the course a name.')
    if len(title) > MAX_TITLE_LENGTH:
        raise CourseError('TITLE_TOO_LONG', f'Keep the name under {MAX_TITLE_LENGTH} characters.')
    if subject not in SCHOOL_SUBJECTS:
        raise CourseError('INVALID_SUBJECT', 'Pick a subject for this course.')
    if length not in COURSE_LENGTHS:
        raise CourseError('INVALID_LENGTH', 'Pick one semester or a full year.')
    if curriculum and len(curriculum) > MAX_NOTE_LENGTH:
        raise CourseError('NOTE_TOO_LONG', f'Keep the description under {MAX_NOTE_LENGTH} characters.')

    from utils.timestamps import now_iso

    repo = CoursesAndCreditsRepository(client=supabase)
    description = curriculum or f'{get_display_name(subject)} course using our own curriculum.'
    image_url = _find_image(title, curriculum or get_display_name(subject), subject)
    quest_id = repo.insert_quest({
        'title': title,
        'big_idea': description,
        'description': description,
        'is_v3': True,
        'is_active': True,
        'is_public': False,
        'quest_type': 'class',
        'transcript_subject': subject,
        'allow_custom_tasks': True,
        'metadata': {'course_format': COURSE_FORMAT_OWN, 'course_length': length},
        'header_image_url': image_url,
        'image_url': image_url,
        'created_by': student_id,
        'created_at': now_iso(),
    })

    from repositories.quest_repository import QuestRepository
    enrollment = QuestRepository(client=supabase).enroll_user(
        student_id, quest_id, enrolled_by_user_id=enrolled_by)
    user_quest_id = enrollment['id']

    repo.mark_personalized(user_quest_id)

    pillar = pillar_for_subject(subject)
    repo.insert_tasks([
        {
            'user_id': student_id,
            'quest_id': quest_id,
            'user_quest_id': user_quest_id,
            'title': check_in_title,
            'description': CHECK_IN_DESCRIPTION,
            'pillar': pillar,
            # Explicit on purpose: the column defaults to ['Electives'], which
            # would quietly credit a math workbook as an elective.
            'diploma_subjects': {subject: CHECK_IN_XP},
            'subject_xp_distribution': {subject: CHECK_IN_XP},
            'xp_value': CHECK_IN_XP,
            'order_index': index,
            'is_required': True,
            'is_manual': False,
            'approval_status': 'approved',
            'created_by_user_id': enrolled_by or student_id,
        }
        for index, check_in_title in enumerate(COURSE_LENGTHS[length]['check_in_titles'])
    ])

    logger.info(f'Own-curriculum course {quest_id[:8]} ({subject}, {length}) created for {student_id[:8]}')
    return quest_id


# --------------------------------------------------------------------------
# Read
# --------------------------------------------------------------------------

def _own_course(quest, tasks, completions_by_task, feedback_by_completion):
    """An own-curriculum course: its check-ins, and the tasks the family added.

    The check-ins are the course's required tasks (create_course makes them
    is_required). Anything else on the quest is a task the family chose to add,
    the way they would on any quest: optional, and each one can be sent for
    credit on its own from the quest page. The course's own credit is the
    check-ins'; added tasks earn more credit in the same subject.
    """
    length = (quest.get('metadata') or {}).get('course_length')
    ordered = sorted(tasks, key=lambda t: t.get('order_index') or 0)
    added = [t for t in ordered if not t.get('is_required')]
    check_ins = []
    for t in ordered:
        if not t.get('is_required'):
            continue
        completion = completions_by_task.get(t['id'])
        state = check_in_state(completion)
        check_ins.append({
            'task_id': t['id'],
            'title': t.get('title'),
            'xp': t.get('xp_value') or 0,
            'state': state,
            'feedback': feedback_by_completion.get(completion['id']) if completion and state == 'needs_more' else None,
        })
    approved = sum(1 for c in check_ins if c['state'] == 'approved')
    if check_ins and approved == len(check_ins):
        status = 'complete'
    elif any(c['state'] == 'needs_more' for c in check_ins):
        status = 'needs_more'
    elif any(c['state'] == 'in_review' for c in check_ins):
        status = 'in_review'
    else:
        status = 'in_progress'
    return {
        'kind': 'own',
        'quest_id': quest['id'],
        'title': quest.get('title'),
        'curriculum': quest.get('description'),
        'length': length,
        'length_label': (COURSE_LENGTHS.get(length) or {}).get('label'),
        'credits': sum(c['xp'] for c in check_ins) / XP_PER_CREDIT,
        'status': status,
        'check_ins': check_ins,
        'added_tasks': len(added),
        'added_tasks_approved': sum(
            1 for t in added if check_in_state(completions_by_task.get(t['id'])) == 'approved'),
    }


# Where a subject's credit came from, in the order the page lists them.
SOURCES = ('own_curriculum', 'optio_classes', 'quests', 'transfer', 'other')


def _credit_by_source(repo, student_id):
    """Approved task XP per subject, split by the kind of quest it came from,
    and the same XP for ordinary quests grouped by quest.

    Returns (by_subject, quest_credit):
      by_subject   {subject: {'own_curriculum': xp, 'optio_classes': xp, 'quests': xp}}
      quest_credit {quest_id: {'quest': row, 'subjects': {subject: xp},
                               'tasks': {task_id: {subject: xp}}}}
    Only approved (finalized) completions are read, so a quest appears in
    quest_credit once Optio has approved one of its tasks and not before.
    The split a reviewer approved is used where there is one, because it is
    what was deposited into user_subject_xp; otherwise the task's own split.
    A completion with neither is left out, and build_plan shows what it could
    not place as 'other' rather than guess.
    """
    completions = repo.credited_completions(student_id)
    if not completions:
        return {}, {}
    approved = repo.approved_subjects([c['id'] for c in completions])
    missing = [c['user_quest_task_id'] for c in completions
               if c['id'] not in approved and c.get('user_quest_task_id')]
    task_splits = repo.task_subject_splits(missing) if missing else {}
    kinds = repo.quest_kinds(list({c['quest_id'] for c in completions if c.get('quest_id')}))

    by_subject: dict = {}
    quest_credit: dict = {}
    for c in completions:
        split = approved.get(c['id']) or task_splits.get(c.get('user_quest_task_id')) or {}
        quest = kinds.get(c.get('quest_id')) or {}
        if is_own_curriculum(quest):
            source = 'own_curriculum'
        elif quest.get('quest_type') == 'class':
            source = 'optio_classes'
        else:
            source = 'quests'
        for subject, xp in split.items():
            try:
                amount = int(xp)
            except (TypeError, ValueError):
                continue
            bucket = by_subject.setdefault(subject, {})
            bucket[source] = bucket.get(source, 0) + amount
            if source == 'quests' and amount > 0 and c.get('quest_id'):
                entry = quest_credit.setdefault(
                    c['quest_id'], {'quest': quest, 'subjects': {}, 'tasks': {}})
                entry['subjects'][subject] = entry['subjects'].get(subject, 0) + amount
                task = entry['tasks'].setdefault(c.get('user_quest_task_id'), {})
                task[subject] = task.get(subject, 0) + amount
    return by_subject, quest_credit


def _quests_by_subject(repo, quest_credit):
    """The quests that earned approved credit in each subject, most first.

    One quest can land in several subjects -- the interdisciplinary point of a
    quest -- so each entry names the other subjects the same quest counted
    toward, and lists only the tasks that earned credit in THIS subject.
    Courses are listed separately, so own-curriculum courses and Optio
    classes never appear here.
    """
    if not quest_credit:
        return {}
    task_ids = [tid for e in quest_credit.values() for tid in e['tasks'] if tid]
    titles = repo.task_titles(task_ids) if task_ids else {}

    by_subject: dict = {}
    for quest_id, entry in quest_credit.items():
        for subject, xp in entry['subjects'].items():
            tasks = [
                {'id': tid, 'title': titles.get(tid) or 'Task', 'xp': split[subject]}
                for tid, split in entry['tasks'].items()
                if split.get(subject, 0) > 0
            ]
            tasks.sort(key=lambda t: -t['xp'])
            also = [
                {'key': other, 'name': get_display_name(other), 'xp': other_xp}
                for other, other_xp in sorted(entry['subjects'].items(), key=lambda kv: -kv[1])
                if other != subject
            ]
            by_subject.setdefault(subject, []).append({
                'quest_id': quest_id,
                'title': (entry['quest'] or {}).get('title') or 'Quest',
                'xp': xp,
                'also_counted_toward': also,
                'tasks': tasks,
            })
    for rows in by_subject.values():
        rows.sort(key=lambda q: -q['xp'])
    return by_subject


def _optio_class(quest, approved_xp):
    """A class built from Optio tasks. `approved_xp` is its progress toward
    the class target, which the caller supplies (see build_plan)."""
    target = CLASS_TARGET_XP
    review_status = quest.get('class_review_status')
    status = {
        'credit_awarded': 'complete',
        'submitted_for_review': 'in_review',
        'rejected': 'needs_more',
    }.get(review_status, 'in_progress')
    return {
        'kind': 'class',
        'quest_id': quest['id'],
        'title': quest.get('title'),
        'credits': CLASS_CREDIT_VALUE,
        'status': status,
        'progress_xp': target if status == 'complete' else min(approved_xp, target),
        'target_xp': target,
    }


def build_plan(supabase, student_id, class_progress):
    """Everything the Courses and Credits page shows, for one student.

    `class_progress(quest_id, subject) -> int` is the XP an Optio class has
    toward its target. It is passed in rather than imported because it lives
    with the class routes (routes/quest/classes.py), and a service reaching up
    into routes is the layering the import ratchet forbids.
    """
    repo = CoursesAndCreditsRepository(client=supabase)

    subject_rows = repo.subject_xp(student_id)
    earned_xp = {r['school_subject']: r.get('xp_amount') or 0 for r in subject_rows}
    pending_xp = {r['school_subject']: r.get('pending_xp') or 0 for r in subject_rows}

    class_credit_by_subject: dict = {}
    for cc in repo.awarded_class_credits(student_id):
        s = cc['school_subject']
        class_credit_by_subject[s] = class_credit_by_subject.get(s, 0) + cc['credits']

    own_quests, class_quests = [], []
    for q in repo.class_enrollments(student_id):
        (own_quests if is_own_curriculum(q) else class_quests).append(q)

    tasks = repo.course_tasks(student_id, [q['id'] for q in own_quests])
    tasks_by_quest: dict = {}
    for t in tasks:
        tasks_by_quest.setdefault(t['quest_id'], []).append(t)
    completions = repo.completions_for_tasks(student_id, [t['id'] for t in tasks])
    completions_by_task = {c['user_quest_task_id']: c for c in completions}
    feedback = repo.latest_feedback(
        [c['id'] for c in completions if c.get('diploma_status') == 'grow_this'])

    courses_by_subject: dict = {}
    for q in own_quests:
        courses_by_subject.setdefault(q['transcript_subject'], []).append(
            _own_course(q, tasks_by_quest.get(q['id'], []), completions_by_task, feedback))
    for q in class_quests:
        approved = 0 if q.get('class_review_status') == 'credit_awarded' else class_progress(
            q['id'], q['transcript_subject'])
        courses_by_subject.setdefault(q['transcript_subject'], []).append(_optio_class(q, approved))

    transfer_xp: dict = {}
    for tc in repo.transfer_credits(student_id):
        for subject, xp in (tc.get('subject_xp') or {}).items():
            transfer_xp[subject] = transfer_xp.get(subject, 0) + int(xp or 0)
        for subject, lines in (tc.get('course_names') or {}).items():
            for line in lines or []:
                courses_by_subject.setdefault(subject, []).append({
                    'kind': 'transfer',
                    'title': line.get('name'),
                    'credits': float(line.get('credits') or 0),
                    'school_name': tc.get('school_name'),
                    'status': 'complete',
                })

    # XP, not credits: the client turns these into credits with the shared
    # arithmetic (@shared/credits getCreditStanding), which owns the rule that
    # surplus overflows into Electives. A second copy of that rule here is how
    # two screens end up disagreeing about the same student. An awarded class
    # is half a credit that is not in user_subject_xp, so it is added as the
    # XP it stands for.
    #
    # `sources` splits the same earned XP by where it came from, so a family
    # sees their own curriculum, Optio classes and quests side by side. The
    # parts always add up to earned_xp: whatever the ledger holds that no
    # approved task or transfer accounts for (older deposits, such as POE
    # attendance credit) is shown as 'other' rather than dropped.
    task_sources, quest_credit = _credit_by_source(repo, student_id)
    quests_by_subject = _quests_by_subject(repo, quest_credit)
    subjects = []
    for key in DIPLOMA_CREDIT_REQUIREMENTS:
        ledger_xp = int(earned_xp.get(key, 0))
        awarded_class_xp = int(class_credit_by_subject.get(key, 0) * XP_PER_CREDIT)
        from_tasks = task_sources.get(key, {})
        sources = {
            'own_curriculum': from_tasks.get('own_curriculum', 0),
            'optio_classes': from_tasks.get('optio_classes', 0) + awarded_class_xp,
            'quests': from_tasks.get('quests', 0),
            'transfer': transfer_xp.get(key, 0),
        }
        placed = sources['own_curriculum'] + from_tasks.get('optio_classes', 0) + sources['quests'] + sources['transfer']
        sources['other'] = max(0, ledger_xp - placed)
        subjects.append({
            'key': key,
            'name': get_display_name(key),
            'description': SCHOOL_SUBJECT_DESCRIPTIONS.get(key),
            'earned_xp': ledger_xp + awarded_class_xp,
            'pending_xp': int(pending_xp.get(key, 0)),
            'sources': {k: int(sources[k]) for k in SOURCES},
            'courses': courses_by_subject.get(key, []),
            'quests': quests_by_subject.get(key, []),
        })

    return {
        'course_lengths': course_lengths_payload(),
        'subjects': subjects,
    }
