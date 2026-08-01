# iCreate round 8 — the 2026-07-29/30 feedback, and what happened to each item

**Date:** 2026-07-31 · SIS console: <https://sis.optioeducation.com> · Learning app: <https://www.optioeducation.com>

Twelve in-app reports arrived between 2026-07-29 04:34 and 2026-07-30 22:36 from
`dmchrplus@gmail.com`, `homeschool@completelee.com`, and `katechr2@gmail.com`.
Five were already fixed earlier in the week; the other seven are this build.

---

## Already fixed before this build

| Filed | Item | Where it was fixed |
|-------|------|--------------------|
| 07-29 18:22 | Approve a schedule from the CLP meeting page | `a331d0c` |
| 07-29 21:58 / 22:02 / 22:20 | Class enrollment counts drifting (`12/12` → `0/12`, roster vs count vs waitlist) | `598c401`, `750245b`, `14c101e` — PostgREST was silently truncating org-wide reads at 1000 rows. [Postmortem](FAB_TRIAGE_2026-07-29_enrollment_counts.md) |
| 07-30 18:10 | "She gets logged out every time she opens the app" | `5487041` — three client paths were throwing away a still-valid session on a transient failure. [Audit](../SESSION_LOGOUT_AUDIT_2026-07-30.md) |

The Lego Robotics case from 22:20 (`13/15` shown, 14 on the roster, a parent who
believed her son was waitlisted) is resolved in the data: Van Stanfill is
actively enrolled, the class reads 14/15, and no iCreate student is now both
enrolled in a class and queued for it.

---

## What shipped in this build

### 1. Waitlist offers that staff can actually finish

> "We can't add people into a class from the waitlist that got offered a seat.
> They also can't accept the offer. And, we have waitlisted people that get
> offered a seat and it has expired before we can get them into the class."

Three separate defects, all in one place: the class's **Waitlist** tab listed
people and a status word, and the only action was *Offer next seat*, which by
construction can only reach the front of the queue.

- **Enroll now** — admit a named student immediately, without waiting for the
  family to claim. Deliberately not blocked by a full class: an admin doing this
  by hand *is* the override.
- **Offer again** — hand the seat back to someone whose offer lapsed or who
  declined. An expired entry used to be unreachable forever (`Offer next seat`
  looks at `waiting` only), so a lapsed offer was a dead end.
- **Remove** — take someone off the list.
- **The offer window is now 7 days**, not 48 hours; iCreate kept losing offers to
  a weekend. An org can set its own with
  `feature_flags.sis_settings.waitlist_offer_ttl_hours`.
- Each row now shows a plain status (`Offered`, `Offer expired`, `Waiting`) and
  the time left on a live offer.

Related fixes to the same tangle:

- **Enrolling a student anywhere now clears their waitlist entry for that class**
  (staff roster add, re-registration, age-exception approval). A child who was
  both on the roster and "Waitlist #2" is what made the numbers look haunted.
- **A student who is already enrolled can never be queued** for the same class.
- If a family clicks **Claim spot** and the seat was filled in the meantime, the
  org admins now get a notification saying so, so the office can admit them with
  *Enroll now* instead of the family hitting a dead button in silence.

### 2. Removing a person from the school

> "I deleted the duplicate swenson family, but three members of that family are
> still showing and Idk how to remove them."

Deleting a family removes the household and its member links — on purpose, so a
mis-typed family name never takes real students with it. But nothing could then
remove the leftover **accounts**, and a duplicate registration leaves three of
them.

**People › Everyone › ⋯ › Remove from school** now exists for students and
guardians (staff already had this on the Staff page, and are routed through that
same code path). It checks what the account is attached to first, then offers:

- **Archive** — a student is marked withdrawn and their class seats are freed; a
  guardian is detached from the school. The account and its history survive.
- **Delete permanently** — only offered when the account has no attendance, no
  completed work, no registrations, and no children linked to it. This is the
  duplicates-and-typos case.

The family-delete confirmation now says where the accounts end up, and points at
this action.

### 3. Health alerts on class rosters

> "On the alert that you have on students on the class rosters, some of those
> have an alert but they have no allergies! Also I wonder if you can make those
> clickable? Hovering doesn't always seem to work."

Both real, and the first one was ours: the roster flagged an alert whenever the
allergies or medications field was non-empty — and 55 iCreate students had a
parent-typed **"None" / "none" / "NA" / "N/A"** sitting in that box. A red badge
on students with nothing to report teaches teachers to ignore the badge that
matters.

