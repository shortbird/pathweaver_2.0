"""Ratchet: direct database calls in the upper layers may shrink, never grow.

The repository pattern is documented as the way new code reaches the database
(CLAUDE.md, backend/docs/REPOSITORY_PATTERN.md). Measured, adherence is around
9%: routes/ alone makes 2339 direct `.table(...)` calls, services/ another 1779.
Finishing that migration is a large piece of work that has not been funded, and
QB-06 puts the choice to the user.

This test is the fence in the meantime. It does not ask anyone to migrate
anything; it asks that the number stop climbing while the decision is pending.
A new route that reaches for `.table(...)` instead of a repository fails the
build, and the reviewer gets to ask why. Existing debt is untouched.

Baselines are per LAYER, not a single total, because the layers mean different
things:

  routes/       calling the database directly is the actual violation -- it
                skips the layer that is supposed to own the query.
  services/     the same, one level down.
  repositories/ this is where `.table(...)` BELONGS. The number is here to
                notice churn, not to shame it; raising this one alongside a real
                migration is expected and fine.
  utils/, middleware/, jobs/, modules/
                small and mostly legitimate (auth lookups, cron jobs).

Ratchet DOWN as code migrates. Never raise the COMBINED routes/ + services/
total -- that is the line this exists to hold.

That used to read "never raise routes/ or services/", which was almost right and
blocked a change it should have welcomed. Extracting a helper from a route
module into services/ moves existing calls DOWN a layer, which is the direction
the repository pattern wants; it raises services/ while lowering routes/ by the
same amount, and the old rule called that a violation. So the per-layer numbers
are still recorded (they say where the debt sits), but the assertion that cannot
be argued with is `test_the_upper_layers_do_not_grow_in_total`: a lateral move
passes, a new `.table(...)` anywhere above repositories/ does not.
"""

import ast
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]

