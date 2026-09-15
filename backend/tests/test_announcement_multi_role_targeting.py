"""
Announcement audience resolution for people who hold several roles, and for
guardians the platform links only through households.

iCreate, 2026-08-28: "I selected 6 teachers to send it to and it says 'goes to
5 people.' I think it's because one of the 6 is Katrine, who isn't a teacher."
Katrine is org_roles=['campus_coordinator','parent'] — the picker offered her,
the resolver dropped her. And 2026-08-26: "Marika didn't get it (seems like she
should have as a parent?)" — Marika's only link to the student is a
household_members row, which the per-student parent resolver did not know.
"""

from unittest.mock import patch

from services import announcement_service as svc


MEMBERS = [
    {'id': 'adv-1', 'role': 'org_managed', 'org_role': 'advisor', 'org_roles': ['advisor']},
    # Advisor role held but NOT primary — must still count as a teacher.
    {'id': 'adv-2', 'role': 'org_managed', 'org_role': 'parent', 'org_roles': ['parent', 'advisor']},
    # Katrine's shape: no advisor role at all, explicitly selectable.
    {'id': 'coord-1', 'role': 'org_managed', 'org_role': 'campus_coordinator',
     'org_roles': ['campus_coordinator', 'parent']},
    {'id': 'stu-1', 'role': 'org_managed', 'org_role': 'student', 'org_roles': ['student']},
]


def _recipients(audiences, advisor_ids=None, exclude=None, guardians_of=None):
    """guardians_of: {student_id: {guardian_id}} as utils.class_membership
    .guardians_by_student would answer -- the one definition of parent."""
    def parents_of_students(student_ids):
        out = set()
        for sid in student_ids:
            out |= set((guardians_of or {}).get(sid, ()))
        return out
    with patch.object(svc, 'fetch_all_rows', return_value=MEMBERS), \
         patch('utils.class_membership.parents_of_students', side_effect=parents_of_students):
        return svc.recipients_by_role('org-1', audiences,
                                      exclude_user_id=exclude,
                                      advisor_ids=advisor_ids)


def test_advisor_anywhere_in_org_roles_counts_as_a_teacher():
    out = _recipients(['advisors'])
    assert out['advisors'] == {'adv-1', 'adv-2'}


def test_explicitly_selected_staff_are_included_regardless_of_role():
    out = _recipients(['advisors'], advisor_ids={'adv-1', 'coord-1'})
    assert out['advisors'] == {'adv-1', 'coord-1'}


def test_author_kept_when_picked_by_name_dropped_otherwise():
    picked = _recipients(['advisors'], advisor_ids={'adv-1', 'adv-2'}, exclude='adv-1')
    assert 'adv-1' in picked['advisors']
    broad = _recipients(['advisors'], exclude='adv-1')
    assert 'adv-1' not in broad['advisors']


def test_parents_come_from_the_one_definition_of_parent():
    """Every guardian the shared resolver names -- including a household-only
    second guardian (Marika, 2026-08-26) -- lands in the parents bucket. This
    file no longer patches household rows by hand: the household link is the
    resolver's job, and test_one_definition_of_parent keeps it there."""
    out = _recipients(['parents'], guardians_of={'stu-1': {'guardian-1', 'marika'}})
    assert out['parents'] == {'guardian-1', 'marika'}
