"""Who the AI is personalizing FOR, when a parent drives the wizard.

The parent's quest view renders the learner's own screen pointed at a child,
task wizard included. Every read on that screen carries `student_id`; the two
AI calls behind the wizard once did not, so the model was handed the
SIGNED-IN PARENT's profile:

  * `require_ai_access` checked the parent's AI consent, not the child's --
    directly against what utils/ai_access documents ("the consent being honored
    is the student's, so the check takes the STUDENT's user id"),
  * the vision statement (`users.bio`) that shapes the prompt was the parent's,
  * an explicit challenge level was remembered on the PARENT's row, quietly
    changing what their own quests generate,
  * the Treehouse age band came from the parent's class enrolments.

Both calls now sit behind `@student_scope`, the one gate every student-scoped
route shares (utils.auth.relationships). Two earlier, partial copies of that
decision -- `_personalization_subject` here and
`utils.personalization_helpers.get_effective_user_id`, which admitted managed
dependents only and so refused a teenager tied to the parent by an approved
parent_student_link -- are gone.
"""

from routes import quest_personalization as qp
from utils.auth.relationships import STUDENT_SCOPE_ATTR


def test_the_two_wizard_entry_points_are_student_scoped():
    assert getattr(qp.start_personalization, STUDENT_SCOPE_ATTR, None)
    assert getattr(qp.generate_tasks, STUDENT_SCOPE_ATTR, None)


def test_the_partial_copies_of_the_gate_are_gone():
    """One decision, one owner. A second helper that answers "whose learning
    is this" with a narrower set is how a linked teenager got refused."""
    from utils import personalization_helpers
    assert not hasattr(qp, '_personalization_subject')
    assert not hasattr(personalization_helpers, 'get_effective_user_id')
