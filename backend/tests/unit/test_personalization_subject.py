"""Who the AI is personalizing FOR, when a parent drives the wizard.

The mobile parent quest view renders the learner's own screen pointed at a
child, task wizard included. Every read on that screen already carries
`?student_id=`; the two AI calls behind the wizard did not, so the model was
handed the SIGNED-IN PARENT's profile:

  * `require_ai_access` checked the parent's AI consent, not the child's --
    directly against what utils/ai_access documents ("the consent being honored
    is the student's, so the check takes the STUDENT's user id"),
  * the vision statement (`users.bio`) that shapes the prompt was the parent's,
  * an explicit challenge level was remembered on the PARENT's row, quietly
    changing what their own quests generate,
  * the Treehouse age band came from the parent's class enrolments.

So `student_id` now rides both calls, through the same gate the delegated reads
use. `get_effective_user_id`'s `acting_as_dependent_id` is NOT that gate: it is
managed-dependents only (DependentRepository.get_dependent), so it refuses a
teenager who keeps their own login and is tied to the parent by an approved
parent_student_link -- which is the exact family that reported this.
"""

from unittest.mock import patch

import pytest

from routes import quest_personalization as qp
from utils.guardian_scope import GuardianAccessError


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'


def test_no_student_id_personalizes_for_the_caller():
    """A learner on their own quest: the overwhelmingly common case."""
    assert qp._personalization_subject(PARENT, {}) == PARENT
    assert qp._personalization_subject(PARENT, {'session_id': 's'}) == PARENT
    assert qp._personalization_subject(PARENT, None) == PARENT


def test_a_verified_child_becomes_the_subject():
    with patch.object(qp, 'resolve_student_scope', return_value=KID) as gate:
        assert qp._personalization_subject(PARENT, {'student_id': KID}) == KID
    gate.assert_called_once_with(PARENT, KID)


def test_the_guardian_gate_is_the_one_the_delegated_reads_use():
    """Not `get_effective_user_id`, which admits managed dependents only."""
    assert qp.resolve_student_scope.__module__ == 'utils.guardian_scope'


def test_a_stranger_is_refused_rather_than_personalized_for():
    with patch.object(qp, 'resolve_student_scope', side_effect=GuardianAccessError('no')):
        with pytest.raises(GuardianAccessError):
            qp._personalization_subject(PARENT, {'student_id': KID})
