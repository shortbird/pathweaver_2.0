"""Guard: a route that names a person in its URL must say what the caller is to them.

`/api/advisor/students/<student_id>/checkins` carries an authorization question
in its path. 187 routes in 56 modules carry one, and every one answers it by
hand -- inline in the view, one hop into a service, or inside a module-private
`_authorize` helper. The 2026-08-31 audit sampled a dozen of them and found
every sample correct, and a re-census on 2026-09-03 (route level plus one hop
into services/, utils/, repositories/) found no route missing a gate entirely.

So this test does not exist because the checks are wrong. It exists because
nothing fails when the 188th route forgets one, and that failure is invisible:
the route works perfectly for the caller who owns the record and leaks for the
caller who does not. No test, no type, and no review checklist catches it --
the same shape of gap as `test_no_duplicate_routes` and
`test_require_role_names_are_real`.

A route passes if any ONE of these holds:

  1. It declares its policy with `@require_relationship_to(param, allow=...)`.
     This is the target state; SEC-10 step (c) migrates modules into it.
  2. Its decorator chain is superadmin-only (`_superadmin_only`, set by
     require_admin / require_superadmin / require_admin_identity). A global
     platform role has no "other org" to leak to. This tier is VERIFIED, not
     trusted: loosen the route to a narrower decorator and the marker goes with
     it, and the route lands back here demanding a declaration.
  3. It is in REVIEWED_2026_09_03 below, which records where its check actually
     lives.

Anything else is new and unreviewed, and fails.

WHAT THE REVIEW BEHIND THE ALLOWLIST WAS, EXACTLY: for each module, the gate
mechanism its id-bearing handlers use was read and named. It was NOT a
line-by-line proof that each of the 166 enforces the right relationship for its
particular payload. Do not read an entry here as a certificate of correctness;
read it as "a gate is present, and this is which one". Migrating an entry to
`@require_relationship_to` is what turns it into an enforced claim, and is the
point of the exercise.
"""

import inspect
import re

import pytest

from utils.auth.relationships import ENFORCED_ATTR

#: Path parameters that name a person. `<user_id>` on a non-person resource
#: (e.g. an org) does not appear here because no such rule exists today; add
#: the name rather than special-casing a route if one ever does.
ID_PARAMS = frozenset({
    'user_id', 'student_id', 'target_user_id', 'child_id', 'dependent_id',
})

#: endpoint -> where that route's relationship check actually lives.
#: Shrinks as SEC-10 step (c) migrates modules to @require_relationship_to.
#: Never add an entry without reading the handler; "it was already failing" is
#: not a reason, it is the test working.
REVIEWED_2026_09_03 = {}


def _reviewed(reason, *endpoints):
    for ep in endpoints:
        REVIEWED_2026_09_03[ep] = reason


# --- parent -> child: one shared helper, and it distinguishes read from write -
_reviewed(
    'verify_parent_access(supabase, caller, student) in routes/parent/_shared; '
    'the write and private-message paths pass allow_observer=False (IDOR-H4/H5)',
    'parent_analytics_insights.get_encouragement_tips',
    'parent_analytics_insights.get_learning_insights',
    'parent_analytics_insights.get_student_communications',
    'parent_analytics_insights.get_student_progress',
    'parent_child_overview.get_child_overview',
    'parent_child_overview.upload_child_avatar',
    'parent_child_profile.update_child_name',
    'parent_communications.get_all_student_conversations',
    'parent_communications.get_student_dm_conversations',
    'parent_communications.get_student_dm_messages',
    'parent_communications.get_student_group_conversations',
    'parent_communications.get_student_group_messages',
    'parent_communications.get_student_tutor_conversations',
    'parent_communications.get_student_tutor_messages',
    'parent_dashboard_overview.get_parent_dashboard',
    'parent_evidence_view.get_recent_completions',
    'parent_evidence_view.get_task_details',
    'parent_student_engagement.get_student_engagement',
)
_reviewed(
    'verify_parent_access(..., child_id) in routes/parent/_shared; write paths '
    'pass allow_observer=False, read paths admit linked observers',
    'parent_learning_moments.assign_child_moment_to_topic',
    'parent_learning_moments.create_child_learning_moment',
    'parent_learning_moments.create_child_topic',
    'parent_learning_moments.delete_child_learning_moment',
    'parent_learning_moments.finalize_moment_block_signed_upload',
    'parent_learning_moments.finalize_moment_signed_upload',
    'parent_learning_moments.get_child_learning_moments',
    'parent_learning_moments.get_child_topic_detail',
    'parent_learning_moments.get_child_topic_suggestions',
    'parent_learning_moments.get_child_topics',
    'parent_learning_moments.init_moment_block_signed_upload',
    'parent_learning_moments.init_moment_signed_upload',
    'parent_learning_moments.save_child_moment_evidence',
    'parent_learning_moments.update_child_learning_moment',
    'parent_learning_moments.upload_child_moment_file',
    'parent_learning_moments.upload_moment_media',
)
_reviewed(
    'parent ownership of the dependent is checked in the view against '
    'users.managed_by_parent_id before any read or write',
    'dependents.add_dependent_login',
    'dependents.delete_dependent',
    'dependents.export_dependent_progress_report',
    'dependents.generate_acting_as_token',
    'dependents.get_dependent',
    'dependents.get_dependent_progress_report',
    'dependents.promote_dependent',
    'dependents.resend_student_invite',
    'dependents.toggle_child_ai_access',
    'dependents.update_child_ai_features',
    'dependents.update_dependent',
    'dependents.upload_dependent_avatar',
)

