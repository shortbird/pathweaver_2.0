# Feedback backlog reconciliation — 2026-08-06

The in-app feedback table had **55 rows still marked `new`**, some going back to
early June. Most were not actually open: rounds 6 through 10 shipped the thing
and nobody went back to close the row. That makes the queue useless — a backlog
you can't trust is one you stop reading.

Every one of the 55 was checked against the code, not against memory. Result:

| Outcome | Count | Meaning |
|---------|-------|---------|
| **Resolved** | 21 | Verified shipped. Each row's note names what shipped and where. |
| **Triaged** | 15 | Partly shipped, or a confirmed-open bug with a diagnosis. |
| **Still `new`** | 19 | Confirmed not started. Each now carries a "reviewed 2026-08-06" note so the next pass starts here instead of re-deriving it. |

Nothing was closed on a guess. Where the evidence was a UI string or a code
path, the note quotes it.

---

## Closed as already shipped

| What they asked | What it turned out to be |
|-----------------|--------------------------|
| Back to the dashboard from My Classes | `BackToDashboard` on all nine teacher-portal pages (round 8 follow-on) |
| A schedule view in the teacher portal | My Schedule — the week view |
| Rename Gradebook | The tab is already "Student Progress" |
| "What is the gradebook?" | Answered by that rename: it fills in as students complete tasks |
| Forms page wording | Teachers read "Submit your supply requests, incident reports, and more." |
| See which classes are closed | "Closed" badge on the class list, plus FULL |
| Stacked sorting on the class list | Sort is a list of keys — day then time keeps the day order |
| A curriculum tab with a Drive link | The Curriculum library: link the folder once, attach it to classes |
| A master curriculum list | Same library — attach from one screen, never per teacher |
| Curriculum + quests on the class page | Both tabs exist |
| Unassign a checklist / delete a template | Both, with the "keeps their checklists" guard |
| Delete and unassign quests | Deliberately two actions: off-this-class vs delete-from-library |
| Supply budget per class | Shipped round 8 in the exact formula asked for, labelled "up to" |
| What "Needs Document" means | Answered in the form's own copy |
| Calendar audiences | school / teachers / admins, with families seeing only school-wide |
| Teachers uploading their own documents | My Documents, split "from the school" / "from me" |
| W2s and background checks | Secure Documents — private bucket, signed URLs |
| Materials allowance per class | Already on the class editor; Settings is the default, not a cap |
| Waitlist → offer another section | Rounds 8 and 9 |
| Teacher training with videos and completion | Staff Training, built out of quests — exactly the guess in the report |
| Family directory opt-out (×2 duplicates) | Shipped in round 10 |

## Triaged — partly done, or open with a diagnosis

The two that matter most:

**The AI schedule editor writes the wrong money field.** Three reports
(`a704b2b4`, `c2f5d8d0`, `c6c8337f`) are one bug: asked to set a supply fee on
four classes it changed none of them, and put `$35` into *tuition* on one. This
is the highest-severity item in the backlog — a silent wrong write to a money
field is worse than a refusal. It needs the editor to name every class and every
field it will touch before it writes, and to refuse rather than guess a field.

**iOS media upload fails** (`47dfbec5` photos, `354df1ec` video), both from a
student on build 20. Reproduce on a current build before diagnosing — build 20
predates several media changes.

Also triaged: waitlist age-group toggles (per-student release works, the
group-level switch and the parent-facing "will be waitlisted" message don't),
attendance assume-present plus the excused/absent reconciliation Kate needs,
switching enrolled families between sections, deleting placeholder teachers
safely, the family-portal preview (Kate showing a parent their own portal during
a CLP), and the Stripe key being masked and validated but not yet moved or
guarded.

## Still open, confirmed not started

Six mobile/feed direction items from June, and thirteen iCreate requests:
document replace syncing to Resources, class-edit scroll position, assigning
review items to people, the family calendar as a calendar, waitlist limits, Open
Lab caps, non-class schedule items, a Family staff tag, discussion boards,
embeddable website widgets, Optio courses attached to classes (and teachers
editing them), and the capacity-by-age report.

---

## Keeping it reconciled

The reason 55 rows drifted is that shipping and closing were separate acts. From
round 10 the round docs close their rows as part of shipping. If a row is closed
without a note naming what shipped, treat that as unclosed.
