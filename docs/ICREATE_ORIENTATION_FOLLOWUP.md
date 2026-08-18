# Open items from iCreate family orientation — 2026-08-18

Everything below was found while iCreate ran family orientation with dozens of
families in the building on the mobile app. The urgent work shipped that day
(see "Already resolved" at the bottom for what not to re-investigate). What
remains is written down here rather than fixed, because fixing it mid-event was
either unnecessary or actively unsafe.

Ordered by priority within each section.

---

## 0. Plan of attack

Written after the event closed, 2026-08-18. Five phases, ordered so that
nothing has to be done twice and the things other people gate on get asked
first.

Two facts that shaped the order:

- **CI is green on `main`.** Every push today ran `Release (main)` and passed,
  even though the deploys were triggered by hand to skip the wait. Nothing was
  left broken and there is no cleanup — normal `git push origin main` flow can
  resume immediately.
- **Load is back to idle**, but memory is not what it was. See P0.2.

### P0 — today, minutes each

| | Task | Why now |
|---|---|---|
| **P0.1** | **Rotate the Expo access token and the Render API key** (§4.1) | Both were exposed in a session transcript. Everything else can wait; this cannot. |
| ~~P0.2~~ | ~~Scale Render down~~ — **decided against, 2026-08-18: staying on Pro × 2** | Headroom for the next event is worth more than the difference. See §4.3. |
| **P0.3** | Resolve Sentry **OPTIO-BACKEND-6Q** | It is the deliberate restart during scaling. Close it so the issue list means something. |

**Sizing decision (2026-08-18): stay on Pro × 2.** Kept deliberately for
headroom at the next event rather than scaled back down.

If that is ever revisited, the trap to know: workers went 2 → 4 and threads
2 → 8 during the incident, so memory now runs **656–734 MB per instance** —
over Starter's 512 MB cap. Starter would OOM unless the worker count is reverted
with it. Standard (1 CPU / 2 GB) would fit. Keep two instances whatever the
plan: the second is what removed the last 502s, because `max_requests=1000`
recycles workers and a single instance has nothing to serve during a recycle.
A plan change needs a full **deploy**, not a restart.

### P1 — today, then wait: the questions other people answer

Send these now so answers arrive before anyone starts work that depends on them.

