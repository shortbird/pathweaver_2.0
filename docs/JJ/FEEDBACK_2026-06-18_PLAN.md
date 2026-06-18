# The Treehouse — Jennie's Test Feedback → Implementation Plan

**Date:** 2026-06-18
**Source:** Jennie Jones (Treehouse org_admin/facilitator) hands-on test notes
**Companion to:** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [TREEHOUSE_STATUS.md](TREEHOUSE_STATUS.md)
**Scope:** v1 web (`frontend/`) + Flask backend. All changes org-gated to `slug='treehouse'` and additive (CLAUDE.md rule 7: include `superadmin` in every role check).

This is round-2 feedback after Jennie tested the built program. Most of it is
refinement of shipped features plus a few net-new asks. Items are grouped by
theme, each tagged with **current state** and a **proposed approach**, then
rolled up into priority tiers at the end.

Legend: ✅ exists · ◑ partial · ❌ missing · 🐛 bug

---

## A. Facilitator scoping & dashboard

### A1. Assign students to specific facilitators so each only sees their own kids' signals ◑
> "Will there be a way to assign kids to certain facilitators so we don't see the requests from every child on the days we aren't working?"

- **Current:** `org_classes` + `class_advisors` + `class_enrollments` exist (two cohorts already seeded: "Littles 5-7", "Bigs 8-13"). But the facilitator dashboard (`TreehouseFacilitatorPage.jsx`) Signals/Pins/Balances queues are **org-wide** — not filtered by the logged-in facilitator's assigned cohort(s). Notification fan-out (`backend/utils/treehouse.py`) also targets *all* org_admin/advisor users.
- **Proposed:**
  1. Add a cohort filter to the facilitator dashboard (defaults to "my cohorts" for advisors, "all" for org_admin/superadmin). Backend: filter `/api/treehouse/signals`, `/pins`, balances by `class_enrollments` for the requesting facilitator's `class_advisors` rows.
  2. Scope signal/completion notifications to the advisors assigned to that student's cohort (fall back to all org_admins if unassigned).
- **Effort:** MEDIUM. Cohort plumbing exists; this is query-filtering + a UI selector + notification targeting.

### A2. "Add student" shortcut on the dashboard (admin-only) ◑
> "Perhaps an 'add student' button from the dashboard… but this would be an admin permission only."

- **Current:** Adding students lives in the Organization tab (`OrganizationManagement.jsx` → `CreateUsernameStudentModal`, invite, bulk CSV). Jennie found it "a bit hidden."
- **Proposed:** Add an "Add student" button on the facilitator dashboard, visible only to `org_admin`/`superadmin`, that opens the existing create-username modal. No new backend.
- **Effort:** LIGHT.

---

## B. Student & family onboarding

### B1. Build student profiles fast without onboarding parents first ◑ (key ask)
> "If there was any way to build profiles quickly for all my students without needing to onboard the parents, and then later get them set up and assign their kids back to them, that would be sweet."
> "It tells me only parent accounts can add minor profiles."

- **Current:** Two distinct paths, and the confusion is that Jennie hit the **parent** one:
  - The **Family tab** (`ParentDashboardPage` → `AddDependentModal`) is parent-only by design — `backend/routes/dependents.py` enforces "Only parent accounts can manage dependent profiles." This is the wrong tool for a facilitator.
  - The **Org tab** already has exactly what she wants: `CreateUsernameStudentModal` → `POST /api/admin/organizations/{orgId}/users/create-username` creates an org-managed student (username + kid password, no parent, no email). This is the bulk-onboard path.
- **Proposed:**
  1. **Orientation/UX:** make the Org-tab create-username flow the documented "add my students" path; surface it via A2. Confirm it supports rapid repeat entry (and that the bulk CSV import covers a whole roster at once).
  2. **Later "assign kids back to parents":** build a **link-to-parent** flow so an org-created student can be connected to a parent account that signs up later, preserving the child's existing portfolio. Reuse `parent_student_links` / the dependent `add-login`/`promote` machinery (`dependents.py:435,512`). New endpoint: `POST /api/admin/organizations/{orgId}/users/{studentId}/link-parent` (by parent email/invite).
- **Note for Jennie:** her preference that "the portfolio stays with the child even if they leave Treehouse" is satisfied — the account is the child's; org membership is just a flag we can later detach.
- **Effort:** Onboarding/UX = LIGHT. Parent-relink flow = MEDIUM.
- **Decision needed:** is "facilitator bulk-creates now, parents link later" the agreed model (matches their Prism workflow), or do we want parents to self-register first? Recommend the former.