`utils/blank_values.py` now decides what counts as an answer (shared with the
allergy report, which already knew this), and the roster uses it. "No nuts" and
"none except dairy" are still content — only exact ways of saying *nothing* are
treated as blank.

The badge is now a **button** that opens the detail inline. A `title` tooltip
never appears on the tablet teachers actually take attendance on.

### 4. People CSV export

> "When exporting a CSV file from the People page, it doesn't include grade
> level, just the column for it. I had it filtered for students only and by what
> age, but it included parents and didn't show age on the CSV."

The export called a server endpoint that dumped the whole organization, so the
on-screen filters did nothing to it, and it had no Age column at all — while
iCreate records ages, not grade levels (0 of their `school_enrollments` rows
carry one; 193 of their people have a date of birth).

Export now writes exactly the rows on screen — same search, same filters, same
sort — and carries **Age** and **Date of Birth** alongside the existing columns.
Grade Level stays for schools that use it.

### 5. Calendar events in more than one category

> "With the color coding on the calendar, can we make it so that we can choose
> more than one category? Some things will belong in more than one category."

Events take a list of categories now. The first one is the primary: it colours
the event on the grid and drives the per-category ICS feeds, and the others show
as coloured dots after the title (hover names them all). Filtering by a category
keeps every event that carries it, not only the ones where it happens to be
first. Family-facing event views show all of an event's categories.

Migration `20260731_sis_event_multi_category.sql` — **already applied to
production** and verified: `categories text[]` on `sis_events`, backfilled from
the existing `category` (7 of 54 events had one), plus a GIN index.

### 6. Curriculum library as a sortable table

> "I'm wondering if maybe we can sort the pages more like the class list … class
> title, ages, subject, folder link and then be able to sort it by those topics?
> And then it could have a drop down like it does in the classes if it needed
> more info?"

The library is now a table: **Title · Ages · Subject · Classes · Folder**, every
column sortable, with the description, staff note, and the list of classes using
the entry behind a per-row disclosure. Ages are inherited from the classes that
teach the curriculum (an entry nobody teaches this term shows *Not taught this
term* and sorts last by age).

### 7. Deleting a quest that was never assigned

> "Being able to delete a quest you have created. (This is a teacher request
> from one she started creating last year and she wants it gone and try creating
> a new one)"

Quest deletion shipped on 07-29 (`e9c36a8`) but only on quests **assigned to a
class** — an abandoned draft that never made it onto one still had no way out.
The assign picker now offers Delete on the school's own quests, so a teacher can
clear a draft without assigning it first. The API guard is unchanged: an
Optio-library quest can't be deleted, and neither can one a student has started.

---

## The batch that arrived mid-build (2026-07-31 00:25–00:30)

Five more reports landed while this was being written. All five are in.

### 8. "When we click Offer next seat … we can't put them in the class either"

> "the person gets a notification that they have come up on the waitlist.
> However, they have no way to actually get their kid in the class, and we can't
> put them in there either. We need something that will help us get them in the
> class."

This is exactly item 1 above — **Enroll now** on the class Waitlist tab, and the
same button on the CLP screen (below). It also confirmed the diagnosis: the
notification went out, and nothing on either side could finish the job.

### 9. Who has finished their CLP, and whose schedule still needs approving

> "Can we get a list somewhere that shows who all has completed their CLP? And a
> list of everyone who needs their schedule approved still?"

The CLP student picker now has four lenses with live counts: **Everyone · CLP to
do · CLP done · Needs approval**. Same list you already work from, filtered.

*Needs approval* includes students who never submitted anything, not just the
ones waiting in the queue — in a CLP meeting the schedule is built live with the
family and never goes through the Schedule Builder, so "no submission" is the
normal state of an unapproved schedule.

### 10. Open requests, on the meeting screen

> "It would be helpful to have any waitlist or age exceptions that parents have
> requested listed here somewhere. Maybe to the left of the schedule?"

An **Open requests** panel now sits above the weekly schedule (staff-only —
never rendered with the screen turned toward the family). It lists the student's
live waitlist places and pending age-exception requests, each actionable in
place: *Enroll now* / *Remove* for a waitlist place, *Approve* / *Decline* for an
exception.

### 11. What Approve Schedule does to open requests

> "What happens when we hit Approve Schedule? Does it take students off the
> waitlisted classes? Cuz it should!" and "If someone's schedule is approved,
> then I think it should also remove the age exception requests."

