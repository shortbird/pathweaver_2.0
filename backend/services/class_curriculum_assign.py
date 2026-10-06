"""
A class's curricula, as the teacher works with them on the class's Quests tab.

iCreate, ticket 1a630837 (2026-10-06), an org admin on the "Independent study"
class: a class like that carries several curricula ("Applied Physics", "U.S.
History 1", ...), each a set of quests, and each student takes some of them.
The class page could only put a curriculum's whole set on the whole class, and
listed the class's quests as one flat run with no sign of which set each came
from. Two things here:

  assign_curriculum   put a curriculum's saved set on the class for chosen
                      students (or everyone), merging with what is already there
  curriculum_by_quest which curriculum heading each class quest sits under

How an audience merges with a quest that is ALREADY on the class (the call is
"make sure these students have every quest in the set", never "take it from
anyone"):

  - existing row is whole class (student_ids NULL)  left exactly as it is
  - existing row kept to some students              the union of its students
                                                    and the ones asked for; a
                                                    request for everyone makes
                                                    it whole class
  - dates (publish_at, due_date) on an existing row are never changed

So nobody loses a quest through this door. Narrowing a quest is still the
quest row's own "Who gets it", which withdraws as far as a student's work
allows.
"""

from typing import Any, Dict, List, Optional

from repositories.class_curriculum_repository import ClassCurriculumRepository
from services.class_quest_enrollment import (
    enroll_class_in_quests,
    enroll_safe,
    set_class_quest_audience,
)
from services.sis_curriculum_sync import assignable_quest_ids


def _normalise(student_ids: Optional[List[str]], roster: List[str]) -> Optional[List[str]]:
    """None for everyone; else the roster students asked for, in roster order.
    A list covering the whole roster is stored as None, as
    set_class_quest_audience does, so the quest keeps reaching students who join."""
    if student_ids is None:
        return None
    wanted = set(student_ids)
    picked = [s for s in roster if s in wanted]
    return None if roster and len(picked) == len(roster) else picked


def assign_curriculum(admin, *, class_row: Dict[str, Any], curriculum_id: str, user_id: str,
                      student_ids: Optional[List[str]], roster: List[str]) -> Dict[str, Any]:
    """Put `curriculum_id`'s saved quests on the class for `student_ids`
    (None = everyone). The caller has checked the class gate, that the
    curriculum is attached to this class, and that student_ids is on the roster.

    Returns {'added', 'widened', 'skipped_already_present',
    'skipped_unavailable', 'students_enrolled', 'student_ids'}.
    """
    repo = ClassCurriculumRepository(admin)
    class_id = class_row['id']
    saved = repo.saved_quests([curriculum_id])
    wanted = assignable_quest_ids(admin, [r['quest_id'] for r in saved],
                                  class_row['organization_id'])
    links = {r['quest_id']: r for r in repo.class_links(class_id)}
    requested = _normalise(student_ids, roster)
    next_order = max([r.get('sequence_order') or 0 for r in links.values()], default=-1) + 1

    new_rows, widened, enrolled = [], 0, 0
    for qid in wanted:
        link = links.get(qid)
        if link is None:
            new_rows.append({'class_id': class_id, 'quest_id': qid, 'added_by': user_id,
                             'sequence_order': next_order, 'student_ids': requested})
            next_order += 1
            continue
        current = link.get('student_ids')
        if current is None:
            continue  # already everyone's
        merged = None if requested is None else sorted(set(current) | set(requested))
        if merged is not None and set(merged) == set(current):
            continue
        result = set_class_quest_audience(admin, class_id, qid, merged, roster_ids=roster)
        if result is not None:
            widened += 1
            enrolled += result.get('enrolled', 0) + result.get('reactivated', 0)

    repo.add_links(new_rows)
    enrolled += enroll_safe(enroll_class_in_quests, admin, class_id,
                            [r['quest_id'] for r in new_rows])['enrolled']
    return {
        'added': len(new_rows),
        'widened': widened,
        'skipped_already_present': len(wanted) - len(new_rows) - widened,
        'skipped_unavailable': len(saved) - len(wanted),
        'students_enrolled': enrolled,
        'student_ids': requested,
    }


def curriculum_by_quest(admin, class_id: str) -> Dict[str, Dict[str, Any]]:
    """{quest_id: {'curriculum_id', 'curriculum_title'}} for the class's
    curricula. A quest saved on several curricula goes under the one attached
    to the class FIRST (sis_curriculum_classes.created_at): one heading per
    quest, and the order does not move when a curriculum is renamed. A quest on
    none of them is absent; the page lists it under "Other quests"."""
    repo = ClassCurriculumRepository(admin)
    curricula = repo.attached_curricula(class_id)
    if not curricula:
        return {}
    rank = {c['id']: i for i, c in enumerate(curricula)}
    titles = {c['id']: c.get('title') for c in curricula}
    out: Dict[str, Dict[str, Any]] = {}
    rows = sorted(repo.saved_quests(list(rank)), key=lambda r: rank[r['curriculum_id']])
    for r in rows:
        qid = r.get('quest_id')
        if qid and qid not in out:
            out[qid] = {'curriculum_id': r['curriculum_id'],
                        'curriculum_title': titles[r['curriculum_id']]}
    return out
