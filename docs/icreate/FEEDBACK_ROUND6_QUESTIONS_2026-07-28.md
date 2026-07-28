# iCreate feedback round 6 — audit + clarification questions (2026-07-28)

Covers the **13 in-app feedback items submitted by Molly Christensen
(`dmchrplus@gmail.com`, org_admin — iCreate) on 2026-07-28**, all after the
[round-5 triage](FAB_TRIAGE_2026-07-27.md) was written. Every item was checked
against the current `develop` source before being classified — "already built"
claims below were read in code, not assumed.

Two sections:

1. **Audit** — what exists today for each item, so we don't rebuild it.
2. **Questions for iCreate** — the decisions we need before building. Grouped by
   theme, with a recommendation where we have one.

The round-5 deferred backlog (family portals, auto-promote waitlist, open-seats-
by-age report, embeddable catalog widget, AI-editor bugs, etc.) is still open and
is **not** repeated here. See the last question in §Q8 about ordering.

---

## Part 1 — Audit

### A. Teacher onboarding, training, and quests
*(items: two onboarding quests; training videos + bonuses/XP; "can teachers add
videos to their quests?"; teacher resources on the dashboard)*

| Thing asked for | State | Where |
|---|---|---|
| Assignable onboarding checklist w/ progress + approval | **Built** | `pages/sis/OnboardingPage.jsx`, `services/sis_onboarding_service.py`; nudge banner in `components/sis/SisLayout.jsx:33` |
| Videos inside quest lessons | **Built** | lesson steps accept `text` / `video` / `file` — `services/curriculum_lesson_service.py:63`; embeds render in `components/curriculum/LessonContentRenderer.jsx:125` |
| Teachers authoring lesson content | **Built, wrong doorway** | advisors may edit curriculum for their own org's quests (`services/curriculum_permission_service.py:184`) — but only through the learning-app Course Builder, not from the SIS portal |
| Teacher creating a quest from their class | **Built, tasks only** | `components/sis/ClassQuestsManager.jsx` creates a quest + preset tasks (title/pillar/XP/required). **No lessons, no video** from this surface |
| Training "bounties" for teachers | **Not possible today** | `routes/bounties.py` — non-students *post* bounties; claim/submit/complete are `@require_role('student', 'superadmin')`. A teacher account cannot claim one |
| XP / bonuses for staff | **Does not exist** | XP is the student model (`user_skill_xp`, diploma, portfolio). There is no staff points, bonus, or reward concept anywhere |
| General teacher resources area | **Built, not on the dashboard** | SIS Resources supports `audience = families / staff / all` (`pages/sis/ResourcesPage.jsx:300`) and teachers can open `/resources` (`components/sis/SisSidebar.jsx:78`). The teacher dashboard only links there when an acknowledgment is pending |

**Net:** the pieces exist but were built for two different audiences. Onboarding
is a *checklist*; quests are a *student* construct. Making teachers into learners
who earn XP/bounties is a genuine model change, not a wiring job.

### B. Curriculum tab + Google Drive
*(items: Curriculum tab in Operations; attach a Drive folder; show it in the
teacher portal; curriculum that isn't currently taught; "resources tab in each
class is probably what you were thinking")*

- **Built:** a per-class Curriculum tab — `components/discussion/ClassCurriculum.jsx`,
  backend `routes/sis/class_materials.py`. Teachers upload documents **and add
  arbitrary links**, so pasting a Google Drive folder URL works today.
- **Gap 1 — visibility.** Class materials are deliberately visible to **enrolled
  students** (`ClassCurriculum.jsx:110`). A teacher-only curriculum folder would
  currently be exposed to students. There is no teacher-only flag.
- **Gap 2 — no org-level library.** Everything is scoped to one class. There is
  no place for curriculum that exists but isn't being taught this semester, and
  no reuse across the 4 Reading Workshop sections — each section is a separate
  class row and would need the link pasted 4 times.
- **Gap 3 — no curriculum feedback form** (Molly flagged this as "later").

### C. Gradebook
*(items: "What is the gradebook? Does it just automatically show if they do the
tasks?"; "Can we change Gradebook to Student Progress?")*

**The premise is wrong, and this matters.** `components/sis/GradebookTab.jsx` is
**not** task tracking. It is a manual score book: assignment rows, `score` /
`max_score`, running average %, "Sequences" templates with a CLE-style workbook
generator, and a per-student print view. Its own header comment (line 19) says:
*"Scores are SIS record-keeping only — they never touch the XP/quest model."*
Nothing populates it automatically.

Meanwhile there is **no per-class view of quest-task completion** for a teacher.
Task evidence lands in `/submissions` and the student's portfolio.

So renaming Gradebook → "Student Progress" would put an auto-sounding label on a
manual score book **and** leave the thing she actually described unbuilt.

### D. Per-class supply budget
*(item: tell teachers their supply budget, "UP TO" framing, supply fee × students
plus an optional per-student allowance, later track spend)*

- `supply_fee` exists as a per-class dollar amount (`routes/sis/catalog.py:120`,
  surfaced on CLP, class export, Schedule Builder).
- **Nothing else exists.** No budget field, no per-student allowance, no spend
  tracking, no reimbursement ledger — `grep -i budget` over the SIS backend and
  SIS pages returns zero hits.
- Teachers do not see `supply_fee` at all in the teacher portal today.

### E. Secure documents / teacher contracts
*(items: can teachers upload their own documents; share a contract for signature;
upload a photo of the signed copy; remove the unsigned one)*

- `routes/sis/secure_documents.py` header, verbatim: *"ADMIN-ONLY (org_admin /
  superadmin). v1 has no per-person visibility — that's a follow-up."* The nav
  entry is `adminOnly` (`SisSidebar.jsx:81`). So: **no, teachers cannot upload or
  see anything here today.**
- **A partial path already works:** an onboarding checklist item with
  *Needs document* lets the teacher upload a file from their own portal into the
  private `staff-documents` bucket (`OnboardingPage.jsx:122`, `routes/sis/staff_portal.py`),
  and *Needs admin approval* gives you an approve/reject queue. That covers
  "collect a signed contract" without new infrastructure.
- Resource **acknowledgments** already exist with an ack report
  (`ResourcesPage.jsx`) — a lightweight "I have read and agree" trail.

### F. Onboarding template mechanics
*(items: what does "Needs Document" mean; how do I unassign; we can't delete
templates)*

- **"Needs Document" = the assignee uploads a file to you.** The checkbox is
  `needs_document` (`OnboardingPage.jsx:205`); on the teacher's side it renders
  an *Upload document* control. Handing a document *to* them is done with the
  item's **Link** field, or via Resources. The label genuinely doesn't say this.
- **Unassign: not built.** There is no DELETE for onboarding assignments.
  (`staff_admin.py:80` is a DELETE for staff *duty* assignments — different thing.)
- **Delete template: the backend already exists** —
  `DELETE /api/sis/staff-admin/onboarding/templates/<id>` (`staff_admin.py:153`,
  `sis_onboarding_service.delete_template` at line 102). **The UI just never got a
  delete button** (`OnboardingPage.jsx:321` renders only "Edit"). Quick win.

### G. Copy and navigation nits
*(items: /forms wording; "how do I get back to the main dashboard")*

- **Forms copy** — `pages/sis/StaffFormsPage.jsx:62` reads *"This is what teachers
  use to file incident reports, supply requests, and more."* It renders for
  everyone, teachers included. Her guess is right; her suggested wording is
  better for the teacher view. Trivial, role-aware fix.
- **"Back to the dashboard"** — the SIS sidebar *does* have a Dashboard link
  (`SisSidebar.jsx:50`), and `/my-classes/:id` has a "← My Classes" link
  (`TeacherClassPage.jsx:113`). Two real possibilities:
  1. **The SIS console has no responsive layout.** `SisLayout.jsx:98` is a hard
     `ml-60` beside a `fixed w-60` sidebar with **no mobile breakpoint and no
     hamburger** — on a tablet or narrow window the nav is cut off or overlapping.
     This is a genuine bug and would explain "I can't find my way back."
  2. As an **org_admin**, "My Classes" is filtered *out* of her sidebar
     (`teacherOnly`, `SisSidebar.jsx:64/143`), so if she reached `/my-classes`
     by URL rather than by teacher preview, the nav around her was the admin nav.

### H. Placeholder teachers
*(item: "it might make more sense for us to just delete the placeholder teachers")*

- Placeholder staff rows exist and can be **linked/merged** into a real account
  when the person is hired (`components/sis/TeacherModal.jsx:145`,
  `routes/sis/__init__.py:115`).
- **There is no delete-staff endpoint anywhere under `routes/sis/`.** Nothing can
  remove a staff row today.
- Classes point at staff via `org_classes.primary_instructor_id`, so deletion has
  a real referential question behind it (below).

---

## Part 2 — Questions for iCreate

### Q1. Teacher training and onboarding — one system or two?

Right now onboarding is a **checklist** (assign, track, approve, upload) and
quests are a **student** thing (XP, portfolio, diploma). Your two-quest idea
crosses that line.

1. Is it fair to say **onboarding stays a checklist** (it's what tracks who has
   done what, and lets you approve items), and what you want as a *quest* is the
   **training content** — handbook, videos, "Classroom Management", "Whole Brain
   Learning"? That's our recommendation.
2. **Teacher bonuses — money or points?** If money, does it need to reach payroll
   / the timesheet export, and who approves it? If points, we'd be inventing a
   staff-XP concept that doesn't exist today (student XP feeds diplomas and can't
   be reused as-is).
3. **Bounties won't work without a model change** — only students can claim a
   bounty today. Is a teacher-claimable bounty worth that change, or is "optional
   training quests + a bonus you pay outside Optio" enough for this year?
4. Do completed trainings need to produce a **record you can show an accreditor
   or UFA** (date, hours, certificate), or is an internal checkmark enough?
5. **Videos**: upload the files into Optio, or embed YouTube / Vimeo / Drive
   links? Embeds are supported today and cost nothing; hosted uploads mean
   storage and size limits. Which do you actually have?

### Q2. Who builds the training quests?

Teachers *can* author lessons with video for iCreate's own quests — but only via
the learning-app Course Builder, not from the SIS teacher portal, and the SIS
"create quest from my class" flow makes tasks only (no lessons, no video).

6. For **training quests**, is iCreate staff the only author (you build them,
   teachers consume)? If so we can skip teacher-facing authoring entirely.
7. For **class quests**, do teachers need to add lesson content/videos
   themselves, or is assigning existing quests + writing tasks enough for now?

### Q3. Curriculum tab

8. **Visibility — please confirm.** Today a class's Curriculum tab is visible to
   **enrolled students**. If you drop a teacher's Drive curriculum folder in
   there, students see the link. Do you want a **teacher-only** curriculum area
   separate from student-facing class materials? (We recommend yes.)
9. **Reuse across sections.** You made 4 sections of Reading Workshop. Should
   curriculum attach **once to a subject** and every section inherit it, or be
   pasted per section? (We recommend attach-once, since you'll keep refining the
   folder.)
10. **Drive access.** Optio can store and show the link, but it cannot control who
    can open the folder — that's Google's sharing settings. Are you comfortable
    managing folder access in Drive yourself, or were you expecting Optio to
    grant/revoke teacher access automatically? (The latter is a much bigger build:
    a Google Workspace integration.)
11. Does a curriculum entry **persist year to year** (and get reattached to next
    year's class), or is it per school year?
12. The curriculum **feedback form** you mentioned for later — should we design
    the data model to expect it now (one form per teacher per curriculum per
    term), or leave it out entirely?

### Q4. Gradebook — this one needs a decision

The Gradebook is a **manual score book** (scores, percentages, CLE-style workbook
sequences, printable), not automatic task tracking. Renaming it "Student
Progress" would make it *sound* automatic when nothing populates it.

13. Which do you want?
    - **(a)** Rename only — accept it stays a manual score book called "Student
      Progress".
    - **(b)** Replace it with a real auto view of quest-task completion per class.
    - **(c)** *(recommended)* **Both tabs**: a new **Student Progress** tab that
      auto-shows each student's quest/task completion for that class, and keep
      the score book — renamed something honest like **Scores** or **Grades** —
      for the academic classes that need numbers.
14. **Does iCreate need numeric scores at all?** If nobody is entering scores,
    (b) is simpler and we delete a surface. If the CLE-style workbook sequences
    are in real use, we keep it.
15. Any **transcript, report-card, or UFA private-school reporting** obligation
    that depends on scores? That would settle 13–14 immediately.

### Q5. Supply budget

16. Is `supply_fee` charged **per student per year**, or per semester/term? The
    whole multiplier depends on this.
17. Enrollment moves. Should the displayed budget be **live** (recomputed as
    students enroll and drop), or **frozen** on a date (e.g. first day of school)
    so teachers can plan against a fixed number? (We recommend frozen, with the
    live number visible to admins.)
18. Do **unpaid or waitlisted** students count toward the budget?
19. The extra "up to $XX per student included in tuition" — is that a **default
    for the whole school with a per-class override**, or set individually on
    every class? Same question for whether it varies by program (Summit vs
    regular).
20. Who sees it: **primary teacher only**, or assistant teachers too?
21. **Spend tracking** (your "later"): is that teachers submitting **reimbursement
    requests** — which could ride on the existing Forms flow, where "supply
    request" is already a form type — or just a number an admin types in? The
    first is a real workflow; the second is a field.

### Q6. Teacher documents and contracts

22. **Would this cover it?** Add a "Signed contract" onboarding item with the
    unsigned contract attached as a **Link**, *Needs document* ticked (they upload
    the photo of the signed copy) and *Needs approval* ticked (you approve it).
    That works today with a labeling fix and no new system. Or do you want a
    general **teacher document area** separate from onboarding?
23. **Who may see what?** Secure Documents currently holds background checks and
    custody/medical files. If teachers get access, they must see *only their own*
    documents, and probably not everything admins filed about them. Confirm:
    teachers see documents **you explicitly share** with them, nothing else?
24. **The unsigned copy.** You asked whether it can be removed once the signed one
    arrives. Do you want it **auto-removed**, **manually removable**, or **kept as
    a version** for records? Employment contracts often want the full trail —
    worth a moment's thought before we make deletion easy.
25. **E-signature.** You said your signing tool is a pain because every contract
    needs its fields configured. Would a lightweight **in-app acknowledgment**
    ("type your full name + I agree", timestamped, with a report of who signed)
    be acceptable for some documents, or must everything carry a real wet or
    e-signature on the PDF? We already have acknowledgment tracking for Resources.

### Q7. Onboarding template mechanics

26. **"Needs Document"** — we'll relabel it. Which is clearer: keep one checkbox
    renamed **"They upload a document to us"**, or split into two explicit
    options — **"We give them a document"** vs **"They give us a document"**?
27. **Unassigning.** If a teacher has already completed items and uploaded files
    and you unassign the checklist, should their uploads be **deleted** or
    **archived/retained**? (We recommend retain — accidental unassign shouldn't
    destroy a background check.)
28. **Deleting a template** that is currently assigned to people: **block the
    delete** with a warning ("assigned to 4 staff"), or delete the template and
    leave the assignments intact? (We recommend block.)

### Q8. Placeholder teachers, nav, and ordering

29. **Blocking for delete:** what should happen to the **classes a placeholder is
    assigned to teach**? Options: (a) unassign and show "Teacher TBD", (b) refuse
    to delete while assigned, (c) delete and leave the class instructor blank
    silently. (We recommend (a) with a confirm that names the classes.)
30. **Delete or deactivate?** A hard delete removes them from attendance history,
    timesheets, and onboarding records that reference them. We'd suggest
    **archive/hide** by default and reserve true delete for rows with no history.
    Is archive enough for what you're trying to clean up?
31. Should the **parent-facing class catalog** show "Teacher TBD" or hide the
    teacher line entirely for unassigned classes?
32. **Navigation** — when you couldn't find your way back to the dashboard from
    `/my-classes`: what **device and window size** were you on, and were you in
    **teacher preview** at the time? We found that the SIS console has **no mobile
    or tablet layout at all** (fixed sidebar, no hamburger) — if you were on an
    iPad or a narrow window, that's the bug and we'll fix it as a responsive-nav
    task rather than adding another link.
33. **Ordering.** These 13 items sit on top of the still-open round-5 backlog
    (family portals, auto-promote waitlist, open-seats-by-age report, embeddable
    catalog widget, the supply-fee-overwrite bug, the AI schedule editor not
    applying instructions). **What has to be working before your first day of
    school, and what can wait until the term is running?**

---

## Blockers — documents we still need

- **The teacher onboarding document** Molly referenced ("Hopefully the teacher
  onboarding document is helpful for you to see what I'm thinking of having them
  do"). It has **not** arrived — no attachment on any email from
  `dmchrplus@gmail.com` or `icreatecollab@gmail.com` in the last two weeks, and
  nothing matching in Drive.
- **The mentor handbook** — referenced as the content for onboarding quest #1.
- Still outstanding from round 2: the **"Elementary Academy Learning Day Options"**
  document (blocks the at-home learning-day form —
  see [feedback-2026-07-21-ufa-clp.md](feedback-2026-07-21-ufa-clp.md)).

## What we can ship without waiting on answers

These are unambiguous and don't depend on anything above:

1. **Delete template** button on the Onboarding page — the backend endpoint
   already exists and is unused.
2. **"Needs Document" relabel** + helper text explaining upload-to-us vs the Link
   field (pending the wording choice in Q26).
3. **Forms page copy** — role-aware, using Molly's wording for the teacher view.
4. **Teacher Resources card** on the teacher dashboard, surfacing `audience =
   staff / all` resources (the data and the page already exist).
5. **Responsive SIS layout** — hamburger + drawer nav below `md`. This is a real
   defect regardless of what caused Q32.

---

_Audit performed against `develop`, 2026-07-28. Feedback source: 13 in-app
`bug_reports` submissions relayed to `tanner@optioeducation.com`, report IDs
`9bb1316b`, `3aee148d`, `daf900a2`, `dacfb4e0`, `ccfadae8`, `2e852cff`,
`a139db7e`, `0be58159`, `c4f86e34`, `bb33a84c`, `8d265190`, `ffb5f93f`,
`e77fd7ca`._
