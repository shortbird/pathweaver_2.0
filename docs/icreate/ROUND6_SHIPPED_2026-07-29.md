# iCreate rounds 6 & 7 — what shipped, and how to check it

**Date:** 2026-07-29 · **Live in production** · SIS console: <https://sis.optioeducation.com>

Covers the 13 in-app feedback items iCreate submitted on 2026-07-28, plus 2 more
that arrived that evening, plus the email-only teacher invite.

---

## Commits

| SHA | What |
|-----|------|
| `451fc88` | Audit of the 13 items + 33 clarification questions ([doc](FEEDBACK_ROUND6_QUESTIONS_2026-07-28.md)) |
| `d08cf92` | The round-6 build: Student Progress, Curriculum library, staff training, supply budgets, teacher documents, staff archiving, onboarding fixes, responsive nav |
| `e9c36a8` | Round 7: email-only teacher invites, quest delete vs unassign |

**Database:** `supabase/migrations/20260728_icreate_round6.sql` — **already applied
to production** and verified (3 new tables, 6 new columns, 2 constraints; all 17
existing bounties backfilled to `audience='students'`, so nothing changed for them).

**Tests:** 908 frontend passing. Backend unchanged against its pre-existing
baseline. 29 new tests added.

---

## Part 1 — What was built

### 1. Gradebook → Student Progress
**Where:** a class → **Student Progress** tab (teacher portal)

Molly asked *"What is the gradebook? Does it just automatically show if they do
the tasks?"* — it didn't. It was a manual score book nothing populated. It has
been replaced with a tab that reads what students have actually completed, so
there is nothing to fill in. One row per student, one column per assigned quest:
`Not started` / `3/5` / `Done`, plus a print view.

The old score data was **not deleted** — the API and tables are intact, just
unreachable from the UI. Old `?tab=gradebook` links redirect to the new tab.

### 2. Curriculum library
**Where:** **Operations → Curriculum** (admin), and each class's Curriculum tab (teacher)

A master list, independent of the timetable. Each entry holds a Google Drive
link and attaches to **many classes at once** — the four Reading Workshop
sections share one entry. Curriculum for a subject nobody teaches this term
still has a home, tagged *Not taught this term*.

**Staff-only.** Students never see it. It sits above the existing class
materials, which are the things a teacher shares *with* students.

> This directly answers Molly's 23:31 message asking for "a master list of
> curriculum for all the classes where I can assign it to teachers" — it shipped
> about ten minutes after she sent it.

### 3. Teacher training
**Where:** **Operations → Training**

Training is built out of quests, so the content is written in the normal
curriculum editor — videos included. Admins mark quests as training, flag them
required, and see a per-person completion table. Teachers see their own progress
and a "Start this course" link.

Teachers can now also **claim bounties** (previously students only). To keep the
boards apart, every bounty now has an audience: a teacher cannot claim a bounty a
parent posted for their child, and a student cannot pick up staff training.
Bonuses are still paid outside Optio, as agreed.

### 4. Supply budgets
**Where:** a class → Roster tab (teacher) · Settings + class edit (admin)

`supply fee × enrolled students` + an optional materials allowance funded from
tuition. Shown to teachers as **"spend up to $X"** — a ceiling, never a target.

Frozen once school starts, so a teacher who already bought supplies doesn't watch
the number drop when a student leaves. Before the first day it tracks enrollment
live. Waitlisted and withdrawn students never count.

Set the school-wide allowance in **Settings**; override per class in the class editor.

### 5. Teacher documents
**Where:** **My Documents** (teacher) · Secure Documents (admin)

Admins can now share a specific document with the person it's about — a contract
to sign, for example. **Off by default**: a background check does not become
self-service. Teachers see what was shared with them and can upload a signed copy
back, so there's no paper drop-off.

### 6. Staff archiving and deletion
**Where:** People → Staff → open a person → **Remove**

Archive hides someone and unassigns their classes. Hard delete only works when
they carry no attendance, timesheet, form, or onboarding history — which is what
makes it useful for the placeholder teachers created while hiring. The confirm
**names the classes** that will lose their teacher before you commit.

### 7. Onboarding fixes
**Where:** **Operations → Onboarding**

- **Delete a template** — the button was missing (the backend already supported it).
- **Unassign a checklist** — new. Uploaded documents are kept; an accidental
  unassign must not destroy a background check someone already sent.
- **"Needs Document" renamed** to **"They upload a document to us"**, which is all
  it ever meant. To give someone a document, use the item's link field.

### 8. Email-only teacher invites
**Where:** People → Staff → **Add teacher**

Adding a teacher now needs **only an email**. They fill in their own name and bio
on the welcome page while setting their password. Until then the staff list shows
the email's local part.

Two safeguards worth knowing:
- The name/bio write is ignored for an account that already has a name, so a
  normal password reset can never rename someone.
- The old duplicate-guard matched on *name*, so it can't fire any more. Because
  iCreate has ~20 placeholder teachers holding real class assignments, the add
  form now **names them** and points at *Link their account* instead.

### 9. Quests: unassign vs delete
**Where:** a class → Quests tab

"Remove" read like deletion; it's now **Unassign**, with a confirm saying the
quest stays in your library. **Delete** is separate and refuses in the two cases
where it would do damage: Optio-library quests are shared with other schools, and
a quest a student has already started would take their completed work and earned
XP with it — it tells you how many students and to unassign instead.

### 10. Smaller things
- **Teacher Resources** card on the teacher dashboard (the handbook was only
  reachable while an acknowledgment was pending).
- **Forms page wording** — teachers now read *"Submit your supply requests,
  incident reports, and more"*; admins keep the third-person version.