# Measured 2026-09-03.
# repositories/ raised 415 -> 417 for get_class_activity in
# class_repository.py: the roster-wide week read for class check-ins, plus
# _quest_titles beside it. The second call is not avoidable by embedding --
# quest_task_completions has no foreign key on quest_id, so PostgREST cannot
# resolve `quests(title)` as a nested select. Both sit in the layer that owns
# the table; nothing was added above repositories/.
# repositories/ raised 406 -> 415 when the CRM suppression cascade moved out of
# routes/ into repositories/crm_repository.py (the webhook, the admin console
# and the unsubscribe link all needed to agree on it). routes/ fell by the
# same migration.
# utils/ raised 130 -> 131 for the lazy re-encrypt in utils/org_secrets
# (SEC-16): the read path upgrades a legacy plaintext row in place, which is
# the whole migration -- no backfill script and no window where a row is
# unreadable. It sits beside the read it upgrades, in the module that owns the
# table.
# utils/ raised 128 -> 130 for is_household_guardian in utils/portfolio_access,
# the module whose entire job is answering cross-user access questions against
# the database -- every predicate beside it (is_parent_of, is_advisor_of,
# is_observer_of, teaches_student) is two such reads. A repository for it would
# be a repository with one caller, and utils/ may not import repositories/
# anyway (test_import_layers). This is the "small and mostly legitimate"
# category the docstring describes, not creeping debt.
# utils/ raised 131 -> 134 for utils/guardian_scope.py, which answers "may this
# adult read this kid's quest": three lookups (the student's row, the
# parent_student_link, the caller's role) that ARE the authorization check.
# Routing an auth gate through a repository would put the decision a layer away
# from the code that enforces it; the neighbouring guards
# (routes/family_quests.verify_parent_has_access_to_child,
# routes/parent/dashboard_overview.verify_parent_access) read the same tables
# the same way.
# routes/ 2336 -> 2316 and services/ 1779 -> 1794 on 2026-09-03: the
# registration funnel's session/account helpers moved to
# services/registration_funnel_support.py and
# services/registration_accounts_service.py (QB-04). Fifteen calls changed
# layer; the file they came from held 59 before and the three files hold 59
# after, checked by counting. The remaining 5 of the routes/ drop is slack that
# was already in the old number.
# RE-MEASURED 2026-09-05, merging origin/main into audit/remediation-2026-08.
# Every number below is the counted value in the merged tree, not arithmetic on
# the two sides -- the branches raised 'utils' to 131 INDEPENDENTLY, for
# different modules (org_secrets + portfolio_access here, guardian_scope on
# main), so the identical figure auto-merged clean while the truth was 134.
# routes/ 2316 -> 2321 and services/ 1794 -> 1800 are main's additions landing
# on top of QB-04's extraction: sis_billing_alerts accounts for six of the
# services/ rise (six single-row lookups -- organizations, households,
# sis_saved_payment_methods, users x2, sis_recurring_tuition -- that exist only
# to compose the text of one office notification, which routing through five
# repositories buys nothing).
# services/ 1800 -> 1803 on 2026-09-05, three iCreate Perch tickets:
#   * sis_onboarding_service.attachable_documents lists one person's rows in
#     sis_secure_documents so the office can file an already-uploaded background
#     check against the checklist item it answers (c23105fa). The single-row
#     read next to it goes through sis_secure_docs_service.get_document; there
#     is no list reader there to borrow, and office_documents two functions
#     above already reads this table the same way.
#   * messaging_extras_service._reactor_names resolves display names for a page
#     of reactions, so a pill can say WHO reacted and not just how many
#     (d4233d4e). One users read per page, never per pill.
#   * sis_registration_service._live_classes_with_rooms reads org_classes for
#     the room double-booking check (43625a45) -- the same query, on the same
#     table, as list_teacher_conflicts immediately above it, which is the
#     teacher-keyed twin of the same feature.
# routes/ 2321 -> 2332 and services/ 1803 -> 1826 on 2026-09-05, the second
# iCreate Perch sweep (24 tickets). No repository exists for any of the tables
# below, and every neighbouring SIS service owns its own table the same way —
# adding four repositories for four new SIS tables, to be called from one
# service each, would be a layer with nothing in it.
#
#   routes/ (+11)
#     curriculum.py            +6  a quest on several curricula: read which
#                                  carry it, add it to another, take it off one
#                                  (24d47467)
#     class_quests.py          +2  the class's curriculum quest ids for the
#                                  scoped picker (49ba6e08/71e7f320), and the
#                                  caller's name for "call for help" (9d0618f8)
#     resources.py             +1  checking the people a resource is pinned to
#                                  are in this school (cf671ff2)
#     the rest                 +2  incidental reads beside the above
#
#   services/ (+23)
#     sis_event_rsvp_service   +10 a NEW table (sis_event_rsvps) and its event:
#                                  reply, edit, count, and the household a
#                                  guardian answers for (9cf78e9a)
#     sis_community_service    +7  a NEW table (sis_recognition_comments):
#                                  list, count, add, delete, ownership, names
#                                  (d0c7ac4e)
#     sis_billing_service      +3  repricing an invoice when a student switches
#                                  classes (98445c62/ad37b8c2)
#     one each                 +3  onboarding's attachable documents (c23105fa),
#                                  reaction author names (d4233d4e), the room
#                                  double-booking read (43625a45), the school
#                                  inbox's last sender (2ca63bde), class supply
#                                  spend (805cb3a3)
#     kiosk                    +2  net, merging 2026-09-07: _class_in_org()
#                                  gives a kiosk device's class scoping one
#                                  ownership check instead of two hand-rolled
#                                  copies, and the settings card gets the class
#                                  NAME back with it. New route code with its
#                                  own gating tests; the deletion of the daily
#                                  advisor summary's routes gave one back, so
#                                  routes/ nets +1.
# routes/ 2333 -> 2337 on 2026-09-08, duplicating a quest and a task (iCreate
# 45c7ced1, 4da3680d). The copying itself went into
# services/sis_quest_authoring, beside create_org_quest, and adds nothing here.
# What is left in routes/ is the attaching, which is what each route is for and
# differs per screen:
#   curriculum.py   +3  the curriculum's next sequence_order and the link row
#                       for the copy (the same two writes create_curriculum_quest
#                       makes directly above it), plus reading the source task
#                       to be duplicated
#   class_quests.py +1  reading the source task on the class-page twin
# No repository owns sis_curriculum_quests or quest_template_tasks, and the
# create/delete routes on either side of these read them the same way.
# services/ 1826 -> 1827 on 2026-09-08. sis_billing_service.invoice_statuses:
# the status of a named handful of invoices, so a screen that raised a charge
# can say whether it landed. Written for the RSVP list on a calendar event
# (9cf78e9a), which shows who is coming and, on a paid event, who has actually
# paid. It lives here rather than in sis_event_rsvp_service because
# sis_invoices belongs to this module, and reading the whole org ledger through
# list_invoices to find a dozen rows is the alternative.
# routes/ 2337 -> 2340 on 2026-09-08. direct_messages.email_message_to_me, the
# superadmin "email this message to me" action. Three reads, and they are the
# authorization, not the feature: the caller (is this a superadmin?), the
# message (does it exist, is it deleted?), and the other party in the thread
# (is the caller even in this conversation?). They are the same three reads
# forward_to_school makes twenty lines above, in the same shape, for the same
# reason. The feature itself -- minting the relay, rendering and sending the
# mail -- is in services/message_email_relay_service.
# services/ 1827 -> 1828 on 2026-09-08. sis_service.resolve_preview_target
# reads the previewed staff member's row to check they are in the caller's org
# — the one query behind "View portal". It is not new work: it moved down out
# of routes/sis/staff_portal.py (which drops by the same one) so the
# announcements list could ask the same question, rather than growing a second
# copy of an authorization check (iCreate 0a10f2ae). No repository owns `users`
# at this granularity, and the neighbouring caller_is_admin reads it the same
# way three lines below.
# routes/ 2340 -> 2342 on 2026-09-09. The two SIS preset-task PATCH routes
# (class_quests, curriculum) now read the task before writing it. The diploma
# subject split is stored as XP AMOUNTS, so recomputing it needs the XP and the
# pillar the task will hold AFTER the patch -- and those are usually columns the
# patch is not touching. Taking them from the request instead would let a
# partial patch from any other caller rescale the split against values it never
# sent, which is the class of silence this whole change exists to end: the
# editors wrote no subject at all, so every task a school typed in kept the
# column default of ['Electives'].
BASELINES = {
    # 2026-09-11 (merge of icreate/requests-v2 into main): both branches moved
    # this number and the merge is the union, so every figure below is MEASURED
    # on the merged tree rather than carried from either side. routes and
    # services FELL -- the quest-resources work took its queries down into
    # repositories/quest_resource_repository.py instead of leaving them in the
    # route -- so they are lowered here in the same commit, per rule 2 at the
    # top of docs/remediation-2026-09/RATCHETS.md. A layer that drops and keeps
    # the old ceiling is that much of a fix nobody would notice being undone.
    # 2026-09-15 (parent refactor, phase 2): 2330 -> 2292. Deleted outright:
    # routes/observer_requests.py, routes/parent/quests_view.py and
    # evidence_view.py, routes/dependents_acting_as.py, the three
    # request-and-approve routes in routes/admin/parent_connections.py;
    # sis/goals.py and the my-children / my-dependents routes now ask
    # utils.class_membership and services.family_children_service instead
    # of reading the link tables themselves.
    # 2026-09-17 (M15, docs/sis/CONSOLIDATION_PLAN.md): 2285 -> 2278. The seven
    # SIS cron endpoints each carried a private users read for the superadmin
    # fallback; routes/sis/internal.py declares them once and asks
    # sis_service.get_user_org_context instead, which already reads that row.
    # 2026-09-17 (M12, docs/sis/CONSOLIDATION_PLAN.md): 2278 -> 2271. The
    # calendar route's six sis_events reads and writes moved down into
    # services/sis_events_service.py, the one reader of that table; the route
    # keeps its validation and answers. Plus one from M12's rename in
    # routes/sis/events.py of the ownership check into the service.
    # 2026-09-17: 2271 -> 2268 (merge of the two lines of work above). The
    # quest library (routes/sis/quest_library.py) reads through
    # repositories/sis_quest_library_repository.py, and the one writer for
    # "this quest is on this curriculum" moved out of routes/sis/curriculum.py's
    # add_quest_to_curriculum into sis_curriculum_sync.attach_quest_to_curriculum,
    # which uses the same repository. Lowered in the same commit, per rule 2.
    # 2026-09-17 (M2): 2268 -> 2266. The Families PATCH and the bulk directive
    # paste stopped writing sis_family_directives / households themselves; the
    # calls moved down into services/sis_holds.py (+2 there), a lateral move.
    # 2026-09-17 (M4): 2266 -> 2263. The funnel's three emergency-contact
    # writes moved into services/emergency_contacts_service.py (which then
    # writes through the repository); the family-cover route reads and writes
    # the household through HouseholdRepository.
    # 2026-09-17 (M16): 2263 -> 2257. The funnel's household_members upsert
    # and the learning-app admin's four "already a member?" reads and inserts
    # went through sis_person_service.join_household, which writes through
    # HouseholdRepository.add_members (the repository's add_member now calls
    # it, so that layer's count did not move).
    # 2026-09-18 (M16, second half): 2257 -> 2248. The funnel's household
    # lookup, update and insert and the learning-app admin's copy of the
    # lookup and its household insert went into sis_attach_service, which
    # reads and writes through HouseholdRepository.
    # 2026-09-19: 2248 -> 2245. The family-cover route's three direct users
    # reads and writes went into UserRepository (family_cover_pointers,
    # set_family_cover) when the photo started to be shared across a platform
    # family's co-parents.
    'routes': 2245,
    # 2026-09-09: 1828 -> 1830. The deletion sweep's reactivation guard, in
    # account_deletion_service: one read for dependents added after the request,
    # one write to rescind it. The sweep is a cron entrypoint that already owns
    # its own queries end to end (no repository sits under it), and the guard has
    # to read the same users row the surrounding recheck already reads. Routing
    # two calls through a repository to satisfy the ratchet would have split the
    # erase-or-not decision across two files.
    # 2026-09-10: 1830 -> 1841. The AI credit reviewer. Eleven calls in three
    # places, none of them a table this repository layer already owns:
    #   - CreditAIReviewService._load_context reads a completion, its rounds, its
    #     task and its quest to build ONE prompt. Four repositories would answer
    #     four questions; what the prompt needs is one submission.
    #   - trigger.queue_orphans finds pending submissions whose latest round has
    #     no review, which is a join across two tables that exists only to keep
    #     the queue honest.
    #   - xp_adjustment_service reconciles user_quest_tasks, user_skill_xp and
    #     sis_xp_adjustments in one operation. Splitting it across repositories
    #     would split the reconciliation, and a half-applied XP change is the
    #     exact failure the service was extracted to prevent.
    # The genuinely new table, credit_ai_reviews, DID get a repository
    # (repositories/credit_ai_review_repository.py) and accounts for none of this.
    # 2026-09-10: 1841 -> 1847. Class quests that end themselves once the
    # assigned work is turned in (Gryffin student check-ins: a finished quest
    # sat open on the student's home page). Six calls in two places:
    #   - class_quest_completion.end_if_class_quest_complete reads the open
    #     enrollments for one (student, quest) and closes the finished ones under
    #     an optimistic lock, then fires the SAME side effects the student's own
    #     "End quest" button fires -- the completions, the user's org, the quest
    #     title, for one quest.completed webhook. Those three reads are copied
    #     from routes/quest/completion.end_quest deliberately: the two paths have
    #     to emit the identical event, and splitting them across a repository is
    #     what would let them drift.
    #   - class_service._attach_quest_status reads this student's user_quests for
    #     the quests their classes assigned, to count what is still outstanding
    #     on each class card. No repository owns user_quests keyed by student.
    # The class_quests half of that feature did NOT land here: it went into
    # ClassRepository.get_due_dates_for_classes, the layer that owns the table.
    # 2026-09-10: 1841 -> 1844. Three permission reads that answer a question
    # no repository owns:
    #   - quest_resource_service.can_edit_quest reads class_quests to ask "does
    #     this teacher moderate a class this quest is attached to". The data
    #     access for quest_resources itself went into
    #     repositories/quest_resource_repository.py, which is why this is +1 and
    #     not +14.
    #   - sis_messaging_service reads org_classes and class_meetings to build
    #     the "teachers of this class" and "teaching on Tuesday" presets. Both
    #     are org-wide lists behind fetch_all_rows, assembled for a picker.
    # 2026-09-15 (parent refactor, phase 2): 1843 -> 1840. notification_service
    # .get_parents_for_student and announcement_service lost their private
    # copies of "who is this child's parent" (utils.class_membership answers
    # now); family_children_service is new but reads through
    # repositories/family_repository.
    # 2026-09-17 (M12): 1836 -> 1837. services/sis_events_service.py holds the
    # five calls that read and write sis_events (list, get, insert, update,
    # delete); four other services gave up their own read of the table for it
    # and the route gave up six, so this is a move down a layer (+5 here, -4
    # here, -6 in routes/), not new querying. The combined total fell by five.
    # 2026-09-17 (M5, M6): 1837 -> 1833. sis_billing_service.write_invoice is
    # the one sis_invoices insert where three functions each had their own
    # (-2), and the UFA learning-day bulk read went to a repository while the
    # tuition queue's time-block read goes through sis_catalog_service (-2).
    # Measured on the tree; lowered per rule 2 of RATCHETS.md.
    # 2026-09-17 (M2): 1833 -> 1835. services/sis_holds.py holds every write of
    # a family hold and the directive staging (set, clear, stage, apply, the
    # gate's household read); the funnel route, the Families PATCH, the bulk
    # paste, the fee step, the waitlist release and the waiver gave up theirs
    # (-6 in services, -2 in routes). A move down a layer, not new querying.
    # 2026-09-17 (M8b, first half): 1835 -> 1834. The schedule AI editor's
    # own organizations.feature_flags read for the time blocks went; it asks
    # sis_catalog_service.time_blocks like every other reader.
    # 2026-09-18 (M16, second half): 1834 -> 1833. grant_teacher_role and
    # link_staff_account's merge share one role write (grant_advisor_role).
    'services': 1833,
    # 2026-09-09: 439 -> 442. GroupRepository, owning the three reads behind the
    # Messages badge: this user's group memberships, the still-active groups
    # among them, and the unread count within one group. The badge counted
    # direct messages only, so a parent's unread class chats never lit it up.
    # Group messaging predates the pattern and its data access still sits in
    # GroupMessageService; this is the first piece moved down, and services/ did
    # not move as a result.
    # 2026-09-08: 418 -> 439. ParentDigestRepository, which owns every read
    # behind the weekly parent digest: the roster, both guardian links, the
    # week's completions and the evidence documents under them, learning
    # moments, and the class quests whose due date has passed. Twenty-one calls
    # across eight tables, all of them new work, none of them above
    # repositories/ — routes/ and services/ did not move.
    # 2026-09-07: 417 -> 418. A new EmergencyContactRepository owning the one
    # bulk read behind the printable emergency contact sheet (iCreate 41c838c5).
    # The query is new, and it is in the layer that is allowed to have it.
    # 2026-09-09: 442 -> 450. OEARepository grows the reads and writes behind
    # removing a course quest: the three counts that say whether removing it
    # would destroy student work, the enrollment/credit/quest reads that find
    # the course quests no credit points at any more, the rename that keeps a
    # quest's title matching its credit, and the unenroll. All of it is data
    # access for one relationship this repository already owns (oea_credits ->
    # quests), and routes/ did not move: the route calls two repository methods.
    # 2026-09-10: 450 -> 464. CreditAIReviewRepository, owning every query
    # against credit_ai_reviews: the queue reads, the two conditional writes that
    # make the claim work, and the paged read behind the dashboard's AI filter.
    # All new work, all in the layer that is allowed to have it.
    # 2026-09-10: 464 -> 465. ClassRepository.get_due_dates_for_classes -- one
    # read of class_quests for a whole class list, so the outstanding-work badge
    # on each student class card costs one query instead of one per card. It is
    # the half of that feature that had a repository to go to; the layer that
    # owns the table is where it belongs.
    # 2026-09-10: 464 -> 471. repositories/quest_resource_repository.py, the
    # data access for the new quest_resources table. This layer is where a
    # .table() call BELONGS -- the number going up here is the ratchet working,
    # not being worked around.
    # 2026-09-11: 472 -> 484. repositories/class_quest_audience_repository.py,
    # the data access behind "who is this class quest for" (Gryffin): the
    # class's quest links with their student_ids, the audience write, and the
    # four reads that decide whether a removed student's enrollment can be
    # deleted or must be set down (their user_quests row, its tasks, and any
    # completion or evidence document on those tasks). routes/ and services/
    # did not move: the route and the enrollment service call the repository.
    # 2026-09-11: 484 -> 528. Stories on www (services/stories/). Forty-four
    # calls, every one in a repository, none above:
    #   - story_repository (15): the queue reads and the two conditional writes
    #     that make the claim work, the paged published list the static site
    #     builds from, and the per-student list revocation and erasure use.
    #   - story_source_repository (11): read-only access to everything a story
    #     is drafted from -- the completion, its rounds, the task, the quest,
    #     the enrolment, the student, the guardians' names and the org name the
    #     scrubber must remove, the academy enrolment for the grade band. The
    #     guardian RELATIONSHIP comes from utils.class_membership, the one
    #     definition (test_one_definition_of_parent); only the names are read.
    #   - story_asset_repository (7), promotional_consent_repository (5),
    #     marketing_rebuild_repository (5): each new table's own data access.
    #   - credit_ai_review_repository (+1): latest_complete_for_completion, so
    #     a story can quote what the reviewer looked for.
    # routes/stories/ and services/stories/ make zero direct calls; the
    # erasure hook in user_erasure_repository goes through the repositories
    # above rather than adding reads of its own.
    # 2026-09-11: 528 -> 529. user_repository.ids_matching_name, the read
    # behind the credit dashboard's student search box. The box had been
    # sending the typed name as student_id and the route matched it against
    # the uuid, so a name could never find anyone.
    # 2026-09-11: 529 -> 530. story_repository.list_previewable, behind the
    # dev-only ?preview=1 on the public stories route so a story in review can
    # be seen as a www page before anyone presses Publish.
    # 2026-09-14: 530 -> 531. school_enrollment_repository.find_for_student,
    # the read "Withdraw from school" on a family record makes before marking
    # a student withdrawn again. school_enrollments had no repository; the
    # service that writes it (sis_person_service._archive) keeps its existing
    # direct calls and adds none.
    # 2026-09-14: 531 -> 533. bug_report_repository, the ticket tracker that
    # replaces Perch: find_detail (one row with its org's name, for the
    # /admin/tickets detail view) and counts_by_status (an exact-count per
    # status for the tracker's tabs). list_recent folded into list_filtered
    # rather than adding a third list reader.
    # 2026-09-14: 533 -> 537, the afternoon iCreate batch.
    #   quest_template_task_repository.ids_for_quest + set_order (+3): the
    #     reads and writes behind reordering a quest's preset tasks
    #     (c7d1f7a5); the validating reorder sits beside them in the same
    #     repository, so nothing is added above this layer.
    #   school_enrollment_repository.statuses_for_org (+1): every student's
    #     standing at the school, for the org admin's People tab, which had
    #     no way to show a withdrawn student as anything but present.
    # 2026-09-15: 537 -> 546. story_candidate_repository (+8), the table
    #   behind the app's "flag for a story" bookmark on a feed item: get,
    #   get_by_target, list_by_status, open_target_ids (one read per feed
    #   page), flag (insert or reopen), resolve, unflag. And
    #   story_source_repository.learning_event (+1): the moment behind a
    #   bookmarked learning_moment, so the queue can show what was flagged.
    #   Nothing was added above this layer: the feed and the stories routes
    #   call the repository.
    # 2026-09-16: 546 -> 557. Friends: the per-child policy and its consent
    # record (repositories/peer_policy_repository.py, 6: the policy row, a
    # batch of them, the upsert, the consent insert, and the two user reads
    # the policy service needs) and the parent's oversight reads on top of
    # peer_connections (repositories/peer_connection_repository.py, 5: the
    # bulk revoke behind "Friends: off", the live count the confirm dialog
    # names, the activity window's connections and comments, and the pending
    # approvals any parent of the child may answer). All new work, all in the
    # layer that is allowed to have it; services/ FELL by one, because
    # pending_approvals moved its read down here. Plus one in
    # parent_digest_repository: the week's newly active connections, so an org
    # parent's digest carries the friends their child added.
    # 2026-09-16: 558 -> 569, Friends phase 2. peer_reaction_repository (5:
    # the upsert, the clear, the two per-column page reads behind the feed's
    # counts, and the activity window's read), peer_connection_repository
    # (+5: the states between one student and a list of classmates, the
    # blocks either way, the two per-column peer comment counts a feed page
    # merges in, and the class names a suggestion is labelled with), and
    # peer_policy_repository.org_student_ids (+1: the school pool, read
    # through fetch_all_rows). routes/ and services/ did not move: the
    # observer feed and the service call these.
    # 2026-09-17: 569 -> 582, Friends phase 3 (safety). peer_text_screen_repository
    # (10: the hold insert and the parent's read of holds, the two pending
    # backlogs the cron sweep drains, the two settle writes, one read and one
    # hide each for a peer comment and a direct message) and
    # content_report_repository (3: one report by id for the takedown, and
    # the comment and message texts the moderation queue previews). routes/
    # and services/ did not move: the screen, the sweep, the takedown and the
    # parent's hide all read and write through these.
    # 2026-09-15 (later): 582 -> 585. The moderator's side of the same
    # feature: the Holds tab's read and the two counts the daily digest
    # emails (pending reports, holds in the last day), both count='exact'.
    # 2026-09-15 (evening): 585 -> 588. StorySourceRepository learns credit
    # classes: every live completion of a class the review credited as a
    # whole, and the live evidence document standing in for the review round
    # such a completion never had (POE 2026 could not become a story).
    # 2026-09-15 (parent refactor, phase 2): 588 -> 568. Fourteen dead
    # ParentRepository methods over two dropped tables, DependentRepository
    # .get_parent_dependents (the SQL function behind my-dependents) and
    # ParentDigestRepository.managing_parents / approved_links went; the new
    # FamilyRepository (two reads, one family at a time) came.
    # 2026-09-15 (training links): 568 -> 578. TrainingLinkRepository, the
    # Training page's view of org_resources rows flagged is_training: the
    # org's list, one owned row, the members a link can be aimed at by name,
    # the caller's acks and the report's acks, create/update/delete, and the
    # done mark and its undo on sis_resource_acks. routes/ and services/ did
    # not move: routes/sis/training_links.py read and wrote through this
    # (since M18, 2026-09-17, services/sis_training_service does).
    # 2026-09-15 (class chat screened): 578 -> 582. PeerTextScreenRepository
    # learns group_messages -- the pending backlog, the settle and the hide
    # the sweep needs -- and the group names a hold can carry. routes/ and
    # services/ did not move: group_message_service screens through the
    # service, and the superadmin tracker reads one SQL function.
    # 2026-09-15 (safety depth): 582 -> 601. ConversationReviewRepository
    # (the nightly review's threads, roles, names, transcript, record, the
    # report it files, and the tracker's counts), CsamIncidentRepository
    # (record, recent, mark_reported), one hold by id and the group message
    # a takedown hides on PeerTextScreenRepository, and the class chat text a
    # report previews on ContentReportRepository. routes/ and services/ did
    # not move: the upload gate, the review and the takedown all read and
    # write through these.
    # 2026-09-16: 601 -> 605. A friend's page and Collaborate on
    # PeerConnectionRepository: the live connection between two students
    # (active_between), the quests each is on (quests_in_progress), whether
    # a student is on a quest (is_on_quest) and a quest's title for the
    # invite (quest_title). services/ did not move.
    # 2026-09-15 (dead code sweep): routes/ 2292 -> 2285, services/ 1840 -> 1836,
    # middleware/ 3 -> 2, repositories/ -52. Whole modules nothing imported:
    # course_repository, course_quest_repository, curriculum_repository,
    # curriculum_lesson_repository, quest_completion_service, cost_tracker,
    # audit_logger, database_policy, datetime_helpers, name_utils,
    # response_helpers -- plus RegistrationRepository, a class with no caller,
    # and 60-odd helper functions across utils/ and services/ that nothing
    # referenced. On HEAD plus this sweep alone repositories/ counts 522; the
    # working tree also carried the class-chat and safety repositories above
    # when this landed, so the figure here is that session's number minus 52.
    # 2026-09-17: 553 -> 557. BugReportRepository.list_fixed and
    # list_awaiting_reporter_notice, the two reads the ticket deploy sweep
    # makes (services/ticket_finalize_service.py), then
    # ProductionDeployRepository.record and .latest, the one write and one
    # read behind the cron's replay of the last release report. Repository
    # calls, where they belong; routes and services did not move.
    # 2026-09-17: 557 -> 568. SisQuestLibraryRepository, eleven calls behind
    # the Quests page under Operations (routes/sis/quest_library.py): the
    # org's quests, their tasks, curriculum links, class links, the pickers,
    # and the one attach write, which routes/sis/curriculum.py now also uses
    # (routes fell by three in the same commit).
    # 2026-09-17: 568 -> 569. StaffTrainingRepository.set_sequence_order, the
    # one write behind the Training page's creator-set order (PUT
    # /api/sis/training/order); the links half of that order goes through
    # TrainingLinkRepository.update_link, which already existed.
    # 2026-09-17: 569 -> 570. QuestRepository.set_aside_enrollment, the one
    # write behind ending a quest below its XP finish line (POST /end sets it
    # aside instead of refusing); the route calls it, and writes nothing.
    # 2026-09-17: 570 -> 571. SisLearningDayRepository.choices_for_org, the
    # school-wide read of UFA learning-day choices the tuition queue needs to
    # price every pending student's week in one pass (M5, the one tuition
    # quote). A repository read, where it belongs; routes and services did not
    # move (the queue's other new read goes through sis_catalog_service).
    # 2026-09-17 (M4): 571 -> 577. EmergencyContactRepository gained the
    # funnel's replace (delete-by-source, the pre-column rows, delete, insert)
    # and SchoolEnrollmentRepository the funnel's enrollment write (statuses
    # for a list of students, upsert). New queries in the layer that owns
    # them; routes fell by three and services did not move.
    # 2026-09-18: 577 -> 579. HouseholdRepository.for_guardian — "which family
    # does this adult guard at this school", the question every path that
    # creates a child outside the registration funnel has to answer before the
    # child can join it. Two reads (the membership, then the primary-contact
    # fallback) in the layer that owns households; routes and services did not
    # move, and the new staff door's other lookups reuse UserRepository and
    # sis_service rather than adding queries above this layer.
    # 2026-09-18: 579 -> 584. repositories/sis_time_block_repository.py (the
    # school-day blocks as rows, M8b) and SisClassRepository.block_for_times,
    # which stamps class_meetings.block_id when a meeting is written.
    # 2026-09-18 (M16, second half): unchanged at 584. sis_attach_service
    # reads the guardian's household through the for_guardian above; the
    # funnel's and the admin path's copies of that lookup left routes/.
    # 2026-09-18: 584 -> 585. OrganizationRepository.names_for, the school
    # names beside a superadmin's cross-org credit queue.
    # 2026-09-18: 585 -> 586. SisQuestLibraryRepository.creators, who wrote
    # each library quest, so the office's library and teacher-made quests read
    # as two lists (ticket 4579be68).
    # 2026-09-18: 586 -> 587. TaskRepository.find_approved_on_quest_for_users,
    # every family member's list on one quest, so a child added to a
    # parent-made quest gets a copy of a sibling's tasks.
    # 2026-09-19: 587 -> 588. UserRepository.set_family_cover, one write that
    # points a whole platform family's rows at (or away from) the family
    # photo; the three direct users calls in routes/parent/family_cover.py
    # left routes/ for it and family_cover_pointers (which reuses find_by_ids).
    'repositories': 588,
    # 2026-09-09: 135 -> 136. class_membership.children_in_classes, the inverse
    # of parents_of_students: which of a guardian's children sit in each of a
    # set of classes. It answers "whose class chat is this?" for the messaging
    # list, and it belongs beside the rest of "who belongs to a class" rather
    # than in a repository nothing else would call.
    # 2026-09-07: 134 -> 135. Not growth -- pending_subjects_for_completion
    # moved here from routes/tasks/xp_helpers.py with its one query, because
    # PersonalizationService needs it and services must not import from
    # routes (test_import_layers.py). routes/ dropped by the same one.
    # 2026-09-10: 136 -> 144. Two modules whose entire job is answering one
    # question against the database, in the "small and mostly legitimate"
    # category the docstring describes:
    #   - utils/class_assignments (6): what a student's classes have assigned to
    #     them and when it is due. Three callers need the identical answer -- the
    #     home page's due chip, the class card's outstanding count, and the
    #     auto-end rule deciding whether a quest is schoolwork -- and the reason
    #     it exists is that they must never each grow their own version. utils/
    #     may not import repositories/ (test_import_layers) anyway.
    #   - utils/quest_completion.task_progress (2): the task and completion
    #     counts that feed is_quest_done, which already lives in this module as
    #     the one definition of "is this student finished". Putting the counting
    #     a layer away from the rule it feeds is how the teacher's grid and the
    #     student's own screen came to disagree in the first place.
    # 2026-09-10: 136 -> 139. The third parent-child link (household_members)
    # reaching class_membership.guardians_by_student (+2, one for the student
    # rows and one for their households' guardians) and children_of_parent (+1).
    # This module IS the shared answer to "who belongs to a class" and owns its
    # own reads by design -- the whole reason it lives in utils/ is that
    # repositories need it and may not import services.
    # 2026-09-15 (parent refactor, phase 2): 147 -> 145. children_of_parent
    # now derives from links_of_parent (same four reads, once);
    # token_authority.is_acting_as_still_authorized went with the acting-as
    # session (REGISTER GAP-3).
    'utils': 145,
    'jobs': 7,
    'middleware': 2,
    'modules': 1,
}