# --- advisor -> assigned student --------------------------------------------
_reviewed(
    'verify_advisor_access(supabase, caller, student) -- active row in '
    'advisor_student_assignments, or admin',
    'advisor_learning_moments.create_student_learning_moment',
    'advisor_learning_moments.delete_student_learning_moment',
    'advisor_learning_moments.finalize_moment_signed_upload',
    'advisor_learning_moments.get_student_learning_moments',
    'advisor_learning_moments.init_moment_signed_upload',
    'advisor_learning_moments.update_student_learning_moment',
    'advisor_learning_moments.upload_moment_media',
    'advisor_student_overview.get_student_overview',
    'helper_evidence.get_student_tasks_for_evidence',
)
_reviewed(
    'repository.verify_advisor_student_relationship(caller, student), or the '
    'advisor-scoped query itself returns nothing for an unassigned student',
    'advisor_checkins.advisor_end_student_quest',
    'advisor_checkins.get_checkin_data',
    'advisor_checkins.get_student_checkins',
    'advisor.assign_student',
    'advisor.get_student_progress',
    'advisor.get_student_quests_with_tasks',
)

# --- observer -> linked student ---------------------------------------------
_reviewed(
    'observer_student_links row for (caller, student) is required in the view',
    'observer.get_student_activity_feed',
    'observer.get_student_comments',
    'observer.get_student_learning_moments_for_observer',
    'observer.get_student_portfolio_for_observer',
)
_reviewed(
    'the caller must be the student\'s parent to see or remove their observers',
    'observer.get_observers_for_student',
    'observer.get_parent_observer_invitations',
    'observer.remove_observer_for_student',
)

# --- org staff -> student in the same org -----------------------------------
_reviewed(
    'caller_can_access_user(admin, caller, target) from utils.auth.org_scope',
    'admin_transcript_generator.add_planned_credit',
    'admin_transcript_generator.check_transcript_exists',
    'admin_transcript_generator.delete_planned_credit',
    'admin_transcript_generator.get_overrides',
    'admin_transcript_generator.get_planned_credits',
    'admin_transcript_generator.get_transcript_data',
    'admin_transcript_generator.get_transfer_history',
    'admin_transcript_generator.save_overrides',
    'admin_transcript_generator.send_transcript_to_school',
    'admin_transcript_generator.update_planned_credit',
    'admin_transfer_credits.delete_all_transfer_credits',
    'admin_transfer_credits.delete_single_transfer_credit',
    'admin_transfer_credits.get_transfer_credits',
    'admin_transfer_credits.save_transfer_credits',
    'admin_transfer_credits.upload_transcript',
    'credit_dashboard.get_student_context',
    'admin_user_management.get_user_quest_enrollments',
    'admin_user_management.update_org_user_role',
    'admin_user_management.update_user_profile',
)
_reviewed(
    '_can_manage_student_tasks(supabase, caller, target) -- advisor assignment '
    'or same-org admin',
    'admin_student_task_management.delete_student_task',
    'admin_student_task_management.get_student_quest_tasks',
    'admin_student_task_management.reorder_student_tasks',
    'admin_student_task_management.update_student_task',
)
_reviewed(
    'org_admin gate plus an explicit "student is in this organization" check '
    'in the view',
    'org_connections.get_student_advisors',
    'org_connections.unassign_advisor_from_student',
    'org_connections.unassign_org_student_from_advisor',
    'org_member_status.set_member_status',
    'organization_management.reset_user_password',
)
_reviewed(
    'require_admin(auth_user_id) is re-checked inside the view body',
    'xp_reconciliation.audit_user_xp',
    'xp_reconciliation.reconcile_user_xp',
)
_reviewed(
    'the masquerade target must be a non-admin member of the caller\'s own '
    'school; @require_real_identity ignores any active masquerade',
    'masquerade.start_masquerade',
)