- **Age-exception requests are now closed by the approval**, recorded against
  what the approved schedule actually says: the student is in that class →
  approved; they aren't → declined. Nothing is enrolled or dropped, because the
  approval already settled the roster.
- **Waitlist places are deliberately kept.** An approved schedule doesn't tell
  us the family stopped wanting the seat they're queued for, and dropping them
  would lose their place in line — so approving now *reports* them instead:
  "Schedule approved · 1 age exception closed · still on 1 waitlist", with the
  rows one click away in the Open requests panel. **If iCreate does want approval
  to clear waitlist places outright, say so and it's a one-line change** — we
  didn't want to guess at something irreversible.

### 12. Private-school status during the CLP

> "we also would love to know who is private school and who is not. Likely that
> should be added during registration (at least for next year.) For now, maybe we
> could check the box during the CLP and/or let parents select that in their
> portal?"

The field already existed (`households.enrolled_private_school`, shown as the
School pill on the CLP screen) but could only be *set* on the Families page. The
pill is now a toggle on the meeting screen — click it to set or clear the school
of record, right in the meeting. It stays read-only in presentation mode.

The other two options are open questions: adding it to the registration funnel
for next year, and letting parents set it themselves in their portal. Say which
you want and they're small.

---

## Follow-on fix: "Offer next seat" on a waitlist with nobody waiting

> "It says 'offer next seat' on brain games thurs for 1 on the waitlist, but when
> I click on it it says no one is waiting." *(02:38, after the round-8 deploy)*

Real, and older than round 8. A class row's **Waitlist** count is the whole live
queue — `waiting` **plus** `offered` — but only a `waiting` entry can be handed a
seat. Brain Games 8‑11 (Thu Block 2) had exactly one entry and it was already
`offered`, so the row said *1*, the button appeared, and the answer was "no one
is waiting". Three iCreate classes were in that state.

Fixed on all three surfaces so the number and the button can't disagree:

- The class list now knows the difference (`waitlist_waiting` /
  `waitlist_offered`), and the row shortcut only appears when someone is
  genuinely waiting.
- The count says what it's made of: **1 offered**, or **3 · 1 offered** for a
  mixed queue.
- When there is nothing to offer, the API explains rather than denying the queue:
  *"1 student on this waitlist already has an offer out. Open the Waitlist tab to
  enroll them now or offer again."* The Waitlist tab's own button is disabled
  with the same explanation.

The way forward in that state is round 8's per-entry buttons — **Enroll now** or
**Offer again** — which is exactly what the message points at.

---

## Follow-on fix: no way back to the teacher dashboard

> "No way to get back to the dashboard from this page." *(/my-classes)*
> "No way to get to the teacher dashboard from this page." *(/forms, /onboarding)*

Three reports in two minutes. The sidebar does carry a Dashboard link, but it is
generic nav that sits behind a drawer on a narrow screen — the class page's own
**← My Classes** is the pattern people actually find, and nobody has ever filed
a report about that one.

Every teacher-portal page now opens with the same back-link: My Classes, Forms,
Onboarding, My Schedule, My Documents, My Time, My Profile, Directory.

The label follows what `/` will actually render for the viewer. A teacher — or
an admin previewing a teacher's portal — gets **← Teacher dashboard**. An admin
who is *not* previewing lands on the School Dashboard, so they get **← Dashboard**
rather than a promise the app won't keep.

---

## Round 9 — the 2026-07-31 evening batch

Six more reports. Two were waitlist questions Tanner ruled on before this was
built; the rest are here except the in-house-course idea (see below).

### 13. Approving a schedule now ASKS about waitlist places

> "When the schedule is approved, does that mean the students get dropped from
> waitlists? I can't remember if I said that yet, but it would seem to make
> sense. However at the same time it doesn't make sense I guess."

Being torn is the right instinct — it varies per family. A student who settled
for a fallback class may still want the 10:30 seat; another is done. So the
approver decides, at the moment of approval, on both surfaces (the CLP meeting
screen and the Registration review queue):

> Alice is still on 1 waitlist: Miniatures.
> **OK** — approve and take them off those waitlists (they lose their place in line).
> **Cancel** — approve and keep their place, so a seat can still be offered later.

Keeping is the default and what happens if the question is dismissed, because a
dropped place cannot be un-dropped — position in line is gone. The prompt only
appears when the student actually holds a place, and the approval toast reports
which way it went. **Timing note:** 53 iCreate students were sitting in
`submitted` when this shipped, so the question lands on the batch that matters.

