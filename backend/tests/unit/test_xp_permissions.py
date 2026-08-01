"""Unit tests for the org-level XP editing lock (utils/xp_permissions).

Covers the policy decisions themselves; route wiring is exercised by the
existing task/personalization integration tests.
"""

from unittest.mock import patch

import pytest

from utils.xp_permissions import (
    DEFAULT_TASK_XP,
    MAX_LEARNER_TASK_XP,
    XP_LOCKED_MESSAGE,
    can_set_task_xp,
    is_xp_guide,
    resolve_learner_task_xp,
)


def test_locked_message_says_teacher_not_guide():
    """This string reaches students verbatim; the product word is "teacher"."""
    assert 'teacher' in XP_LOCKED_MESSAGE
    assert 'guide' not in XP_LOCKED_MESSAGE.lower()


class TestIsXpGuide:
    @pytest.mark.parametrize('role', ['superadmin', 'org_admin', 'advisor'])
    def test_guide_roles(self, role):
        assert is_xp_guide(role) is True

    @pytest.mark.parametrize('role', ['student', 'parent', 'observer', 'org_managed', None, ''])
    def test_non_guide_roles(self, role):
        assert is_xp_guide(role) is False


class TestIsXpGuideUser:
    """Role checks must consider EVERY role a user holds, not just the primary."""

    def test_platform_advisor(self):
        from utils.xp_permissions import is_xp_guide_user
        assert is_xp_guide_user({'role': 'advisor'}) is True

    def test_org_advisor_via_legacy_org_role(self):
        from utils.xp_permissions import is_xp_guide_user
        assert is_xp_guide_user({'role': 'org_managed', 'org_role': 'advisor'}) is True

    def test_teacher_who_is_also_a_parent(self):
        """org_roles=['parent','advisor'] resolves to 'parent' as PRIMARY role."""
        from utils.xp_permissions import is_xp_guide_user
        user = {'role': 'org_managed', 'org_role': 'parent', 'org_roles': ['parent', 'advisor']}
        assert is_xp_guide_user(user) is True

    def test_parent_who_only_parents(self):
        from utils.xp_permissions import is_xp_guide_user
        user = {'role': 'org_managed', 'org_role': 'parent', 'org_roles': ['parent']}
        assert is_xp_guide_user(user) is False

    def test_org_student(self):
        from utils.xp_permissions import is_xp_guide_user
        assert is_xp_guide_user({'role': 'org_managed', 'org_roles': ['student']}) is False

    def test_superadmin(self):
        from utils.xp_permissions import is_xp_guide_user
        assert is_xp_guide_user({'role': 'superadmin'}) is True

    def test_missing_user(self):
        from utils.xp_permissions import is_xp_guide_user
        assert is_xp_guide_user(None) is False


class TestCanSetTaskXp:
    def test_guide_allowed_even_when_locked(self):
        with patch('utils.xp_permissions.xp_locked_for_learner', return_value=True) as locked:
            assert can_set_task_xp('advisor', 'student-1') is True
            # Guides short-circuit: no need to resolve the org at all.
            locked.assert_not_called()

    def test_student_allowed_when_org_not_locked(self):
        with patch('utils.xp_permissions.xp_locked_for_learner', return_value=False):
            assert can_set_task_xp('student', 'student-1') is True

    def test_student_denied_when_org_locked(self):
        with patch('utils.xp_permissions.xp_locked_for_learner', return_value=True):
            assert can_set_task_xp('student', 'student-1') is False

    def test_parent_denied_when_child_org_locked(self):
        with patch('utils.xp_permissions.xp_locked_for_learner', return_value=True):
            assert can_set_task_xp('parent', 'child-1') is False


