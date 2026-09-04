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
#:
#: WIDENED 2026-09-03. The first five were the obvious ones and they left a
#: blind spot worth 34 routes -- the whole SIS staff surface, SIS people and
#: users, advisor assignment, family observer management, COPPA consent
#: approve/reject, admin audit logs, advisor notes, and unblock. Every one of
#: them names a person in its URL and none of them was in the census, so the
#: guard reported a clean 187 over 82% of the actual surface.
#:
#: The one route that had to move rather than be listed:
#: observer.get_feed_item_viewers took `<target_id>`, which was a completion or
#: learning event, not a person. It is `<feed_item_id>` now. Teaching this set
#: that `target_id` sometimes means a person and sometimes does not would have
#: made the convention unusable -- the guard's whole premise is that the
#: parameter name is trustworthy.
ID_PARAMS = frozenset({
    'user_id', 'student_id', 'target_user_id', 'child_id', 'dependent_id',
    'staff_id', 'target_id', 'advisor_id', 'observer_id', 'parent_id',
    'member_user_id', 'admin_id', 'subject_id', 'blocked_id',
})

#: endpoint -> where that route's relationship check actually lives.
#: Shrinks as SEC-10 step (c) migrates modules to @require_relationship_to.
#: Never add an entry without reading the handler; "it was already failing" is
#: not a reason, it is the test working.
REVIEWED_2026_09_03 = {}


def _reviewed(reason, *endpoints):
    for ep in endpoints:
        REVIEWED_2026_09_03[ep] = reason


# --- parent -> child ---------------------------------------------------------
# MIGRATED 2026-09-03: routes/parent/* (34 routes, 8 modules) now declare
# @require_relationship_to. Read paths allow ('parent', 'observer'); write and
# private-message paths allow ('parent',) alone -- exactly the split
# verify_parent_access already made via allow_observer (IDOR-H4/H5). The helper
# stays as the precise inner check; the decorator is the structural declaration.
#
# MIGRATED 2026-09-03: routes/dependents.py (12 routes) declares
# @require_relationship_to(<param>, allow=('parent',)). Unlike routes/parent/*,
# the inner checks here were NOT collapsed away, and must not be. Those routes
# gate on `users.managed_by_parent_id == caller`; the decorator's `parent`
# predicate is `is_parent_of`, which ALSO accepts an approved
# parent_student_links row. On production that is not a theoretical difference:
# 129 of the 131 approved links are for a student whose managed_by_parent_id is
# somebody else. Collapsing would hand those 129 pairs delete, promote and
# act-as on a teen who is not their dependent. The decorator is the outer
# structural gate; the managed_by_parent_id checks stay as the precise one.

# --- advisor -> assigned student --------------------------------------------
# MIGRATED 2026-09-03: the whole advisor surface, 15 routes across five modules,
# declares @require_relationship_to('student_id', ...). NOT collapsed -- every
# one of these inner checks additionally requires the caller and the student to
# be in the same organization, which `advisor` alone does not, and several are
# the union of an org check and an assignment check rather than either one.
#
# The declaration is the UNION of what each view grants, so it can only be an
# outer gate, never a narrower one:
#   ('advisor', 'org_staff')  -- 14 of the 15
#   ('org_staff',)            -- advisor.assign_student, because assigning IS
#                                what creates the advisor relationship; asking
#                                for one first would deny every real call
#   ('advisor', 'parent')     -- helper_evidence.get_student_tasks_for_evidence,
#                                which serves parents too, and whose LOCAL
#                                verify_advisor_access (not the shared one of
#                                the same name) requires an assignment even for
#                                an org_admin, so org_staff would overstate it