- **iCreate:** did the **Bezzant family** actually enrol? (§3.1 — blocks a real
  person's account either way.)
- **iCreate:** are the two **Stephanie Davis** accounts the same person? (§3.3)
- **iCreate:** dates of birth for **Garrison Bird, Emmitt Funk, Chloe Woellhaf,
  Cami Christensen** (§3.2), and whether **Erin Swenson** is the second guardian
  on the Swenson household (§3.3).
- **iCreate:** the room for **Elementary Microschool (Monday)** (§3.6) — one
  field, appears in the app instantly, no release.
- **Whoever holds Play Console:** rename the listing to **"Optio Education"**
  (§1.1). Highest-value five minutes on this whole list — it is the most likely
  fix for Android search and costs nothing.

### P2 — one backend pass

All small, all in the same neighbourhood (roles, permissions, serialisation),
so they batch into one branch with one review and one deploy.

1. **§1.2 `/api/observers/invite` does not exist.** Do this first — it is a
   button that has never worked for anyone. Decide whether the route should
   exist or the two callers should point at `generate-link` /
   `parent-invite`, then delete the stale entries from
   `API_DOCUMENTATION.md` and `complete_api_spec.yml`.
2. **§1.4 `student_access_logs` constraint violation.** Audit records are being
   dropped. Very likely the same `org_managed`-reaching-a-resolved-role-column
   shape as the two bugs already fixed today, so it should be quick with that
   in mind.
3. **§1.5 staff-only class fields served to students.** Route
   `/api/classes/student/classes` through the audience filter the SIS catalog
   already has (`STAFF_ONLY_FIELDS` / `_for_audience`).
4. **§1.3 per-user rate limiting falling back to IP.** Root cause only — the
   symptom is already fixed. While in there, add the identifier to the Sentry
   context so the next lockout is legible without digging through Render logs.
5. **§1.7** — 6T (make finalize idempotent), 6M (confirm retry coverage), 6N
   (confirm it is not a mobile refresh race).
6. **§4.2 dead rate-limit config.** Wire `DISABLE_RATE_LIMIT` /
   `RATE_LIMIT_ENABLED` up or delete them. Config that looks like an emergency
   switch and does nothing is worse than no switch.
7. **§1.1 `releaseStatus: "draft"`** → `"completed"` in `eas.json`. Not the
   search bug, but it means every future Android release waits on a manual
   promotion someone will forget.

### P3 — one mobile pass, in this order

**Do the type scale first.** §2.2 changes the rendered size of every screen and
needs a before/after screenshot sweep. Building the new screens first means
screenshotting them twice and re-fixing their layouts. Doing it first means
everything built afterwards is built at the right size.

1. **§2.2 type scale.** One change to `sizeMap` in `Text.tsx`, then the
   screenshot sweep over the six densest screens, then the 25 sub-11px
   hardcodes, then a pass at 200% OS text size. Do not disable
   `allowFontScaling` to protect a layout.
2. **§2.5 resources section.** Highest user value on the mobile list: the
   orientation quest literally tells families to open a Resources section that
   does not exist, the endpoint is already built and family-scoped, and iCreate
   has seven documents sitting there. Ship it as a `SchoolSection` so it
   inherits the collapse behaviour.
3. **§2.4 parent nav rework.** One swap — Messages to the header, Journal into
   the bar. Remember it is a coordinated two-file edit or parents get both
   surfaces or neither.
4. **§2.3 mobile promote-to-parent.** Completes the co-parent flow on the
   surface families actually use.

Steps 2–4 all touch the school page and tab bar, so land them together behind
**one OTA** rather than three.

### P4 — the one that needs care

**§2.1 training-quest auto-resync.** Deliberately last. It performs bulk writes
across every enrollment on each save, and the cascade behaviour is genuinely
dangerous: `quest_task_completions.user_quest_task_id` and
`user_task_evidence_documents.task_id` are both `ON DELETE CASCADE`, so the
obvious implementation destroys awarded XP and uploaded evidence.

Do not start it without reading §2.1's constraints. The one-off that ran
successfully on 152 live enrollments **updated rows in place** precisely so a
race could not cascade. Required tests before it goes anywhere near a route: a
completion survives, a draft evidence upload survives, and a task completed
*during* the run survives.

### Not on the critical path

- **§1.6 CSRF expiry** — staff annoyance, `level: info`, no family affected.
  Fix when someone is already in that code.
- **§3.4 households with no linked accounts** — leave them. Two are prepaid
  families; deleting throws away the fee match.
- **§3.5 "person Family"** test record — delete whenever convenient.
- **§4.4 OTA sourcemaps** — worth decoupling the Sentry upload from the publish
  so a telemetry failure can never block a release, but nothing is broken.


## 1. Broken in production, not yet fixed

### 1.1 Optio does not surface in Google Play search (it does on the App Store)

**Impact: high for Android acquisition — but the app IS published; this is a
findability problem, not a publishing one.**

Checked directly rather than assumed. The listing is live:

- `https://play.google.com/store/apps/details?id=com.optioeducation.optio`
  returns **HTTP 200** with a real page — install button, content rating
  "Everyone", the tagline "Capture what you're learning…". A control request
  for a nonexistent package returns 404, so the 200 is meaningful.

So "not published" was ruled out. Two things explain the asymmetry instead:

**1. The store names differ.** The Play listing is titled **"Optio"**. The App
Store listing is **"Optio Education"** (seller "Optio, LLC", category
Education). Play indexes the title heavily, and "Optio" alone is a generic
Latin word competing with unrelated results — while anyone searching *"Optio
Education"* matches the iOS title exactly and misses the Play title. That
single word is the most likely reason the same search behaves differently on
the two stores.

**2. The app has ~5 installs.** The listing reports **"5+" downloads**. Play
search ranking leans on installs, ratings and engagement, so a brand-new app
with almost no install base ranks poorly for a generic query regardless of
anything else. Some of this resolves itself as iCreate's families install it.

**Suggested actions, in order of expected effect:**

1. **Rename the Play listing to "Optio Education"** to match iOS. Biggest single
   lever, costs nothing, and makes the two stores consistent.
2. **Work the description.** Play has no keyword field — it indexes the title
   plus the short and long descriptions. Make sure "education", "portfolio",
   "learning", "homeschool", "students" appear naturally in both.
3. **Confirm targeting** in Play Console: country availability, and that
   nothing restricts device eligibility.
4. **Give it time.** A new listing takes days to index fully, and install
   count is itself a ranking input.
5. Meanwhile, hand families the **direct link** rather than telling them to
   search:
   `https://play.google.com/store/apps/details?id=com.optioeducation.optio`

#### Separate, real, and worth fixing anyway: `releaseStatus: "draft"`

While checking the above I found the Android production submit profile uploads
as a draft ([frontend-v2/eas.json](../frontend-v2/eas.json)):

```json
"android": { "track": "production", "releaseStatus": "draft" }
```

This is **not** why search is failing — the current build is clearly live. But
it means **every future Android release lands in Play Console as a draft and
needs a manual promotion**, which is a step someone will eventually forget,
producing a silent "we shipped it but nobody got it". Change it to
`"completed"` (the default) unless the manual gate is deliberate.

The package identifiers themselves are consistent and fine:
`com.optioeducation.optio` on both platforms.

### 1.2 `/api/observers/invite` does not exist, and two clients call it

**Impact: high — a button that cannot ever work.**

The route is not registered anywhere in the app. `app.url_map` has
`/api/observers/generate-link`, `/api/observers/parent-invite` and
`/api/observers/family-invite`, but no `/api/observers/invite`. Two clients
POST to it:

- [frontend/src/services/api.js:446](../frontend/src/services/api.js#L446)
- [frontend-v2/app/(app)/(tabs)/profile.tsx:120](../frontend-v2/app/(app)/(tabs)/profile.tsx#L120)

Both must be 404ing. It is documented as real in `API_DOCUMENTATION.md` and
`api_specs/complete_api_spec.yml`, which is probably how it survived. Decide
whether the endpoint should exist or the callers should point at
`generate-link` / `parent-invite`, then delete the stale spec entries.

There are unit tests asserting the *client* calls this path
(`src/hooks/__tests__/useObserver.test.ts`), which pass against a mocked `api`
and therefore prove nothing about the server. Worth noting as a test-design
lesson: mocking the transport hides a missing route.

### 1.3 Per-user rate limiting silently falls back to IP

**Impact: high — it is why one shared bucket locked out a building.**

`init_task_signed_upload` is declared `@rate_limit(..., per_user=True)`, but the
denial that hit during orientation was keyed
`identifier=172.68.3.193:evidence_documents.init_task_signed_upload` — an IP,
not a user. `_resolve_rate_limit_user_id()` returned `None` and the limiter took
the IP path.

The IP itself was fixed the same day (`TRUSTED_PROXY_HOPS` 1 → 2, so buckets are
now per client rather than per Cloudflare edge). **The root cause was not**:
per-user keying should have meant the IP path was never reached. Find out why
`session_manager.get_effective_user_id()` returns `None` on a Bearer-authenticated
mobile upload. Note `rate_limit` is applied *above* `require_auth`, so it runs
before authentication — it parses the token itself, and that parse is what is
failing.

Add the identifier to the Sentry context in `_report_rate_limit_exceeded` while
you are in there. Its absence is why the IP keying had to be dug out of Render
logs instead of being visible in the issue.

### 1.4 `student_access_logs` check-constraint violation

**Impact: medium — FERPA-adjacent audit logging is failing.**

Sentry **OPTIO-BACKEND-6K**, culprit `parent_child_overview.get_child_overview`:

```
new row for relation "student_access_logs" violates check constraint
"valid_accessor_role"
```

The access log is being written with an accessor role the constraint rejects, so
those accesses are going unrecorded. Almost certainly the same root cause as the
two role bugs fixed on the day: an `org_managed` value reaching a column that
expects a resolved role. Check what `valid_accessor_role` permits against what
the logger passes.

### 1.5 Staff-only class fields are served to students

**Impact: medium — data exposure, pre-existing.**

`/api/classes/student/classes` returns `org_classes(*)`, which includes
`internal_notes`, `price_cents`, `supply_budget_per_student` and
`assistant_instructor_ids`. The SIS catalog has a filter for exactly this
(`sis_catalog_service.STAFF_ONLY_FIELDS` / `_for_audience`) — this endpoint just
does not use it.

Not introduced by the schedule work, and deliberately left alone during the
event because narrowing the select could break other consumers. Route it
through the same audience filter the SIS catalog uses.

### 1.6 CSRF token expiry on the SIS console

**Impact: low — staff annoyance, no family affected.**

Sentry **OPTIO-BACKEND-6J**, 17 events, culprit `sis_catalog.update_class`.
`level: info`. An admin leaves the SIS open in a tab, the CSRF token ages out,
and the next save is rejected. Mobile uses Bearer tokens and has no CSRF, so no
family is touched.

Fix is client-side: refresh the CSRF token before a mutation, or retry once on
`csrf_reason: expired` instead of surfacing the failure.

### 1.7 Lower-volume Sentry issues, triaged but unfixed

| Issue | Culprit | Note |
|---|---|---|
| **OPTIO-BACKEND-6T** | `evidence_documents.finalize_task_signed_upload` | `409 Duplicate` from video processing — a re-finalize of an already-processed upload. Should be idempotent. |
| **OPTIO-BACKEND-6M** | `evidence_documents.init_task_signed_upload` | `RemoteProtocolError: Server disconnected` — stale pooled socket. Already has `with_connection_retry`; confirm it covers this path. |
| **OPTIO-BACKEND-6N** | `auth_login.refresh_token` | "Refresh token reuse detected; token family revoked". Low volume and expected under token churn, but worth confirming it is not a mobile refresh race. |
| **OPTIO-BACKEND-6Q** | — | `Worker sent SIGTERM`. This was the deliberate restart during scaling. Resolve it. |

---

## 2. Known work, not yet done

### 2.1 Auto-resync of training-quest task edits

**Status: helper written, uncommitted, untested, wiring removed before deploy.**

`resync_enrollments_to_template()` is in
[backend/utils/template_tasks.py](../backend/utils/template_tasks.py) as an
uncommitted working-tree change. It was wired into
`update_training_quest` and then removed before the deploy, because it performs
bulk deletes and inserts across every enrollment on each save and has no tests.
Shipping that into a live event was the wrong trade.

**The underlying problem is real and still present:** saving a training quest
changes only what *future* enrollees receive. Task lists are copied per user at
enrollment time (`assign_quest_to_users`), so an admin editing an orientation
quest reaches nobody who already holds it. On the day, an edit at 15:59 left all
152 families on the previous copy, and it was corrected by a one-off script.

Before wiring it up:

- **Do not delete rows to recreate them.** `quest_task_completions.user_quest_task_id`
  and `user_task_evidence_documents.task_id` are both `ON DELETE CASCADE`, so a
  delete destroys awarded XP and uploaded evidence. The one-off script that ran
  successfully **updated rows in place** for exactly this reason — an UPDATE
  cannot cascade, so a race can at worst retitle a task somebody just completed.
- Rows carrying work must be skipped entirely, and the template task matching
  their title must not be written over the top of them.
- Surplus rows are the only safe deletes, and each needs re-checking for work
  immediately before removal.
- Tests should cover: a completion surviving, a draft evidence upload surviving,
  and a task completed *during* the run surviving.

The working script is a good starting point — it is in the session scratchpad,
and its approach is described above.

### 2.2 Mobile type is too small — audit and raise the baseline

**Impact: high — it affects every screen and every user, and the audience
includes parents and grandparents reading on a phone.**

Reported after orientation: "the text in the mobile app is very small." It is,
and it is measurable rather than a matter of taste.

#### What the scale is now

`UIText` maps to Tailwind sizes ([src/components/ui/Text.tsx](../frontend-v2/src/components/ui/Text.tsx)):

| prop | rendered | uses across `app/` + `src/` |
|---|---|---|
| `xs` | 12px | **696** |
| `sm` | 14px | **696** |
| `md` | 16px (default when no prop) | 226 |
| `lg` | 18px | 193 |

**1,392 of 1,811 sized calls — 77% — render at 12px or 14px.** Only 23% reach
16px. On top of that there are **25 hardcoded `fontSize: 8–11` overrides** that
go *below* the `xs` scale, including tab-bar labels at 10px
([app/(app)/(tabs)/_layout.tsx](../frontend-v2/app/(app)/(tabs)/_layout.tsx))
and several badge labels.

For reference: iOS's default body text is 17px and Apple's HIG treats 11pt as a
floor, not a target; Material's body sizes are 14–16sp. The app is built almost
entirely below both platforms' body defaults.

#### One thing that is already right

`allowFontScaling` is **never disabled** anywhere in the codebase, and no
`maxFontSizeMultiplier` caps are set. A user who turns up text size in iOS or
Android settings already gets larger text throughout. That is the accessibility
floor and it is intact — the problem is the *default*, not the scaling.

Do not "fix" this by disabling scaling to protect layouts.

#### Suggested plan

1. **Decide the baseline first, in one place.** The fix is the `sizeMap` in
   `Text.tsx`, not 1,811 call sites. Proposal: `xs` 12→13, `sm` 14→15,
   `md` 16→17 (matching iOS body), `lg` 18→20. One change, whole app moves.
2. **Screenshot the highest-density screens before and after**, because
   raising the scale is what breaks layouts. The worst offenders by `xs` count
   are `admin.tsx` (71), `courses/[id]/index.tsx` (33),
   `CreateQuestModal.tsx` (28), `TaskCreationWizard.tsx` (26),
   `quests/[id].tsx` (20), `advisor.tsx` (20).
3. **Audit the `xs` calls by role, not in bulk.** `xs` is legitimate for badge
   and metadata chips; it is not legitimate for anything a parent has to
   *read* — task descriptions, evidence text, schedule rows, announcement
   bodies. Anything in a reading position should be `sm` at minimum, ideally
   `md`.
4. **Remove the sub-11px hardcodes.** 25 of them, and they bypass the scale
   entirely, so step 1 will not move them.
5. **Test at 200% OS text size**, which is where clamped rows and one-line
   truncation break. This is exactly how the orientation task-title bug
   presented — `numberOfLines={1}` on text that needed to wrap.
6. **Check contrast while in there.** Much of the small text is also the
   lightest token (`text-typo-400` on white). Small *and* low-contrast is worse
   than either alone.

Worth doing as one deliberate pass with screenshots, not piecemeal.

### 2.3 No "promote to parent" step in the mobile app

**Impact: medium — the documented way to add a co-parent cannot be finished on a phone.**

Adding a second parent is: invite as observer → **Family Settings → "Make a
parent"**. That second step exists only on web
([FamilySettingsModal.jsx:187](../frontend/src/components/parent/FamilySettingsModal.jsx#L187)
→ `POST /api/parents/promote-observer`). Mobile has the observer invite but no
promote, so a parent starting on their phone gets stuck halfway.

Families at an in-person orientation are on phones. Worth adding.

### 2.4 Parent bottom-nav needs rework

**Impact: medium — parents are the primary mobile audience and their shell has
drifted from the student one.**

Requested after orientation: give parents a Journal button in the bottom bar,
move Messages to the top, and possibly move the school button down.

#### Where it stands

Tab orders live in
[frontend-v2/src/config/navigation.ts](../frontend-v2/src/config/navigation.ts):

| shell | tabs (centre `capture` is the modal trigger) |
|---|---|
| student | `dashboard, journal, `**`capture`**`, bounties, feed` |
| **parent** | `family, feed, `**`capture`**`, bounties, messages` |
| observer | `feed, `**`capture`**`, bounties` |

Four real slots plus the centre button. So:

- **Parents have no Journal tab at all.** Students do. On mobile the Journal
  subsumes quest discovery and creation, so parents are missing the surface
  where a child's learning actually gets captured and reviewed.
- **Messages is a parent tab but a header icon for students.**
  `PageHeader` sets `showMessages = !isParent && !isObserver`
  ([MobileHeader.tsx:425](../frontend-v2/src/components/layouts/MobileHeader.tsx#L425)),
  with a comment stating the invariant deliberately: *the icon is present iff
  Messages left the bar.* Any change here is a coordinated two-file edit —
  `navigation.ts` and `MobileHeader.tsx` — or the icon and the tab both show,
  or neither does.
- **The school button is already in the header for parents.** `<SchoolButton />`
  renders unconditionally in `PageHeader` for any SIS member, so parents can
  already reach the iCreate page; it is not missing, just not in the bar.

#### Recommendation

The first two asks are exactly complementary — a clean one-for-one swap:

```
parentMobileTabOrder: ['family', 'journal', 'capture', 'bounties', 'messages']
                                  ^^^^^^^ replaces 'feed'      ^^^^^^^^ moves out
→                     ['family', 'journal', 'capture', 'bounties', 'feed']
   plus showMessages = !isObserver   (parents get the header chat icon)
```

Messages moving to the header frees the slot Journal needs, and it makes the
parent shell consistent with the student one, which is the stronger argument:
Messages is notification-driven rather than a browse destination, which is why
it left the student bar in the first place.

**On moving the school button down: suggest not, at least not yet.** Two
reasons. There are only four slots, so School would have to displace Feed or
Bounties, and the swap above already spends the free one. And the school page
is only meaningful to SIS org members — a platform parent with
`organization_id = NULL` would get a dead tab, so it would have to be a
conditional, variable-length tab bar, which is a good deal more complexity than
a header icon that already works. Revisit if parents report not finding the
school page, which is a question worth asking iCreate directly rather than
guessing at.

Whichever way it goes, decide `Feed` vs `Bounties` deliberately — dropping Feed
costs parents the daily social surface, dropping Bounties costs the earning
loop, and the tab bar cannot hold both plus Journal and School.


### 2.5 School documents/resources section is missing from the mobile school page

**Impact: high — the orientation quest sends families to a section that does not
exist on their phones.**

One of the 15 tasks on the iCreate Exploration Quest reads:

> *"Check the Family Guide, Behavior Agreement and other docs found in the
> **Resources section** or ask an iCreate staff member if you don't already know
> the answers."*

There is no Resources section in the mobile app. `frontend-v2` contains **no
reference to resources at all** — no screen, no hook, no API call. Families
doing that task on a phone had nowhere to go, which is very likely why the
task's fallback ("or ask an iCreate staff member") got exercised so much.

#### Everything needed already exists

This is a missing screen, not a missing feature. The data and the endpoint are
in place and populated:

- **Endpoint:** `GET /api/sis/parent/resources?organization_id=…`
  ([backend/routes/sis/parent.py:676](../backend/routes/sis/parent.py#L676)),
  `@require_auth`, family-scoped, already returns signed URLs — uploaded
  documents live in the private `org-documents` bucket and are signed in one
  batched call, so the client needs no storage logic.
- **iCreate has seven family-visible documents loaded right now:**

  | audience | documents |
  |---|---|
  | `families` | Enrollment & Tuition Agreement, Liability Waiver, **Family Guidebook** |
  | `all` | Quest Learning Day, Elementary Academic Learning Day, Teen Academic Learning Day Guide, **Student Behavior Agreement** |

  The two the quest names by title — Family Guidebook and Student Behavior
  Agreement — are both there.
- The web SIS already renders this
  ([frontend/src/pages/sis/ResourcesPage.jsx](../frontend/src/pages/sis/ResourcesPage.jsx)),
  so the shape of the payload and the audience rules are settled.

#### Build notes

- Add it as another `SchoolSection` on the mobile school page, so it inherits
  the shared header, toggle and closed-on-arrival default alongside
  Announcements, the class schedules and the carpool board.
- **Respect the audience field.** `families` and `all` are family-visible;
  `staff` is not. The parent endpoint already filters, so just do not widen it.
- **`requires_ack` exists** and is currently `false` on all seven iCreate rows,
  but the acknowledgement flow is real (`/api/sis/resources/<id>/ack`, and the
  web page surfaces stale acks when a document is re-versioned). Decide whether
  mobile shows ack state read-only or lets a parent acknowledge; if a school
  ever flips `requires_ack` on, a mobile-only parent must not be stuck unable to
  sign.
- Opening a document is a signed URL — reuse the existing `DocumentViewer`
  rather than adding another PDF path.


---

## 3. iCreate data quality

None of these are code bugs. All need somebody at the school to act, or a
decision from us.

### 3.1 Lauren Bezzant — an abandoned enrolment, not just a missing link

**BLOCKED: iCreate needs to confirm whether this family actually enrolled.**
Nothing was changed on either record pending that answer.

The account is `laurenebv@gmail.com`, `role='parent'`,
**`organization_id = NULL`**, no household membership, no dependents, no
parent-student links. What the timeline shows:

| Time (2026-07-31) | Event |
|---|---|
| 00:42:42 | Account created — via the **public platform signup**, not iCreate's org flow, which is why `organization_id` is NULL |
| 00:43:10 | Email confirmed |
| 00:43:11 | Signed in — **once, for the only time** |
| 00:48:52 | "Bezzant Family" household created at iCreate (1404 Jordan Ave, Provo UT 84604), with **`primary_contact_user_id` = Lauren** |

So the school did deliberately record her as the primary contact of an iCreate
household. But three things never happened:

1. Her account was never attached to the organisation.
2. **No `household_members` row was ever inserted** — she is the household's
   primary contact while not being a member of it.
3. **No children were ever created.** There are no Bezzant students under any
   name, and nothing matches that address or phone. Every other household in
   84604 has a parent plus students; this one has nobody.

There is also no registration, invoice, waitlist entry, org invitation or family
directive anywhere for them.

**The `primary_contact_user_id`-without-membership inconsistency is a one-off** —
a check across every household in the database returns exactly this one row, so
it is a single partial failure rather than a systemic bug in family creation.
Not worth hunting for a code path on this evidence alone; if a second one ever
appears, that changes.

This is why it was not simply "fixed": attaching her to the organisation would
grant a possibly-never-enrolled person access to iCreate's community content,
and her children cannot be invented. It reads like an enrolment that was started
and abandoned after thirty seconds.

**Resolution depends on the school's answer:**

- *They enrolled* → attach her (`role='org_managed'`, `org_role='parent'`,
  `organization_id` = iCreate), insert the missing `household_members` row, and
  get the children's names and dates of birth from the school so their accounts
  can be created.
- *They never enrolled* → clear the dangling `primary_contact_user_id`, and
  decide whether the empty household should be kept as a prospective record or
  removed. Her platform account is hers either way and should be left alone.

### 3.2 Five students have no date of birth

Age-gated quests exclude a student whose DOB is unknown — deliberately, so a
quest for teenagers never lands on a six-year-old. These five were therefore
skipped by the 12–18 orientation quest and may well be in range:

| Student | Contact |
|---|---|
| Garrison Bird | garrisonbird5@gmail.com |
| Emmitt Funk | emmittfunk@gmail.com |
| Chloe Woellhaf | chloereadsbooks100@gmail.com |
| Cami Christensen | username `camichr` |
| Demo Student | `demo.student.ddd985` — test account, ignore |

### 3.3 Nine parent accounts belong to no household

83 of 92 parent accounts are linked to a household. The other nine:

- **Duplicate accounts** — Sarie Larson's duplicate was deleted on the day.
  **Stephanie Davis still has two** (`davis.steph85@gmail.com`, dormant since
  7/22, no household; `young.stephanie2@gmail.com`, active, in Davis Family).
  Not merged, because both are email-confirmed and both have signed in — it
  needs a human to confirm they are the same person.
- **Erin Swenson** (`erin4collins@gmail.com`) — Swenson Family exists with Bobby
  Swenson only. Likely the second guardian, never linked. Left alone on request.
- **Ali Oliver, Gerlinda Garlic, Melanie Adams** — no matching household.
  Melanie registered the morning of the event.
- **Three test accounts** — `tannerbowman+ic@`, `tanner+ict@`, Molly Tester.

### 3.4 Households with no linked accounts

**Do not delete these.** Two are matched to `sis_family_directives` with
`fee_prepaid = true` — they are real prepaid families whose accounts were never
linked, and deleting the household throws away the fee match.

| Household | Address | Evidence |
|---|---|---|
| Smith Family | 154 E Zinfandel Ln, Vineyard | directive → `amy.bang.smith@gmail.com`, **prepaid** |
| Larson Family | 1052 S 1350 E, Spanish Fork | directive → `larsonchristie72@gmail.com`, **prepaid** |
| Bezzant Family | 1404 Jordan Ave, Provo | see 3.1 |

Also: **duplicate household names** — 3 × "Larson Family" and 2 × "Davis
Family". These are *different families at different addresses*, not duplicates,
except where they pair with the duplicate accounts in 3.3.

### 3.5 Test data in the production org

"person Family" — address `asd`, phone `1234567890`, members "faketeacher
person" and "none none". Safe to delete; nothing references it.

### 3.6 A class with no room recorded

"Elementary Microschool (Monday)" has no `location` on the class and none on its
meeting, so the schedule shows its time without a room. Every other class in the
sample resolved a room. Someone at the school just needs to fill it in — it
appears in the app immediately, with no release.

---

## 4. Infrastructure and hygiene

### 4.1 Rotate two exposed credentials

Both were pasted into or printed in an assistant session transcript on
2026-08-18:

- **Expo access token** (account `optio-ed`, Admin scope) — rotate at
  <https://expo.dev/settings/access-tokens>
- **Render API key** — it was echoed to stdout while checking whether it was
  set. Rotate it.

Neither was written to disk.

### 4.2 Dead rate-limit config

`DISABLE_RATE_LIMIT` is set on the prod service (`false`) and
`RATE_LIMIT_ENABLED` is defined in `app_config.py`, but **nothing in the
codebase reads either one**. Anyone reaching for them as an emergency switch
mid-incident will find they do nothing. Either wire them up or delete them —
misleading config is worse than none.

### 4.3 Render sizing is now well above baseline

Scaled during the event to handle the load:

| | Before | Now |
|---|---|---|
| Plan | Starter (0.5 CPU / 512 MB) | **Pro (2 CPU / 4 GB)** |
| Instances | 1 | **2** |
| Gunicorn | 2 workers × 2 threads | **4 × 8** |

Roughly $85/instance/month versus $7. Memory was never the constraint — it sat
at 260–300 MB of 512 MB while CPU pinned at the 0.5 cap.

Suggested: drop to **Standard (1 CPU) × 2** after the event and watch the CPU
graph, rather than going straight back to Starter. Keep two instances
regardless — the second one is what removed the last 502s, because
`max_requests=1000` recycles workers and a single instance has nothing to serve
during the recycle.

A plan change needs a full **deploy**, not a restart — Render keeps the running
instance on the old hardware until it redeploys.

### 4.4 OTA sourcemaps were not uploaded

Three production OTAs shipped on 2026-08-18 without sourcemaps, so Sentry stack
traces from them are minified. `SENTRY_AUTH_TOKEN` exists in the EAS production
environment but not in the local shell, and `npm run ota:production` chains
`export && sourcemaps && update` with `&&` — so the missing token would have
failed the *upload* and silently skipped the *publish*. Worth decoupling those
steps so a telemetry failure can never block a release.

---

## Already resolved on the day — do not re-investigate

| | Resolution |
|---|---|
| Server overload, 502s, 9–17s responses | CPU pinned at the Starter cap. Scaled to Pro × 2. 100% success, 0.36s avg. |
| Upload rate-limit lockout | `TRUSTED_PROXY_HOPS` 1 → 2. Buckets were keyed to a Cloudflare edge IP, so everyone shared one. Verified: real client IPs now in logs, zero CF IPs. |
| Task titles truncated in mobile | `numberOfLines` clamped to 1 even when expanded; iCreate titles run to 158 chars. Now unclamped when open. |
| "Complete task" silently doing nothing | The 400 explaining that evidence is required was swallowed by a bare `catch {}`. Now stated before the tap and surfaced after. |
| Completed tasks frozen | Evidence is now addable and removable after completion; re-saves post `completed`, not `draft`. |
| No class schedule or room numbers | Added to the school page for guardians and students. Rooms fall back to the class `location` — meetings almost never carry one. |
| School page a wall of text | All sections collapsed by default via the shared `SchoolSection`. |
| Training progress totals too low | Sentry OPTIO-BACKEND-5T — unpaged read truncating at 1000 of 2398 rows. All reads paged. |
| Coordinator blocked from enrolling her children | Sentry OPTIO-BACKEND-6P — role check read one column. |
| Org parents blocked from observer management | Same bug, 7 copies across `observer/family.py` and `parent_management.py`. |
| Observer→parent promotion broken for org families | 3 failures including a write of `role='parent'` onto an org member, which the DB accepts and which corrupts the row quietly. |
| 152 families on a stale task list | Resynced in place. Completions 126 → 133, evidence 164 → 169, zero orphans — families were submitting throughout and nothing was lost. |
| Duplicate Sarie Larson account | Deleted; never signed in, never confirmed, no records. |