---

## C. Pins / badges (the biggest theme)

Jennie's mental model: a **"pin"** is a *predefined award with a custom image*,
organized into **"paths" = categories she defines** ("builders/crafters, nature,
kitchen, art studio, music studio"), grouped by **age cohort** so a child's board
auto-populates with the right level. This is a meaningfully bigger concept than
today's "pin."

### C1. "I still don't see where I create pins" — pin/badge definitions ❌
- **Current:** The legacy badge system was removed (Jan 2026). Today's Treehouse "pins" are **completion markers only**: when a student finishes a quest it lands in the facilitator Pins tab to be marked created/distributed. There is **no UI to author a pin/badge** (image, name, category).
- **Proposed (headline build):** introduce **org-defined pin definitions**:
  - New table `treehouse_pin_definitions` (`id, org_id, name, image_url, category_id, cohort/age_band, criteria → linked quest(s), created_by`). RLS + admin-client.
  - Facilitator UI to create a pin: name, **upload image** (see C3), pick category (C2), pick cohort, and **attach existing quest(s)** as the earning criteria (C4).
  - When the linked quest(s) complete, the existing ready-queue lights up against that pin definition (extends current Pins tab) and notifies the assigned facilitators (A1).
- **Effort:** LARGE. This is the anchor feature of the round.

### C2. Org-defined categories ("paths"/studios) instead of abstract pillars ❌
> "The categories you have… are too abstract for littles. I am making my 'paths' based on the spaces they work in… Perhaps leaving the categories open so schools can define those."

- **Current:** The 5 pillars (stem/wellness/communication/civics/art) are hardcoded system-wide and drive both portfolio categories and the `TreehouseBrowsePage` grouping.
- **Proposed:** New `treehouse_categories` (org-scoped: name, icon/color, sort order). Pin definitions (C1), quest browse grouping (E1), and cohort boards (C5) reference these instead of pillars. **Do not** rip out pillars globally — keep pillars as the platform XP taxonomy; layer org categories on top for display/grouping within the Treehouse tab only.
- **Effort:** MEDIUM (schema + admin CRUD + wire into browse/pins). Decoupling display-category from XP-pillar is the design crux.

### C3. Upload a custom image for a pin / quest thumbnail ❌
> "Will I be able to upload images to the quest thumbnail… I would like them to have the icon that is on the badge they earn." / "a way to easily add the image to their custom quest."

- **Current:** Quest header images are auto-fetched from Pexels (`image_service.search_quest_image`); no manual upload anywhere. Badge images don't exist.
- **Proposed:** Add an image-upload control (reuse the existing evidence/upload pipeline → storage bucket) used in (a) pin-definition creation and (b) the quest builder thumbnail field. Store `image_url`/`header_image_url`.
- **Effort:** MEDIUM (one reusable uploader, two call sites).

### C4. Quick-select existing quests → into a pin/badge "folder" ❌
> "I had already started building quests… if there was a way to quickly select those and transfer them into my pin/badge folder."

- **Proposed:** Falls out of C1 — the pin-creation UI includes a multi-select of the org's existing quests to attach as the pin's criteria. No separate feature.
- **Effort:** included in C1.

### C5. Pin groups → age cohorts auto-populate the right board ❌
> "If the pin options can be made as groups… assign kids to age cohorts and then their boards would automatically populate with the right level of pin options."

- **Proposed:** Pin definitions carry a cohort/age-band tag (C1). A student's "board" (their Find-a-Quest / pin display) filters to pins matching their `class_enrollment` cohort. Builds directly on `org_classes`.
- **Effort:** MEDIUM (depends on C1+C2).

### C6. Notify facilitator when a pin's quest is complete + check off when awarded ◑
> "When all tasks in a pre-defined quest/pin are finished, I would like the facilitator to be notified… Also a way to check off when the pin has been given."

- **Current:** Mostly built — quest-completion notifications exist; the Pins tab has a ready→created/distributed checklist.
- **Proposed:** Verify the notification fires per-pin-definition once C1 lands; keep the created/distributed checkoff. Mostly a wiring/QA item after C1.
- **Effort:** LIGHT (post-C1).

### C7. Student-designed pins (future)
> "Sometimes kids design their own pins, which could be a really cool feature."
- Defer. Captured as a future enhancement.

---

## D. Quest assignment & sequencing

### D1. Batch assign quests + batch select quests ❌
> "Batch assigning and batch selecting quests would be great… it didn't seem to allow batch selecting quests."

- **Current:** Assignment/invite is one quest → one student (`quest_lifecycle.py` enrollment/invitation). No multi-select.
- **Proposed:** `POST /api/quests/bulk-assign` accepting `{quest_ids[], student_ids[]}` (cartesian assign), plus a multi-select UI in the facilitator quest list. Rate/size-limit the payload.
- **Effort:** MEDIUM.

### D2. Orientation quest groups that unlock a second set on completion ❌ (net-new)
> "Assign a group of quests that then automatically opens a second set of quests once they are done."

- **Current:** No prerequisite/gating/sequence concept anywhere (confirmed by search). `class_quests.sequence_order` exists but isn't enforced as gating.
- **Proposed:** Add a **quest-group + prerequisite** model scoped to Treehouse:
  - `treehouse_quest_groups` (a named set, e.g. "Orientation") and `unlocks_group_id` (the set it opens).
  - On completion of all quests in a group for a student, mark the next group "unlocked" and reveal it in Find-a-Quest; locked groups render as a locked card.
- **Effort:** MEDIUM–LARGE. Pairs naturally with E1 (grouping) and C5 (cohort boards).

---

## E. Find a Quest / paths / AI behavior

### E1. Group quests by studio/space + limit options until orientation done ◑
> "A way to group the quests by the spaces… and a way to limit quest options until they finish certain 'orientation' quests."

- **Current:** `TreehouseBrowsePage` groups by pillar. No gating.
- **Proposed:** Re-key the browse grouping to org categories (C2); apply the unlock gating from D2. One integrated screen.
- **Effort:** MEDIUM (mostly C2+D2 composition).

### E2. "Earn a badge / earn a pin" language option ◑
> "Perhaps 'Find a Quest' to say 'Earn a badge' or 'earn a pin' for my littles."

- **Proposed:** Org-level label setting (display "pin"/"badge"/"quest"). Lightweight copy toggle, no engine change. Jennie noted she can also just explain it — so this is low-priority polish.
- **Effort:** LIGHT.

### E3. Pre-defined task options with icons inside a path; AI as opt-in layer ◑
> "Once I go into a path, it seems like AI is generating all new options. Can these be the pre-defined pins I create… and the kids could maybe say 'I need new options' and the AI would generate."

- **Current:** Entering a quest triggers AI generation of 10 tasks (`quest_personalization.py`). For littles this is too many, too variable, no icons.
- **Proposed:** Make AI generation **opt-in** for Treehouse: show the facilitator-authored task set first (with icons), with an explicit "I need new options" / personalize button that then calls the existing AI path. Reuse current generation; gate the auto-trigger behind the button for Treehouse students.
- **Effort:** MEDIUM.

### E4. Challenge-focused / concrete AI task language (observation)
> Pedagogy note about dry task wording ("Mindful Observation Walk").
- **Current:** Age-band prompt tuning already shipped (TREEHOUSE_STATUS "age-appropriate task generation"). Jennie is flagging tone, not requesting a build yet.
- **Proposed:** Track as a prompt-tuning backlog item; revisit with examples after more observation. No build now.
- Respect `feedback_ai_review_tone` (simple/kind, not cheesy) — she explicitly doesn't want it "too cheesy."

---

## F. Student task interface for littles

### F1. Simplified task view: big buttons + checkmark; "done" opens camera ◑
> "I would like them to see just their tasks in big buttons with a checkmark… when they click done, it could just open the camera right then."

- **Current:** Tasks open `TaskEvidenceModal` (multi-format editor, "Submit for XP"). Evidence-optional one-tap completion already exists for Treehouse (TREEHOUSE_STATUS). But the UI is still the full editor, not a littles-first big-button list.
- **Proposed:** A Treehouse "littles" task list: large task buttons with a checkmark; tapping done marks complete (evidence-optional) and **immediately opens the camera** to capture a photo that attaches to that task. Reuse the camera/upload flow from C3/G1.
- **Effort:** MEDIUM.

### F2. "I need help" / "I'm proud" buttons *inside* quests & tasks ◑
> "Ideally the buttons are inside their quests… ask for help right where they are stuck… say right there that they are proud."

- **Current:** Signals buttons live on the Treehouse **home** only (`TreehousePage.jsx`), not inside a quest/task.
- **Proposed:** Render the existing help/proud signal buttons inside the quest detail and task views, passing `quest_id`/`task_id` (the `treehouse_signals` table already has those columns). Pure surface change on top of the existing endpoint.
- **Effort:** LIGHT–MEDIUM.

### F3. Dismiss / save-for-later / "new option" with reason → AI scaffolds ❌
> "Can they save for later or ask for a new option? Maybe they say it sounds boring or hard or no supplies so AI can adjust."

- **Proposed:** Per-task actions: "save for later" (hide from active list), "skip/new option" with a reason chip (boring / too hard / too easy / no supplies / lost interest). Feed the reason into the AI regenerate call (E3) as context. Store the reason for facilitator insight.
- **Effort:** MEDIUM. Overlaps the My-Quests exit survey (H1).

### F4. "Generate steps" button on a task ◑
> "I think I would like that button here… option of asking for steps even on these."

- **Current:** Step generation exists elsewhere in the platform per Jennie ("I had seen a button that said 'generate steps'"). Confirm the endpoint and surface it on the Treehouse task view.
- **Proposed:** Add the generate-steps action to the task view (reuse existing AI step generation if present; otherwise small Gemini call).
- **Effort:** LIGHT if endpoint exists, MEDIUM if net-new.

### F5. Print task list / steps ❌
> "Having a 'print task list' option so kids can take their steps to their work stations."

- **Proposed:** A print-friendly view (browser print CSS) of a quest's task list / a task's steps.
- **Effort:** LIGHT.

---

## G. Facilitator evidence from a phone (Prism-style workflow)

### G1. Take photo → attach to a child's quest or journal → add text → move on; end-of-day batch upload + tag by name ◑
> "From the facilitator dashboard on a facilitator phone… easily take a photo, attach it to a child's quest or just journal it… upload them at the end of the day and link them to kids' portfolios by tagging their names."

- **Current:** Advisor "learning moments" capture exists (`backend/routes/advisor/learning_moments.py` → `learning_events` + evidence blocks, `source_type='advisor_captured'`). This is the right substrate, but there's no streamlined mobile capture screen and **multi-student tagging is not built** (listed in TREEHOUSE_STATUS "still to come" #2).
- **Proposed:**
  1. A one-screen mobile capture: camera → optional caption → tag one-or-many students → choose "journal it" or "attach to quest X." Reuse learning-moments backend.
  2. **Multi-student tagging:** fan-out one capture into N `learning_events` (one per tagged student) so a group photo lands in each portfolio.
- **Effort:** MEDIUM. This is the highest-value workflow item for daily use — recommend prioritizing alongside F1.

### G2. Student "I'm proud / camera" button on student home opens camera → folder ◑
> "Maybe the 'I'm proud of this' button would open a camera so they could take photos quickly… it just goes to their folder and the facilitator moves it where it belongs later."

- **Proposed:** Add a camera-capture path to the student "proud" action that drops a photo into the student's unfiled evidence/journal folder; facilitator files it later (ties to G1 tagging + F1). Distinguish "proud signal" (alert facilitator) from "capture photo" or combine.
- **Effort:** MEDIUM (shares camera + learning-events plumbing with F1/G1).

---

## H. My Quests cleanup

### H1. Cap or archive/remove quests; exit prompt with reasons ◑
> "If a child adds this many quests… cap it… or a way to easily remove/archive… ask 'are you taking a break or did you get what you want?'… too hard, lost interest, needed materials… so AI can offer new options."

- **Current:** Remove exists but it's destructive — `DELETE enrollment` reverses XP and loses started work. No archive, no cap, no exit survey.
- **Proposed:**
  1. **Archive** (non-destructive): hide from active list, keep progress/XP. New `status='archived'` on the enrollment (or `archived_at`).
  2. Optional soft **cap / declutter nudge** on active count for littles.
  3. **Exit survey** on archive/remove: "taking a break or done?" + reason chips → store reason, feed AI suggestions (shared with F3).
- **Effort:** MEDIUM.

---

## I. Kiosk / session

### I1. Auto-timeout back to the profile picker so kids don't leave quests open ❌
> "Can the system default back to the profiles page after it times out?"

- **Current:** No inactivity timeout anywhere. Kiosk has a manual "I'm done" hand-off.
- **Proposed:** Treehouse/kiosk-only idle timer (e.g. configurable N minutes) → returns to the kiosk student-picker and clears the scoped student session. Scope strictly to the kiosk context so it never affects normal web sessions.
- **Effort:** MEDIUM.

---

## J. Showcases

### J1. Edit a showcase after creation ❌
> "Is there a way for me to edit these? We design the showcase together so it might help to edit as they develop."

- **Current:** Create + roster + join exist; no edit endpoint.
- **Proposed:** `PATCH /api/treehouse/showcase/events/{id}` (title, theme, date, prompts) + edit UI in the Showcase tab.
- **Effort:** LIGHT.

### J2. Past showcases drop off the list automatically ❌
> "Will they disappear from the list when the dates pass so the dashboard stays relevant?"

- **Proposed:** Filter the active list to upcoming/today by default; move past events to an "archive"/"past" view. Pure query/UI.
- **Effort:** LIGHT.

### J3. Showcase collaborators logged in each kid's portfolio (nice-to-have)
> "A way to add collaborators… it would log it in the other kids' profiles."
- **Proposed:** Allow tagging co-presenters on a participant entry; write a portfolio/journal note to each tagged collaborator. Lower priority — Jennie says they can list collaborators in the title for now.
- **Effort:** MEDIUM. Defer.

---

## K. Coins

### K1. 🐛 Coin balance didn't update after awarding to Robin
> "I applied coins to Robin and it didn't appear to update after refreshing the screen."

- **Likely cause:** the adjust endpoint (`POST /api/treehouse/students/{id}/balance/adjust`) returns the fresh balance, but the Balances tab doesn't refetch/optimistically update after success. Could also be the adjust not persisting — needs reproduction.
- **Proposed:** Reproduce locally; add a refetch/optimistic update on success in the Balances tab; verify persistence in `yeti_balances`.
- **Effort:** LIGHT. **Low urgency** — Jennie isn't using coins with littles yet, but it's a real bug so worth a quick fix.

---

## L. School Jobs / bounty board

### L1. Control whether public bounties show by default ◑
> "Will the public bounty board options show up in here by default or can we keep those off?"

- **Current:** Bounty list has a cohort filter (`bounties.cohort_class_id` → `org_classes`) but no org-level "hide public/global bounties from our students" switch.
- **Proposed:** Org setting `treehouse: show_public_bounties` (default off for Treehouse) so students see only org/cohort-scoped School Jobs. Filter in `BountyService.list_bounties`.
- **Effort:** LIGHT–MEDIUM.

---

## Cross-cutting: permissions model Jennie described

Her Parent / Admin / Facilitator / AI breakdown largely matches the platform.
Two gaps worth confirming in build:
- **Admin-only** actions: add/remove students, assign students↔cohorts, assign
  facilitators↔cohorts, create pins/categories/paths, create orientation→unlock
  sequences, create showcases. (A1, A2, B1, C*, D2 must enforce org_admin.)
- **Facilitator (phone-first):** add evidence/journal entries + tag students,
  add evidence on completion, add students to a showcase. (G1, J1.)

---

## Priority tiers (recommended sequence)

**Tier 1 — high-value, mostly-built refinements (ship first, ~1–1.5 wk)**
- A1 cohort-scoped signals/notifications · A2 add-student shortcut
- F2 help/proud inside quests · J1 edit showcase · J2 past-showcase archive
- K1 coin refresh bug · L1 public-bounty toggle
- B1 onboarding orientation (Org-tab create-username) + document the model

**Tier 2 — core daily workflow (~2–3 wk)**
- G1 phone capture + multi-student tagging (highest daily value)
- F1 littles big-button task view + camera-on-done
- D1 batch assign quests · H1 archive + exit survey
- I1 kiosk idle timeout · E3 AI opt-in (predefined tasks first)

**Tier 3 — the pins/categories system (headline build, ~3–4 wk)**
- C2 org categories → C1 pin definitions + C3 image upload + C4 quest attach
- C5 cohort-grouped boards · C6 notify+checkoff wiring · E1 grouped browse
- D2 orientation→unlock sequencing
- E2 label toggle · F4 generate-steps · F5 print · F3 task skip/reason

**Deferred / observe:** C7 student-designed pins · E4 AI tone tuning ·
J3 showcase collaborators · B1 parent-relink (build when first parent needs it).

---

## Open questions for Tanner / Jennie

1. **Pins = full badge system?** C1–C5 is the biggest build and effectively
   re-introduces a (org-scoped, image-backed, category-grouped) badge system
   that was removed in Jan 2026. Confirm we want to build it now vs. a lighter
   interim (e.g. just custom images + categories on existing quests). *Recommend
   building it — it's the spine of her entire "paths/pins/boards" mental model.*
2. **Onboarding model:** facilitator bulk-creates students now, parents link
   later (matches Prism)? Recommend yes.
3. **Category decoupling:** confirm org categories are display/grouping only and
   XP pillars stay as the underlying taxonomy (avoids a global rewrite).
4. **Kiosk idle timeout length** and whether it applies only on kiosk devices.
5. **Coins philosophy:** Jennie is undecided on using coins with littles; K1 is a
   bug fix regardless, but don't invest further in the economy for Treehouse yet.
</content>
</invoke>