#: Layers where a direct call is a design violation rather than the design.
UPPER_LAYERS = ('routes', 'services')


def _count(layer: str) -> int:
    base = BACKEND / layer
    if not base.is_dir():
        return 0
    total = 0
    for path in base.rglob('*.py'):
        if '__pycache__' in path.parts:
            continue
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr == 'table'):
                total += 1
    return total


@pytest.mark.parametrize('layer', sorted(BASELINES))
def test_direct_db_calls_do_not_grow(layer):
    count = _count(layer)
    baseline = BASELINES[layer]
    assert count <= baseline, (
        f"Direct `.table(...)` calls in {layer}/ grew from {baseline} to {count}.\n\n"
        + ("New code in this layer should go through a repository "
           "(backend/docs/REPOSITORY_PATTERN.md); the layer below owns the query.\n"
           if layer in UPPER_LAYERS else
           "This layer legitimately talks to the database -- if the growth is a "
           "real migration landing, raise the baseline in the same commit.\n")
        + f"If the increase is deliberate, say so and update BASELINES[{layer!r}]."
    )


#: routes/ + services/ combined. A call may move DOWN a layer; the total may not
#: grow. Keep this equal to BASELINES['routes'] + BASELINES['services'].
UPPER_TOTAL_BASELINE = 2245 + 1833


