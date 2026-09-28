"""Credit a reviewer awarded to a whole class quest, and which classes get it.

A credit class (quest_type='class') that passes the admin class review is worth
a fixed half credit with an A. That credit is NOT in user_subject_xp -- class
approval never deposits subject XP -- so anything that totals a student's
credit has to add these on top of subject XP, or the class vanishes from the
count. The transcript did; the diploma tracker did not.

Two exclusions, both about not counting the same work twice
(CoursesAndCreditsRepository.awarded_class_credits applies them):

  - A POE class awarded through the POE endpoint deposits its subject XP
    (routes/admin/poe.py), so it is already inside user_subject_xp.
  - An own-curriculum course (services/courses_and_credits_service.py) earns
    its credit through per-check-in credit review, which also lands in
    user_subject_xp. It never goes through class review, but a stray
    'credit_awarded' on one must still not add a second half credit.
"""

CLASS_CREDIT_VALUE = 0.5

# The XP an Optio class collects before it can be sent for class review.
CLASS_TARGET_XP = 1000

# quests.metadata.course_format for a course a family teaches from its own
# materials. See services/courses_and_credits_service.py.
COURSE_FORMAT_OWN = 'own_curriculum'


def is_own_curriculum(quest):
    """True for a quest row created as an own-curriculum course."""
    return ((quest or {}).get('metadata') or {}).get('course_format') == COURSE_FORMAT_OWN