- **Tablet and phone layout** for the SIS console. It had a fixed desktop-width
  sidebar and no menu button, which is the likely reason the dashboard felt
  unreachable from My Classes.

---

## Part 2 — Questions answered, no build needed

| Question | Answer |
|---|---|
| What is the gradebook? Does it auto-show tasks? | It didn't — it was manual. Replaced with the automatic Student Progress tab. |
| Can teachers add videos to their quests? | Yes. Quest lessons support video, written in the normal curriculum editor. |
| Master curriculum list I can assign centrally? | Shipped — Operations → Curriculum. |
| Does everyone see ALL the quests? | A quest your teachers create is private to iCreate — no other school sees it. But it is visible across **your whole org's** catalog, not confined to one class. Say the word if you want class-only quests; that's a real change. |
| Can teachers upload their own documents? | Yes, now — My Documents. |
| How do I unassign an onboarding template? | Built. Onboarding → Staff progress → Unassign. |
| Can we delete templates? | Built. Onboarding → Templates → Delete. |

**Still waiting on you:** the teacher onboarding document, the mentor handbook,
and the *Elementary Academy Learning Day Options* doc. Nothing has arrived by
email or Drive.

**Parked at your request:** the curriculum feedback form.

---

## Part 3 — How to check it in the browser

Log in to <https://sis.optioeducation.com> as an iCreate org admin. Roughly ten
minutes end to end. If something looks wrong, note which step.

### A. Curriculum library — 2 min
1. Sidebar → **Operations → Curriculum**.
2. Click **Add curriculum**. Title it `Reading Workshop`, paste any Drive folder link.
3. Under *Classes using this curriculum*, tick **two or more** Reading Workshop sections.
4. Save.

✅ The entry lists every class you ticked. Adding it once covered them all.

5. Now open one of those classes: **My Classes → the class → Curriculum tab**.

✅ *Your curriculum* appears at the top with a working folder link, above the
student-facing materials.

### B. Student Progress — 1 min
1. Open a class that has quests assigned → **Student Progress** tab.

✅ A grid: students down the side, quests across the top, cells reading
`Not started` / `2/5` / `Done`. It says *"there is nothing to fill in."*

2. If a class has no quests yet, it should tell you to assign one on the Quests
   tab rather than show an empty table.

### C. Unassign vs delete a quest — 2 min
1. A class → **Quests** tab → **Assign a quest** → pick anything → assign.
2. Click **Unassign**. Read the confirm — it should say the quest *stays in your
   library*. Confirm.
3. Click **Assign a quest** again.

✅ The one you just unassigned is still in the list. Nothing was destroyed.

4. Assign it again, then click the **trash icon** (only on your school's own
   quests, not Optio library ones). The confirm should say *can't be undone*.

✅ If a student has already started it, you get a refusal naming how many
students, and the quest stays put. That's correct behaviour, not a bug.

### D. Supply budget — 2 min
1. **Settings** → set **Materials allowance per student** to e.g. `15`. Click away to save.
2. **Classes** → edit a class with students enrolled → set **Supply Fee** to `35`.
   Leave the allowance blank to inherit the `15`. Save.
3. Open that class in **My Classes** → Roster tab.

✅ A line reading **"spend up to $X"** where X = (35 + 15) × enrolled students,
with the breakdown beneath it.

⚠️ If your first-day-of-school date has passed, it says *fixed at the roster on
[date]* — that's the freeze working, not a stale number.

### E. Invite a teacher by email — 2 min
1. **People → Staff → Add teacher**.

✅ Only an **Email** field. No name, no bio. If you still have placeholder
teachers, an amber note names them and points at *Link their account*.

2. Enter an address you can open, and add them.

✅ Toast: *"Invite sent — they'll add their name when they set their password."*
The staff list shows them by the email's local part.

3. Open the invite email → the welcome page.

✅ It asks for **First name, Last name, a short bio**, and a password. Fill it in.

4. Back in **People → Staff**.

✅ They now show with their real name and bio.

### F. Teacher documents — 1 min
1. **Secure Documents** → upload any PDF, attach it to a staff member.
2. In the list, that row's **Shared** column shows **Private**. Click it → confirm.

✅ It flips to **Shared with them**.

3. Sign in as that teacher (or use *View portal*) → **My Documents**.

✅ The document is under *Shared with you*. Anything **not** shared stays invisible.

### G. Remove a placeholder teacher — 1 min
1. **People → Staff** → click a placeholder → **Remove**.

✅ The confirm **names the classes** that will lose their teacher, and offers
delete only if they have no history — otherwise it offers to archive and says why.

2. Cancel if you don't actually want to remove anyone.

### H. Phone / tablet layout — 1 min
1. Open the SIS on your phone, or narrow your browser window below ~1000px.

✅ A **menu button** (☰) appears top-left. Tapping it slides the nav out; picking
a page closes it. Previously the sidebar simply ran off the edge — this is the
likely cause of *"I'm not sure how to get back to the main dashboard."*

### I. Onboarding — 1 min
1. **Operations → Onboarding** → edit a template.

✅ The checkbox reads **"They upload a document to us"**, with help text
explaining the link field is how you give *them* a document.

2. Templates list → **Delete** on one you don't need.

✅ If it's assigned to people, it warns and names how many before letting you through.

3. Under **Staff progress**, click **Unassign** on an assignment.

✅ Warns if items are already done, and says uploaded documents are kept.

---

## If something's wrong

Everything above was verified by automated tests and against the production
schema, but **none of it has been clicked through by a person yet** — this list
is that first pass. The three most worth your attention, because they touch real
data in ways tests can't fully cover, are **D (supply budget maths)**,
**G (staff removal)**, and **E (the invite round-trip)**.
