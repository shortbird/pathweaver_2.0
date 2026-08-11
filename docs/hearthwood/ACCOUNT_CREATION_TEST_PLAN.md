# Hearthwood Academy — Account Creation Test Plan

**Written:** 2026-08-10, for the enrollment test run the week of 2026-08-10.
**Orgs:** `hearthwood` (`6e8beee3-32d7-4ef4-a718-e709534d866d`, prod) and
`hearthwood-test` (`54f8769b-4f3a-4b46-930e-0d2422d2bff5`, unlimited dry runs).

Hearthwood handles registration and paperwork themselves, so they do **not**
use the family registration funnel (`feature_flags.registration` stays off).
Families create Optio accounts through the org's standing invitation links
(`/invitation/<code>`), and school staff link parents to students afterward.

The fixes referenced below shipped in `ebf680c9` (invite-link sharp edges) and
`290e328c` (household member-order backfill). **They protect the test run only
once deployed to production** — check that `Release (main)` is green for those
commits before running the script against prod.

---

## How the flow works

Two standing links, shared by the school however they like. Each is multi-use
(never consumed) and creates accounts directly inside the org:

```
open /invitation/<code> -> email + name + password -> verification email
  -> click verify, log in -> in the org
```

- **Parent link** → org role `parent`; lands on the Parent Dashboard.
- **Student link** → org role `student`; for 13+ students with their own
  email. Requires a date of birth; under-13s are refused and directed to the
  parent-created path.
- **Under-13 children** don't use a link: the verified parent uses
  "Create Child Profile (Under 13)" on the Parent Dashboard. The dependent
  account inherits the org, needs no email, and is promotable at 13.
- **Existing Optio accounts** (platform, no org) can join via the link with
  their existing password. Accounts belonging to a *different* org are
  refused — deliberate email invitations still move accounts.

Account creation does **not** link parents to students, create households, set
school-enrollment status, or pick an OEA pathway. Those are Parts 3–4.

## Part 1 — Admin: get the links

1. Log in as the Hearthwood org admin on **www.optioeducation.com**; you land
   on `/organization`.
2. Open the **People** tab → "Account Creation Links" card. A **Student** and
   a **Parent** link appear with copy buttons. (Opening the card is what
   creates missing links — they're auto-provisioned server-side.)
3. Copy both. They must point at `www.optioeducation.com/invitation/…`.
4. Open each in a logged-out private window: expect the plain
   "Join Hearthwood Academy" form — *not* the multi-step funnel, no bounce to
   /login.

Note: the SIS console has no link UI for a non-funnel org — its Registration
page says "Family registration is not set up", which is correct. Leave it.

## Part 2 — Family account creation

Use Gmail plus-aliases (`you+hwp1@gmail.com`) so every account has a real
inbox. Fresh private window per run.

- **Run A — new parent:** parent link → new email, name, password. Success
  screen says check your email and offers **Resend verification email**.
  Verify, log in → Parent Dashboard (family empty state). The verification
  email arriving is the single most important check: an unverified login just
  says "Incorrect email or password".
- **Run B — new 13+ student:** student link → own email + DOB. Verify, log
  in → student dashboard.
- **Run C — under-13 child:** as the Run-A parent, "Create Child Profile
  (Under 13)". Child appears immediately, no email involved.
- **Run D — existing account:** parent link with an email that already has an
  Optio account (use a throwaway). Form switches to "Account found — enter
  your password to join". After joining, the account is a Hearthwood parent.
- **Run E — Google:** create an account through the Google button on the
  invite page and confirm the person ends up **inside** Hearthwood, on the
  right dashboard (parent → Parent Dashboard). Only test once the fix commit
  is deployed; before it, the OAuth path dropped the invitation.
- **Negative checks:** student link with no DOB (blocked), with an under-13
  DOB (blocked with parent-path message); wrong password on an existing
  email; a mistyped link code shows "Invalid invitation" (and logs a 404,
  not a 500).

## Part 3 — Admin: link parents to students

Families cannot link themselves (the parent dashboard tells org parents their
school does it). After both accounts exist:

- Web `/organization` → People → **Relationships** → Add Connection: pick the
  parent and student. The connection appears verified; the parent's dashboard
  now shows the student.
- Or SIS → People → **Families**: create a household and add both members —
  member order no longer matters (adding a guardian backfills links to the
  household's existing students).

For a batch of families: the links carry no identity, so nothing records which
student belongs to which parent. Collect a roster (parent email ↔ student
name) and link in one sitting. The account-creation rate limit is 30 per
5 minutes per IP, which covers a sign-up night on shared school wifi.

## Part 4 — Admin: school-side records

1. Set each student's school enrollment to **enrolled** (SIS student record →
   enrollment). Until then, students are invisible to enrollment reports and
   the OEA compliance sweep — account creation never writes
   `school_enrollments`.
2. Have each student pick an OEA pathway (`open_balanced` / `traditional` /
   `college_bound`) and confirm it sticks.

## Part 5 — Database spot-checks (read-only)

```sql
-- The standing links (expect pending student + parent rows, expiry ~2036)
SELECT role, status, expires_at::date
FROM org_invitations
WHERE organization_id = '6e8beee3-32d7-4ef4-a718-e709534d866d'
  AND email LIKE 'link-invite-%';

-- Accounts created (dependents have no email and managed = true)
SELECT email, org_role, org_roles, is_dependent,
       managed_by_parent_id IS NOT NULL AS managed, created_at
FROM users
WHERE organization_id = '6e8beee3-32d7-4ef4-a718-e709534d866d'
ORDER BY created_at DESC;

-- Parent-student links (expect status 'approved' after Part 3)
SELECT p.email AS parent, s.email AS student, l.status, l.admin_verified
FROM parent_student_links l
JOIN users p ON p.id = l.parent_user_id
JOIN users s ON s.id = l.student_user_id
WHERE s.organization_id = '6e8beee3-32d7-4ef4-a718-e709534d866d';

-- Households created by the Relationships/Families steps
SELECT h.name AS household, u.email, hm.relationship, hm.is_primary_guardian
FROM households h
JOIN household_members hm ON hm.household_id = h.id
JOIN users u ON u.id = hm.user_id
WHERE h.organization_id = '6e8beee3-32d7-4ef4-a718-e709534d866d';

-- After Part 4: enrollment status + OEA pathway per student
SELECT u.email, se.status AS school_status, oe.pathway_key, oe.status AS oea_status
FROM users u
LEFT JOIN school_enrollments se ON se.student_user_id = u.id
LEFT JOIN oea_enrollments   oe ON oe.student_id = u.id
WHERE u.organization_id = '6e8beee3-32d7-4ef4-a718-e709534d866d'
  AND u.org_role = 'student';
```

## Known-open items (deferred, not blockers)

- A campus coordinator can't see or manage invitation links (`@require_org_admin`
  endpoints) and can't be invited by link or email
  (`VALID_INVITATION_ROLES`, `backend/routes/admin/user_invitations.py`).
  Hearthwood has no coordinators today.
- The People-tab links card is copy-only — no rotate/revoke button in the UI
  if a link leaks (`DELETE /api/admin/organizations/<id>/invitations/<id>`
  works via API).

## Cleanup after the test

Link-created test accounts are real accounts. On the prod org, remove test
people via the admin People management (person delete withdraws relationships
properly) — don't delete rows by hand, and don't touch the three pre-existing
accounts (the org admin and the two `tannerbowman+…` accounts from June 2026).
`hearthwood-test` can be reset freely; its admin generates its own links the
same way.