### 14. Offering a waitlisted student a different section

> "Could we offer other sections of classes to people on a waitlist? For example,
> there are 8 on the waitlist on tuesday at 10:30am, but we have spots in the
> other ukelele classes."

Each waitlist row now has **Other section ▾**, listing the sections of the same
class that still have room, with seats left. Picking one enrolls the student
there and closes their place on this list — they got the class they queued for,
at a time that exists.

Sections are matched on the class name before the "(" — iCreate names every
section `Base (Day Block)`, so no new field to maintain. Archived and full
sections never appear.

The opportunity is bigger than one class: at the time of writing, Ukelele Jam had
9 waiting with 2 sections that had room, Reading Workshop 23 waiting across 5,
Elementary Microschool 11 across 2.

### 15. Families can take back a schedule the school hasn't looked at

> "Right now they submit the schedule for approval, but then their schedule is
> locked. So then I keep on having to unlock them because parents want to change
> or I had schedule changes."

The full flow rework (finalize-after-CLP, CLP opt-out) is still a conversation —
see the open questions. What shipped is the relief: while a submission is still
`submitted`, the family sees **"Need to change something? Take it back"**, which
unlocks their builder without anyone in the office touching it. Once staff have
**approved** it, they can't — from that point the schedule is the school's, which
is the whole meaning of approval, and they're pointed at the office.

### 16. All classes on the teacher dashboard

> "I think it'd be nice just to show ALL the classes on the dashboard instead of
> having to click to see all?"

The My classes card showed the first six with a "See all" link. It shows every
class now, with the count in the title; the link goes to the weekly view.

### 17. Phone numbers where you look for them

> "It would be nice if there was easier access to the parent phone numbers. Phone
> # doesn't show up when you click on the parent. I only was able to find it by
> clicking on the student and then scrolling down to find that student's
> emergency contacts. I feel like it should also be easier to locate the
> emergency contact info on the student's end ... if there is an emergency."

- A person's phone is now on their own record — editable in Manage, shown under
  their name in the People list, and included in the CSV export.
- A student's record opens with a **Who to call** strip: their emergency contacts,
  phone numbers tappable, above the profile fields instead of below them.

---

## Round 10 — the 2026-08-01 batch

Five reports, two of them following up on what shipped the day before.

### 18. An announcement that reaches families

> "I just posted an announcement from the admin side and it doesn't show up in
> the announcements on the non-admin side of things. Perhaps that isn't yet
> functional?"

It was functional — two different things share a word. The SIS **Community Hub**
is a staff noticeboard (staff-only by design, with lost & found and recognition
beside it); the family-facing **Announcements** page reads a different table,
which had zero rows for iCreate because nothing had ever been posted through it.

So the Community composer can now do both. A **Who sees this** block on the post
form offers Families / Students / Teachers; tick any of them and the post is also
published as a real announcement — a durable row the family page reads, an in-app
notification, and an email to people who never open the app. Leave them unticked
and it stays a noticeboard post, which is what the board is for.

The delivery path was extracted into `services/announcement_service.py`, so the
web platform's composer and the SIS composer now publish through exactly one
function. A delivery failure never loses the post: the noticeboard row is written
first and the composer reports what did or didn't go out.

### 19. Offer the other section, don't enroll into it

> "You added the option to enroll in another section — but I'm wondering if we
> can OFFER them the seat since we don't know what their schedule is? If we
> enroll them, then they'll be enrolled in two sections at the same time. (I'm
> thinking ukelele here again.)"