# --- SIS: staff routes scoped by the CALLER'S org ---------------------------
# These resolve org_id from the caller (sis_service) and every query filters on
# it, so a student id from another school simply does not resolve. Implicit,
# and the strongest candidates for migration in step (c).
_reviewed(
    'ADMIN_ROLES/STAFF_ROLES gate + every query filtered by the caller\'s own '
    'organization_id, so a cross-org student id does not resolve',
    'sis.add_emergency_contact',
    'sis.copy_family_contacts',
    'sis.get_student',
    'sis.list_emergency_contacts',
    'sis.message_student',
    'sis.student_classes',
    'sis.update_enrollment',
    'sis.update_student',
    'sis_attendance.student_attendance',
    'sis_attendance.student_attendance_day',
    'sis_catalog.unenroll_student',
    'sis_clp.clp_student',
    'sis_clp.update_clp_record',
    'sis_prior_learning.student_accepted',
    'sis_tuition.preview_tuition_invoice',
    'sis_tuition.send_tuition_invoice',
    'sis_tuition.tuition_preview',
    'school_inbox.send_as_school',
)
_reviewed(
    '_student_in_org(org_id, student_id) in routes/sis/student_records.py; the '
    'parent-facing read checks guardianship instead',
    'sis_student_records.add_material',
    'sis_student_records.get_student_record',
    'sis_student_records.parent_student_record',
    'sis_student_records.save_student_record',
)
_reviewed(
    '_can_register(caller, org, student) in services/sis_parent_service -- SIS '
    'household guardianship, checked at every service entry point',
    'sis_parent.add_student_class',
    'sis_parent.add_student_course',
    'sis_parent.claim_student_spot',
    'sis_parent.drop_student_class',
    'sis_parent.drop_student_course',
    'sis_parent.set_learning_day',
    'sis_parent.student_schedule',
    'sis_parent.upload_student_photo',
)
_reviewed(
    '_authorize(caller, class_id) proves class moderator, then the student must '
    'hold an active class_enrollments row on that class',
    'sis_class_quests.remind_student',
    'sis_class_quests.student_class_progress',
    'sis_goals.save_goals',
)
_reviewed(
    'service.can_access_class / can_manage_class(class_id, caller, roles, org)',
    'classes.get_student_progress',
    'classes.withdraw_student',
)
_reviewed(
    'facilitator of the student\'s Treehouse cohort, checked in the view',
    'treehouse.adjust_balance',
    'treehouse.student_balance',
    'treehouse.withdraw_cohort_student',
)

# --- portfolio / transcript: the consent model, not a relationship -----------
_reviewed(
    'utils.portfolio_access.can_view_portfolio / can_manage_privacy -- the '
    'module that unified these rules on 2026-08-01',
    'portfolio.create_transcript_share',
    'portfolio.get_user_portfolio',
    'portfolio.get_visibility_status',
    'portfolio.list_transcript_shares',
    'portfolio.revoke_transcript_share',
    'portfolio.update_portfolio_privacy',
    'learning_events.get_public_learning_events',
)
_reviewed(
    'deliberately unauthenticated share surface: a signed, revocable share '
    'token OR can_view_portfolio for a signed-in caller; denial is a 404 so the '
    'endpoint cannot confirm a uuid belongs to a real student',
    'portfolio.get_public_diploma_by_user_id',
    'public.get_public_transcript',
    'parental_consent.check_consent_status',
)