# --- observer -> linked student ---------------------------------------------
# MIGRATED 2026-09-03, seven routes, and NOT with one allow set -- these four
# views admit different callers and a uniform declaration would have overstated
# three of them:
#   ('self', 'parent', 'observer')  activity feed: the student, a parent by
#                                   either link, or a linked observer
#   ('self', 'observer')            comments: its docstring says exactly this
#   ('observer',)                   learning moments and portfolio: an
#                                   observer_student_links row, nothing else
#   ('self', 'parent')              the three parent_management routes, which
#                                   are about MANAGING a child's observers
# Superadmin reaches all seven through the decorator's platform-staff branch,
# which is where each view's own `role == 'superadmin'` check already put them.
# Not collapsed: the portfolio route additionally reads can_view_evidence off
# the link row, and the comment route separately checks comment permission.

# --- org staff -> student in the same org -----------------------------------
#
# MIGRATED 2026-09-03: routes/admin/transfer_credits.py (5 routes) too, with the
# same collapse and for the same reason -- its inline checks were the identical
# caller_can_access_user call, added as the IDOR-C2 fix.
#
# MIGRATED 2026-09-03: routes/admin/transcript_generator.py (10 routes) declares
# @require_relationship_to('user_id', allow=('org_staff',)) and its ten inline
# checks are gone. Collapsing was safe here in a way it was NOT for dependents:
# `org_staff` calls the very same caller_can_access_user, with the same admin
# client and the same caller id (require_school_admin resolves the caller
# through authorizing_user_id(), exactly as the decorator does). Identity, not
# a superset. The decorator's extra platform-staff grant adds nobody in
# practice -- caller_can_access_user already returns True for superadmin, and
# the one non-superadmin address in OPTIO_STAFF_EMAILS is an org 'parent' whom
# require_school_admin refuses before the gate is reached.
_reviewed(
    'caller_can_access_user(admin, caller, target) from utils.auth.org_scope',
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

# --- reviewed 2026-09-03 with the widened ID_PARAMS -------------------------
# The 26 routes the first five parameter names had missed. Read the same way as
# everything else here: the gate was found and named, which is not a proof that
# it enforces the right thing for its payload.
#
# A pattern shows up here that does not appear above, and it is worth naming
# rather than glossing: in eight of these the person in the URL is the ROW
# SELECTOR, not the authorization subject. "Remove advisor A from class C" is
# authorized by rights over C; A is which row to delete. Migrating one of those
# to @require_relationship_to would be wrong -- there is no relationship
# between the caller and A to require, and asserting one would either deny
# legitimate admins or invent a permission. They stay allowlisted on purpose,
# and a future reader should not read them as "not got round to yet".

# MIGRATED 2026-09-03, in the commit after the one that made them visible: the
# ten SIS staff routes declare @require_relationship_to('staff_id',
# allow=('org_staff',)). Same shape as the SIS student routes, and kept
# alongside the in-view org checks for the same reason -- org_id is a parameter
# of the work there, not only of the check.
#
# Archiving a staff member does not touch users.organization_id (it flips
# sis_staff_profiles.is_active), and placeholder rows carry an organization_id
# too, so restore_staff and link_staff still resolve for the people they are
# for. Checked before adding the gate, because "org_staff" would have been a
# quiet lockout otherwise.
_reviewed(
    'ADMIN_ROLES gate + org_id resolved from the CALLER, and the person lookup '
    'is filtered by it, so a target outside the caller\'s school 404s',
    'sis.get_org_user',
    'sis.person_removal_preview',
    'sis.remove_person',
    'sis.update_user_role',
    'sis.remove_household_member',
)
_reviewed(
    'row selector, not the authorization subject: rights over the CLASS decide, '
    'and the advisor id only says which membership row to remove',
    'classes.remove_class_advisor',
    'treehouse.remove_cohort_advisor',
)
_reviewed(
    'row selector, not the authorization subject: _guard_org on the org in the '
    'URL decides, and the advisor is then verified to belong to that org',
    'org_connections.assign_org_student_to_advisor',
    'org_connections.get_org_advisor_students',
)
_reviewed(
    'row selector, not the authorization subject: the caller must be a parent, '
    'and the write is scoped to the children they manage, so the observer id '
    'only picks which of the caller\'s own links to change',
    'observer.remove_family_observer',
    'observer.toggle_child_access',
)
_reviewed(
    'row selector, not the authorization subject: the delete is scoped to '
    'blocker_id = the caller, so blocked_id only names which of the caller\'s '
    'own blocks to lift',
    'moderation.unblock_user',
)
_reviewed(
    'caller_can_access_user(admin, caller, target) -- the IDOR-H7 fix',
    'admin_audit_logs.get_admin_statistics',
)
_reviewed(
    'not a gate but a scope: is_superadmin picks org_scope=None or the '
    'caller\'s own org, and the log query is filtered by it, so another org\'s '
    'admin returns nothing rather than being refused (IDOR-H7)',
    'admin_audit_logs.get_admin_activity',
)
_reviewed(
    'notes are read with advisor_id = the caller unless the caller is '
    'superadmin, so an advisor only ever sees their own notes about the subject',
    'advisor_notes.get_subject_notes',
)

# --- SIS: staff routes scoped by the CALLER'S org ---------------------------
# These resolve org_id from the caller (sis_service) and every query filters on
# it, so a student id from another school simply does not resolve. Implicit,
# and the strongest candidates for migration in step (c).
#
# MIGRATED 2026-09-03: the eight routes in routes/sis/__init__.py that name a
# student declare @require_relationship_to('student_id', allow=('org_staff',)).
# NOT collapsed: `org_id` there is a parameter of the work, not only of the
# check -- the service queries filter on it, and for a superadmin it is the
# `org` they asked for rather than one derived from the target. Removing
# _org_or_error would take the queries' scope with it.
_reviewed(
    'ADMIN_ROLES/STAFF_ROLES gate + every query filtered by the caller\'s own '
    'organization_id, so a cross-org student id does not resolve',
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
# MIGRATED 2026-09-03: the eight sis_parent routes naming a student declare
# @require_relationship_to('student_id', allow=('parent', 'household_guardian')).
#
# `household_guardian` is a NEW predicate, added because none of the existing
# ones could express this cluster. These routes authorize through
# sis_parent_service.registerable_students, which resolves a family THREE ways:
# household_members rows, users.managed_by_parent_id, and approved
# parent_student_links. is_parent_of knows the last two. The first is how the
# SIS registration funnel builds a family, and for a microschool it is nearly
# every family -- so declaring ('parent',) here would have been NARROWER than
# the view and would have refused those guardians at the door. That is the
# failure this whole exercise is supposed to prevent, so it is worth saying
# plainly: the right move when the vocabulary does not fit is to extend the
# vocabulary, not to round the declaration to the nearest existing word.
#
# Not collapsed: _can_register additionally scopes to the org in the request
# and to SIS-enabled orgs, neither of which the relationship answers.
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
# MIGRATED 2026-09-03: the six AUTHENTICATED portfolio routes declare, split by
# which question they ask:
#   reads   (get_user_portfolio)     -> can_view_portfolio's seven grants:
#           ('self','parent','advisor','teacher','observer','peer','org_staff')
#   manage  (visibility-status, privacy, the three transcript-share routes)
#           -> ('self','parent','advisor','org_staff'), matching
#           can_manage_privacy, which is deliberately NARROWER than viewing:
#           a class teacher reads a portfolio but does not get to publish it.
# Not collapsed -- can_manage_privacy also refuses a MINOR acting on their own
# portfolio, and no relationship can express "self, if adult".
#
# What stays here, and must: `learning_events.get_public_learning_events` and
# `portfolio.get_public_diploma_by_user_id` take no @require_auth at all. They
# answer for anonymous callers and decide inside the view from the portfolio's
# own privacy setting (plus, for the diploma, a signed LTI evidence token).
# @require_relationship_to demands an authenticated caller, so putting it on
# either would 403 every legitimate anonymous visitor. A route with no caller
# is not a route with an unchecked caller.
_reviewed(
    'unauthenticated by design: answers from the portfolio\'s own privacy '
    'setting, never from who is asking',
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