Right, and the direct enroll from yesterday was the wrong default. **Offer it** is
now the primary action on every other-section row: the family gets a claimable
offer for that section, decides against their own schedule, and claims it (or
doesn't) — the same offer/claim flow as a seat on the list they're already on.

**Enroll directly** is still there for when the office knows the time works, and
it no longer double-books anyone: enrolling a student into a section that clashes
with a class they already have now names the clash and asks first.

> Van already has Art Expeditions at that time. Enroll anyway?

### 20. Other sections, on the CLP meeting screen

> "This is great to have the open requests shown! Maybe on 'Open requests' it can
> show if there are other sections available for a waitlisted class?"

Each waitlisted row under **Open requests** now lists the sibling sections that
still have room, with a one-click offer per section — the same offer the class
Waitlist tab sends, without leaving the meeting.

### 21. The staff list, and Julia twice

> "It'd be nice to have a list view for staff. And I also would like a list of
> teachers I've invited but haven't accepted yet. And I also messed up and
> invited Julia 'ADD TEACHER' instead of inviting her from her card that was
> already created!"

Three things:

- **List view.** A toggle beside the cards, with a row per person: email, role,
  status, classes taught, last active. The choice is remembered.
- **Invited, not accepted.** A filter chip with a live count, next to *Signed in*
  and *No login yet* — placeholders imported from the schedule sheet are a
  different kind of incomplete, so they count separately. Each pending invite
  says how long it has been sitting there ("invited 3 days ago").
- **Julia.** Her placeholder card holds **12 classes**; the account invited under
  her real email holds none. The staff list now says so, at the top:

  > Julia Connor is on the list twice: a card with no login holding 12 classes,
  > and an invited account (juliaconnor03@gmail.com). Merging keeps the invited
  > account and moves the classes onto it. **[Merge into invited account]**

  Detection is a name match across the placeholder boundary only, so two real
  teachers who happen to share a name are never proposed for a merge. The merge
  itself is the linking that already existed — it just had to be findable.

And so it doesn't happen again: **Add teacher** now asks "Is this someone already
on the staff list?" with the unlinked people named and their class counts shown.
Choose one and the button becomes *Link Julia Connor account*, which attaches the
email to the existing card instead of making a second one. The old version of
that warning said the same thing in prose and sent the admin to another screen to
act on it.

### 22. Writing an announcement with formatting

> "A rich text editor would be nice on the announcements and on the messages."

Every announcement composer — the SIS **Messaging** page, the Community Hub post
form, and the org admin tab — now has the editor: headings, bold, italic, lists,
quotes. (Alignment is deliberately absent: it travels as a `style` attribute,
which the email and family-page pipeline strips, and a button whose effect
vanishes on save is worse than no button.)

The editor was the easy half. A body stops being plain text everywhere it is
*read*, so each of those places was taught what to do with it:

| Where | What it does now |
|-------|------------------|
| Family Announcements page | Renders the formatting, sanitized at render as well as on the way in |
| Notification bell (web + mobile) | Preview and "Read more" both show the **text** — react-markdown escapes raw HTML and React Native has no notion of it |
| Email fan-out | The HTML body is passed through instead of escaped (this is the one that would have put literal `<p>` tags in a parent's inbox); the plain-text part is the flattened body |
| Composer validation | "Empty" is judged on the text, because an empty editor still emits `<p></p>` — otherwise a blank announcement goes to the whole school |
| Everything posted before today | Still plain text, still rendered with its line breaks |

Two matching helpers do the work and are the only place this logic lives:
`backend/utils/rich_text.py` (`sanitize` / `to_text` / `preview`) and
`frontend/src/utils/richText.js` (`isHtml` / `htmlToText` / `isBlank`). Storage
is sanitized on the way in — an allow-list of the tags the editor can produce, no
`style`, no `img`, no `javascript:` links — so a renderer that forgets to
sanitize is a formatting bug rather than a hole.

Chat messages are **not** included: they are rendered by the mobile app as plain
strings, so HTML there would show as tags on a phone. Announcements were what
the request was about.

### 23. The Community Hub, family-side

> "Also I can't see the shoutouts or lost and found or other things from the
> non-admin side of things."

Asked, and answered by Molly the same day: *"community hub is intended for
families as well. lost and found won't have student names, just the item that was
lost so parents can see it and know to come pick it up."*

So the board is now family-readable, and it arrived with a rename. What used to
be an **Announcements** page in the web platform is now the **school's own page**,
titled with the school's name (iCreate, not "Announcements") and carrying its
school-specific features: an **Announcements** tab (what the school has sent you,
searchable) and a **Community** tab (noticeboard, what's on, lost & found,
shout-outs). The Community tab appears only once the school has posted something.

The nav item is the school's name too, and **only people in a school see any of
it** — no item, and the route itself sends everyone else home rather than
rendering an empty shell. `/school` is the path; `/announcements` still lands
there, because emails and notifications sent before the rename link to it.

Read-only, and a projection rather than a pass-through: `family_feed()` sends an
explicit field list per module, so a column added to one of those tables later
cannot quietly become public. What does not cross over:

- **`claimed_by`** — who collected an item. The board exists to find an owner,
  not to announce who came for it. Claimed items are dropped entirely.
- **The author of a post** and a shout-out's account id — plumbing, not content.
- **Scheduled and expired announcements** — not published yet, or over.
- **Admin/teacher-only calendar events**, and **birthdays** — a staff
  convenience, not a broadcast of children's birthdays to every family.

Lost & found leads with the item, where it was found, and how long before it is
donated, which is the part a parent acts on.

One consequence worth knowing: a parent's school is resolved through
**membership**, not `organization_id` — most parents are platform users with no
org of their own, and are members through their child. That resolution
(dependents, then approved parent-student links) is now shared by the feed, the
announcements archive, and `/api/auth/me`, which is what lets the web platform
decide whether this user has a school at all.

Not on the **mobile app** yet: v2 has no announcements or community surface
today, only the notification bell. Worth its own pass.

---

## Tests

- Frontend: **1049 passing** (106 new — waitlist staff actions, People export and
  removal, curriculum table, calendar categories, roster alerts, quest-picker
  delete, CLP lenses / open requests / school toggle, and the waiting-vs-offered
  split on the class list, the teacher-portal back-link on all eight pages, the approve-time waitlist
  choice, cross-section offers, the family take-back, the announcement audience
  block, the staff directory / duplicate merge, formatted-vs-plain bodies, and the
  family-side community board, and who gets a school page at all).
- Backend: **new suites** `test_sis_waitlist_staff_actions.py` (45),
  `test_sis_person_removal.py` (19), `test_blank_values.py` (40),
  `test_sis_clp_open_requests.py` (10), `test_announcement_publish.py` (17),
  `test_sis_staff_directory.py` (13), `test_rich_text.py` (25),
  `test_sis_community_family_feed.py` (20), plus 7 added to the calendar suite and 8
  covering the waiting-vs-offered split. The
  pre-existing failures in the backend suite (113 failures, 31 collection errors —
  repositories, xp/atomic-quest services, transcription, rate limiting) are
  unchanged by this build — verified by running them against a clean tree.

## Not built, and open questions

### The in-house course tied to curriculum (2026-07-31)

> "I like the idea of quests in here, but I'm wondering if we can add the ability
> to add an in-house course that is tied to the curriculum. That way we don't
> have to start anew with the quests every year? And maybe some teachers want to
> fill it in in advance."

Not built — it's a real feature, not a fix. It needs a decision about what the
reusable thing is: a course that owns a term's quests and can be cloned into next
year's class, or a curriculum entry that carries them. Worth a design pass with
Molly before any code.

### A campus coordinator role (2026-08-01)

> "I think we will need a campus coordinator role. Right now Kate is an admin,
> but it'll probably make more sense to have this as a role because we don't want
> the cc's to have access to all the financial stuff and maybe block other things
> too. So I'm not sure if the cc will have access to things within the admin or if
> we should have her own portal where we add things! We also will have Julia as a
> campus coordinator too."

Not built — Molly is asking the design question out loud, and the two answers
lead to very different builds:

1. **A restricted org_admin.** The same SIS console with modules hidden
   (Billing first). Cheapest, and it lands as soon as the module list becomes
   per-role instead of per-user-type. Risk: "hidden" is not "denied" unless every
   route also checks, so the work is mostly backend authorization, not UI.
2. **Its own portal.** A coordinator surface built around what they actually do
   (their campus's rosters, attendance, families, day-to-day comms) rather than
   admin-minus-things. More work, better fit, and it needs a list of what the job
   is before anything is designed.

Either way it is a seventh role in a system that documents exactly six, so it
touches `get_effective_role`, every `@require_role` list, and the org-role picker.
Worth a call with Molly: what must a coordinator never see, and what do they do
every day?

### The schedule flow

The take-back above is relief, not the redesign. Still open: finalize-after-CLP
instead of submit-for-approval, and letting some families skip the CLP ("some
people we could easily just finalize without a CLP, especially if only taking 1
class"). Her words: "something we need to talk over."

## Follow-ups not done, and open questions for iCreate

- The three orphaned Swenson accounts are **left in place** — they are iCreate's
  data to remove, and the tool to do it is now on the People page. All three are
  clean (no records), so Delete will be offered.
- A family whose offered seat is filled before they claim it still can't claim
  it; the office is notified instead. Reserving the seat for the length of the
  offer would be the fuller fix.
- ~~Should approving a schedule drop the student's waitlist places?~~ **Answered
  2026-07-31: the approver chooses per family, defaulting to keeping them.**
- **Private-school status:** add it to the registration funnel for next year,
  and/or let parents set it in their portal? The CLP toggle covers today.