# --- everything else ---------------------------------------------------------
_reviewed(
    '_verify_manages_student / _verify_admin_for_student in routes/oea.py',
    'oea.add_student_credit',
    'oea.get_progress_report',
    'oea.get_student_credits',
    'oea.get_student_enrollment',
    'oea.get_student_transcript',
    'oea.set_credit_caps',
)
_reviewed(
    'direct_message_service.can_message_user -- peer connection plus block '
    'check; the child-conversation reads require guardianship',
    'direct_messages.check_can_message',
    'direct_messages.get_child_conversation_messages',
    'direct_messages.get_child_conversations',
    'direct_messages.send_message',
)
_reviewed(
    'group membership + moderator rights are checked in the service before a '
    'member can be removed',
    'group_messages.remove_member',
)
_reviewed(
    'xp_goal_service.can_view_goal(caller, student) -- can_view_portfolio with '
    'allow_peers=False, because a private goal is not shared work',
    'xp_goals.clear_student_goal',
    'xp_goals.get_student_goal',
    'xp_goals.get_student_goal_history',
    'xp_goals.set_student_goal',
)
_reviewed(
    'the transcript is the caller\'s own unless they can_view_portfolio',
    'credits.get_transcript',
)


def _innermost(fn):
    seen = set()
    while hasattr(fn, '__wrapped__') and id(fn) not in seen:
        seen.add(id(fn))
        fn = fn.__wrapped__
    return fn


@pytest.fixture(scope='module')
def app_():
    from app import app
    return app


def _id_bearing_rules(app):
    for rule in app.url_map.iter_rules():
        params = set(rule.arguments) & ID_PARAMS
        if params:
            yield rule, params


def test_every_id_bearing_route_declares_or_is_reviewed(app_):
    undeclared = []
    for rule, params in _id_bearing_rules(app_):
        view = app_.view_functions[rule.endpoint]
        if getattr(view, ENFORCED_ATTR, None):
            continue
        if getattr(view, '_superadmin_only', False):
            continue
        if rule.endpoint in REVIEWED_2026_09_03:
            continue
        inner = _innermost(view)
        try:
            where = f'{inspect.getsourcefile(inner)}:{inspect.getsourcelines(inner)[1]}'
        except Exception:
            where = '?'
        undeclared.append(
            f"  {'/'.join(sorted(rule.methods - {'HEAD', 'OPTIONS'})):8} {rule}\n"
            f"    endpoint : {rule.endpoint}\n"
            f"    names    : {', '.join(sorted(params))}\n"
            f"    at       : {where}")

    if undeclared:
        pytest.fail(
            "These routes name a person in the URL and never say what the "
            "caller must be to them:\n\n" + "\n".join(undeclared) + "\n\n"
            "A hand-written check inside the view is not enough on its own -- "
            "it is invisible to review and to this test. Either:\n"
            "  * declare it: @require_relationship_to('student_id', "
            "allow=('self', 'parent', 'advisor')) below the auth decorator, or\n"
            "  * if the route is superadmin-only, gate it with @require_admin / "
            "@require_superadmin, or\n"
            "  * add it to REVIEWED_2026_09_03 with the location of its real "
            "check -- only after reading the handler."
        )


def test_allowlist_has_no_stale_entries(app_):
    """An entry for a route that no longer exists is dead weight that makes the
    list look more reviewed than it is. Deleting a route must delete its entry."""
    live = {rule.endpoint for rule, _ in _id_bearing_rules(app_)}
    stale = sorted(set(REVIEWED_2026_09_03) - live)
    assert not stale, (
        "REVIEWED_2026_09_03 names routes that no longer exist (or no longer "
        "take a person id). Delete these entries:\n  " + "\n  ".join(stale))


def test_allowlist_entries_carry_a_real_reason():
    """A reason must say where the check lives. Placeholders defeat the point."""
    bad = [ep for ep, why in REVIEWED_2026_09_03.items()
           if not why or len(why) < 25 or re.match(r'^\s*(todo|tbd|n/?a|ok|checked)\b',
                                                   why, re.I)]
    assert not bad, (
        "These allowlist entries do not name where the check lives:\n  "
        + "\n  ".join(sorted(bad)))


def test_migrating_a_route_removes_its_allowlist_entry(app_):
    """The allowlist and the decorator are alternatives, not belt-and-braces.

    Leaving an entry behind after migrating a route keeps the count of
    'reviewed' routes artificially high and hides the progress of step (c).
    """
    both = []
    for rule, _ in _id_bearing_rules(app_):
        view = app_.view_functions[rule.endpoint]
        if getattr(view, ENFORCED_ATTR, None) and rule.endpoint in REVIEWED_2026_09_03:
            both.append(rule.endpoint)
    assert not both, (
        "These routes now declare @require_relationship_to, so their "
        "REVIEWED_2026_09_03 entries are obsolete -- delete them:\n  "
        + "\n  ".join(sorted(set(both))))