def test_the_upper_layers_do_not_grow_in_total():
    """The rule the per-layer numbers are trying to express.

    Per-layer baselines can be satisfied by moving a call sideways, and one of
    them has to go UP for a legitimate route -> service extraction. This is the
    assertion that holds either way: above repositories/, the number of direct
    database calls only ever falls.
    """
    total = sum(_count(layer) for layer in UPPER_LAYERS)
    assert total <= UPPER_TOTAL_BASELINE, (
        f'routes/ + services/ together grew from {UPPER_TOTAL_BASELINE} to '
        f'{total}. Moving a call from routes/ into services/ is fine and does '
        'not change this number -- adding one does. New code above '
        'repositories/ should go through a repository.')


def test_the_upper_total_matches_the_per_layer_numbers():
    """Two baselines that can disagree will, and then neither means anything."""
    assert UPPER_TOTAL_BASELINE == BASELINES['routes'] + BASELINES['services'], (
        'UPPER_TOTAL_BASELINE drifted from the per-layer baselines. Update both '
        'in the same commit.')


def test_the_counter_actually_finds_calls():
    """A guard on the guard: a ratchet that counts zero passes forever."""
    assert _count('repositories') > 100, (
        'The counter found almost nothing in repositories/, which is where these '
        'calls are supposed to live. The scan is broken, not the codebase.')
