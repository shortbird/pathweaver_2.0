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

from unittest.mock import Mock, patch

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


def _recipients(audiences, advisor_ids=None, exclude=None,
                household_rows=None, guardian_rows=None, parents_per_student=None):
    calls = [MEMBERS]
    if 'parents' in audiences:
        calls += [household_rows or [], guardian_rows or []]
    notifier = Mock()
    notifier.get_parents_for_student.side_effect = \
        lambda sid: (parents_per_student or {}).get(sid, [])
    with patch.object(svc, 'fetch_all_rows', side_effect=calls), \
         patch('services.notification_service.NotificationService', return_value=notifier):
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


def test_household_guardians_join_the_parents_bucket():
    out = _recipients(
        ['parents'],
        household_rows=[{'household_id': 'hh-1', 'user_id': 'stu-1'}],
        guardian_rows=[{'user_id': 'marika', 'relationship': 'guardian'}],
        parents_per_student={'stu-1': [{'id': 'guardian-1'}]},
    )
    assert out['parents'] == {'guardian-1', 'marika'}
