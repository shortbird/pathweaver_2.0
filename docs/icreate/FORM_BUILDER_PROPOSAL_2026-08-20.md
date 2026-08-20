# Custom form builder — scoped proposal

**Date**: 2026-08-20
**Source**: three questions from Molly (iCreate admin) about the SIS task/forms surface.
**Verified against**: `main` as of this date.

## The three questions, answered

| Question | Status |
|---|---|
| "How do we create those forms?" | **Not possible today.** The gap this document scopes. |
| "In preview mode I can't really see what forms are available." | **Bug, fixed 2026-08-20.** Preview wrapped the whole form in `<fieldset disabled>`, which swallowed the type picker; a disabled `<select>` cannot be opened, so all sixteen types collapsed to the first one. The picker now sits outside the fieldset — Submit is still off. |
| "It would be great to assign tasks to teachers, campus coordinators and admins." | **Already ships.** Task Center → *Assign or send* → *New form, request, or task* has an assignee picker, priority and due date. The picker lists all three roles (`sis_service.STAFF_ORG_ROLES`, [sis_service.py:741](../../backend/services/sis_service.py#L741)); the assignee is notified and the item lands in their **My Tasks**. It was invisible because the word "form" appeared nowhere on the admin side — renamed 2026-08-20. |

Only the first is a build. The rest of this document is that build.

## What exists today

`FORM_TYPES` is a hardcoded Python dict of sixteen labels
([sis_forms_service.py:21](../../backend/services/sis_forms_service.py#L21)), plus four
family types in `PARENT_FORM_TYPES`. Every one of the twenty renders the *same three
inputs*: a title, a free-text body ("What happened / what do you need?"), and a location.

So an injury report and a supply request are the same form with a different label on the
dropdown. There is no date-of-injury field, no quantity, no required anything, and no
routing — every submission lands in one queue for a human to read and assign.

The storage is already generic and does not need replacing:
`sis_form_submissions.payload` is `jsonb`, today holding `{body, location, occurred_at}`,
and the row already carries `student_user_id`, `class_id`, `assigned_to`, `priority` and
`due_date`. **The submission table is not the problem. The absence of a template is.**

Note the asymmetry that prompted the question: **checklists have a template editor**
(Task Center → Checklists → the collapsed template manager), backed by
`sis_onboarding_templates`. Forms have no equivalent. Molly went looking for the matching
thing and correctly concluded it wasn't there.

## Proposed shape

Mirror `sis_onboarding_templates` — same authoring pattern, same audience concept, same
delete-guard. Nothing here is novel; it is the checklist template model applied to forms.

### New table: `sis_form_templates`

| Column | Notes |
|---|---|
| `id`, `organization_id`, `created_by`, timestamps | Standard. |
| `key` text | Stable slug written into `sis_form_submissions.form_type`. Immutable after first submission. |
| `name`, `description` text | What the teacher sees in the picker. |
| `audience` text | `staff` \| `family`. Subsumes `PARENT_FORM_TYPES` — same builder serves both. |
| `fields` jsonb | Ordered `[{key, label, type, required, options, help}]`. |
| `default_assignee_id` uuid | The routing ask: maintenance auto-assigns to the coordinator. |
| `default_priority` text | Injury reports open at `high` without anyone remembering to set it. |
| `visible_to_roles` text[] | Same pattern as `org_resources` — substitute notes need only reach substitutes. |
| `is_active` bool, `sort_order` int | Retire a form without destroying its history. |

### Field types for v1

Short text, long text, date, number, single-select, checkbox, **student picker**, **class
picker**, staff picker. The student and class pickers matter disproportionately: they bind
to the `student_user_id` / `class_id` columns that already exist on the submission, which
is what makes a behavior report searchable from the student's record instead of being
prose in a queue.

### Three places that must change with it

1. **Validation** — `submit()` currently checks only that `form_type` is known and `body`
   is non-empty ([sis_forms_service.py:69](../../backend/services/sis_forms_service.py#L69)).
   It must validate required fields, option membership, and reject unknown keys. This is
   the server-side gate; the builder's UI hints are not.
2. **Rendering** — the queue hardcodes `payload.body` and `payload.location`
   ([StaffFormsPage.jsx:332](../../frontend/src/pages/sis/StaffFormsPage.jsx#L332)). It
   needs to walk the template's field list, falling back to body/location for pre-builder rows.
3. **Labels** — `form_type_label` is computed at *read* time from `ALL_FORM_TYPES`
   ([sis_forms_service.py:147](../../backend/services/sis_forms_service.py#L147)). Once
   labels are org-editable, renaming or retiring a template would silently rewrite the
   label on two years of history, and deleting one would render a raw slug.
   **Denormalize `form_type_label` onto the submission at write time.** A submission
   should say what it said the day it was filed.

### Migration

The sixteen built-ins keep working untouched: seed them as system templates per org on
first use, with the current `key` values, so existing `form_type` strings still resolve and
no submission in the table changes meaning. `{body, location, occurred_at}` become three
ordinary field keys, so old submissions render through the new path unchanged. Nothing is
backfilled and nothing is dropped.

### Access

Authoring is `ADMIN_ROLES` — coordinators included. Form templates are operational, not
financial, and the whole point of the coordinator role is the money subtraction only
([sis_roles.py](../../backend/utils/sis_roles.py)). Deleting a template that has
submissions against it must refuse the way `delete_template` does, with the same
force-override.

## Deliberately not in v1

- **Conditional / branching logic.** The demand is one flat form per situation. Branching
  is where form builders go to die.
- **File uploads.** The secure-documents store already exists and is HR-gated; attaching
  files to forms would route confidential documents into a queue that is not. If a form
  needs a document, it needs the signature flow, which already exists.
- **E-signature.** `SendForSignatureModal` already does this. A form that needs a
  signature should send one.
- **Multi-page forms.** No one has asked.

## Effort

Roughly: migration + template CRUD service and routes (small — it is `save_template` with
different columns); a field-builder UI (the largest single piece, comparable to
`TemplateEditor` in [OnboardingPage.jsx:202](../../frontend/src/pages/sis/OnboardingPage.jsx#L202));
a dynamic renderer for submit and for the queue; validation; and the seed migration.

The dependency worth calling out: **the label denormalization should land first and
separately**, as its own small change. It is correct on its own merits, and doing it after
org-editable labels exist means a window where renaming a form quietly rewrites history.

## Open questions for iCreate

1. Which of the sixteen built-ins does iCreate actually use? A form builder that ships
   alongside sixteen unused defaults is a worse picker, not a better one. Retiring the
   dead ones is `is_active` and costs nothing.
2. Is per-form routing (auto-assign maintenance to the coordinator) worth as much as the
   custom fields? It is much cheaper, and could ship first on its own.
3. Do family-facing forms need the builder in the same round, or is staff enough for v1?