class TestResolveLearnerTaskXp:
    def test_guide_value_passes_through_uncapped(self):
        xp, overridden = resolve_learner_task_xp(750, caller_role='org_admin')
        assert (xp, overridden) == (750, False)

    def test_unlocked_student_keeps_their_value(self):
        xp, overridden = resolve_learner_task_xp(75, caller_role='student', locked=False)
        assert (xp, overridden) == (75, False)

    def test_unlocked_student_is_still_capped(self):
        """The 200 XP ceiling applies with or without the flag."""
        xp, overridden = resolve_learner_task_xp(99999, caller_role='student', locked=False)
        assert (xp, overridden) == (MAX_LEARNER_TASK_XP, True)

    def test_locked_student_falls_back_to_default(self):
        xp, overridden = resolve_learner_task_xp(200, caller_role='student', locked=True)
        assert (xp, overridden) == (DEFAULT_TASK_XP, True)

    def test_locked_student_gets_server_generated_value(self):
        """The AI's own suggestion is trusted; the client's is not."""
        xp, overridden = resolve_learner_task_xp(
            200, caller_role='student', locked=True, server_xp=150
        )
        assert (xp, overridden) == (150, True)

    def test_locked_no_override_reported_when_values_agree(self):
        xp, overridden = resolve_learner_task_xp(
            150, caller_role='student', locked=True, server_xp=150
        )
        assert (xp, overridden) == (150, False)

    def test_server_xp_is_also_capped(self):
        xp, _ = resolve_learner_task_xp(
            100, caller_role='student', locked=True, server_xp=5000
        )
        assert xp == MAX_LEARNER_TASK_XP

    @pytest.mark.parametrize('bad', [None, 'lots', {}, float('nan')])
    def test_non_numeric_requests_fall_back_to_default(self, bad):
        xp, _ = resolve_learner_task_xp(bad, caller_role='student', locked=False)
        assert xp == DEFAULT_TASK_XP

    def test_negative_request_is_floored(self):
        xp, overridden = resolve_learner_task_xp(-50, caller_role='student', locked=False)
        assert (xp, overridden) == (1, True)

    def test_locked_lookup_uses_learner_org_when_not_precomputed(self):
        with patch('utils.xp_permissions.xp_locked_for_learner', return_value=True) as locked:
            xp, _ = resolve_learner_task_xp(200, caller_role='student', learner_id='child-1')
        locked.assert_called_once_with('child-1')
        assert xp == DEFAULT_TASK_XP


class TestXpLockedForLearner:
    """The org resolution itself: platform users are never locked."""

    def test_no_user_id_is_not_locked(self):
        from utils.xp_permissions import xp_locked_for_learner
        assert xp_locked_for_learner(None) is False

    def test_platform_user_without_org_is_not_locked(self):
        from utils.xp_permissions import xp_locked_for_learner

        class _Result:
            data = {'organization_id': None}

        with patch('utils.xp_permissions.get_supabase_admin_client') as client, \
                patch('utils.xp_permissions.org_has_feature') as has_feature:
            chain = client.return_value.table.return_value.select.return_value.eq.return_value
            chain.maybe_single.return_value.execute.return_value = _Result()

            assert xp_locked_for_learner('platform-student') is False
            has_feature.assert_not_called()

    def test_org_user_defers_to_the_flag(self):
        from utils.xp_permissions import XP_LOCK_FLAG, xp_locked_for_learner

        class _Result:
            data = {'organization_id': 'org-1'}

        with patch('utils.xp_permissions.get_supabase_admin_client') as client, \
                patch('utils.xp_permissions.org_has_feature', return_value=True) as has_feature:
            chain = client.return_value.table.return_value.select.return_value.eq.return_value
            chain.maybe_single.return_value.execute.return_value = _Result()

            assert xp_locked_for_learner('org-student') is True
            has_feature.assert_called_once_with('org-1', XP_LOCK_FLAG)

    def test_db_error_fails_open(self):
        """A student must not lose the ability to edit their own work on a blip."""
        from utils.xp_permissions import xp_locked_for_learner

        with patch('utils.xp_permissions.get_supabase_admin_client', side_effect=Exception('boom')):
            assert xp_locked_for_learner('org-student') is False
