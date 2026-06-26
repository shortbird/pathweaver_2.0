# iCreate SIS — Implementation Plan

**Branch:** `claude/optio-sis-implementation-u314sk`
**Companion:** [`SIS_ARCHITECTURE_DISCOVERY.md`](SIS_ARCHITECTURE_DISCOVERY.md) (audit + locked decisions + naming map)
**Goal:** build the full SIS for beta, additive-only, gated by `organizations.feature_flags.sis_enabled`.

This is the build blueprint: the data model for every module, the API surface, the
frontend surfaces, and the order of work. All new tables are org-scoped, RLS-enabled
with no public policies (backend `service_role` only — matches the existing MVP).

> **Beta decisions (locked 2026-06-26):** eligibility = **soft warn + admin
> override** (never hard-block); discounts = **sibling + multi-class + manual/credit
> + promo**; payment plans = **monthly + semester + full**; QuickBooks = **structure
> `quickbooks_id` + `sis_quickbooks_sync_log` now, no live API yet**; parent billing
> = **view invoices/balances/history + a "pay" link out to Simple Biz Suite** (SBS
> URL is a per-org setting in `feature_flags`/org config, hidden until set; Optio
> never processes card data).
>
> **Naming reminder (from §1.5 of the discovery doc):** backend names are
> disambiguated; frontend keeps today's language. "Class" in the backend =
> `org_classes` (the registration/teaching unit). The transcript-credit feature is
> "credit" in the backend (`quest_type='class'` enum retained) and stays "Class" in
> the student UI. New SIS table prefix: `sis_` for net-new concepts; we extend
> `org_classes`/`class_*` in place for the unified Class.

---

## Module → schema map

### M1. Programs & Classes (extend the unified Class)

**New `programs`** — container that groups Classes (spec §3 enrollment options).
```
id, organization_id, name, slug, description,
program_type  (full_day | half_day | individual_class | workshop | camp | event | online),
status        (draft | published | archived),
enrollment_opens_at, enrollment_closes_at,
created_by, created_at, updated_at
```

**Extend `org_classes`** (the canonical Class) — all columns nullable/defaulted so
existing 14 cohorts are unaffected:
```
program_id           uuid null  -> programs(id)
capacity             integer null            -- null = unlimited
primary_instructor_id uuid null -> users(id) -- class_advisors still holds the full set
price_cents          integer null
billing_type         text null  (flat | per_class | recurring)
billing_cadence      text null  (monthly | semester | full)   -- when recurring
min_age, max_age     integer null            -- eligibility band
location             text null
waitlist_enabled     boolean default true
registration_status  text default 'closed' (open | closed)    -- or inherit program window
```

**New `class_meetings`** — schedule + conflict detection (spec §4.4).
```
id, class_id -> org_classes(id), organization_id,
day_of_week  integer null (0-6),   specific_date date null,   -- recurring OR one-off
start_time time, end_time time, location text,
created_at, updated_at
```

**New `class_prerequisites`** (optional, eligibility §4.3) — keep simple for beta:
```
id, class_id -> org_classes(id), prerequisite_class_id -> org_classes(id) null,
note text   -- free-text prereq when not a class
```

### M2. Registration & Enrollment (multi-step, resumable, per-student §4.2)

**New `sis_registrations`** — one per student per registration session.
```
id, organization_id, household_id null -> households(id),
guardian_user_id -> users(id), student_user_id -> users(id),
status        (draft | in_progress | submitted | completed | cancelled),
current_step  text,                 -- resumable
submitted_at, completed_at, completed_by null -> users(id),  -- admin override (§7.3)
notes, created_at, updated_at
```

**New `sis_registration_items`** — each Class selected in a registration.
```
id, registration_id -> sis_registrations(id), class_id -> org_classes(id),
program_id null -> programs(id),
status        (selected | enrolled | waitlisted | dropped),
price_snapshot_cents, discount_snapshot_cents,
created_at, updated_at
```

On **complete**: each item →
- `class_enrollments` row (existing table — LMS delivery kicks in automatically),
- or `sis_waitlist_entries` if at capacity,
- `school_enrollments` upserted to `enrolled` (existing MVP table),
- an `sis_invoices` draft built from item price snapshots.

### M3. Scheduling conflicts & Waitlists (§4.4, §4.7)

**New `sis_waitlist_entries`** — ordered, auto-offer.
```
id, organization_id, class_id -> org_classes(id), student_user_id -> users(id),
position integer, status (waiting | offered | accepted | expired | declined | promoted),
offered_at, offer_expires_at, created_at, updated_at,
unique (class_id, student_user_id)
```
- Conflict detection = query `class_meetings` for the student's enrolled classes vs.
  the prospective class; block (or warn + admin override per open Q4).
- Capacity = `count(class_enrollments where status='active')` vs `org_classes.capacity`.
- Auto-offer = on a drop, promote position 1 → `offered`, notify, expire after N hours.

### M4. Pricing & Billing — calculate + record only (§4.5/4.6; locked: no processor)

**New `sis_discount_rules`**
```
id, organization_id, name, rule_type (sibling | multi_class | promo | manual),
criteria jsonb, amount_cents null, percent null, active boolean, created_at
```

**New `sis_invoices`**
```
id, organization_id, household_id -> households(id), student_user_id null,
registration_id null -> sis_registrations(id),
status (draft | sent | partial | paid | overdue | void),
subtotal_cents, discount_cents, total_cents, amount_paid_cents,
issued_at, due_date, quickbooks_id null, created_at, updated_at
```

**New `sis_invoice_line_items`**
```
id, invoice_id -> sis_invoices(id), description, class_id null -> org_classes(id),
amount_cents, quantity integer default 1
```

**New `sis_payment_plans`**
```
id, invoice_id -> sis_invoices(id), cadence (monthly | semester | full),
installment_count integer, status (active | completed | cancelled), created_at
```

**New `sis_installments`** — schedule + late fees.
```
id, payment_plan_id -> sis_payment_plans(id), due_date, amount_cents,
status (scheduled | due | paid | late | waived), paid_at null,
late_fee_cents integer default 0, created_at, updated_at
```

**New `sis_payment_records`** — money is collected in SBS; recorded here (manual/import).
```
id, organization_id, invoice_id -> sis_invoices(id), installment_id null,
amount_cents, method text, external_ref text,  -- SBS/QBO reference
recorded_by -> users(id), recorded_at, note
```

**New `sis_quickbooks_sync_log`** — one-way Optio → QBO record sync (beta).
```
id, organization_id, entity_type (invoice | payment | customer), entity_id,
quickbooks_id null, status (pending | synced | error), error text, synced_at, created_at
```
> No card data, no processor. "Payment" rows are *records* of money taken elsewhere.

### M5. Attendance (§4.8)

**New `sis_attendance`**
```
id, organization_id, class_id -> org_classes(id), meeting_id null -> class_meetings(id),
student_user_id -> users(id), date date,
status (present | absent | late | excused), note, recorded_by -> users(id),
created_at, updated_at, unique (class_id, student_user_id, date)
```

### M6. Portals — reuse existing surfaces (discovery §3.3–3.5), add SIS pages

No new tables. Add console pages + parent/teacher views (see frontend section).

### M7. Reporting & Communication (§7.8)

No new tables — aggregation endpoints over M1–M5; reuse notifications/announcements/
email/push for new event types (enrollment confirmed, payment due/late, waitlist offer,
schedule change).

---

## API surface (all under `/api/sis/*`, staff-gated, org-scoped via `resolve_org_id`)

- **Programs/Classes:** `programs` CRUD; extend class endpoints with schedule,
  capacity, price, instructor, meetings (`/sis/classes/:id/meetings`), prerequisites.
- **Registration:** `POST /sis/registrations` (start), `PATCH …/:id` (save step,
  resumable), `POST …/:id/items`, `DELETE …/items/:id`, `POST …/:id/submit`,
  `POST …/:id/complete` (admin override), `GET …/:id` (status + blocking issues).
- **Eligibility/conflicts:** `GET /sis/classes/:id/eligibility?student=…`
  (capacity, age, prereqs, schedule conflicts) for real-time feedback (§5.3).
- **Waitlists:** `GET/POST /sis/classes/:id/waitlist`, `POST …/waitlist/:id/offer|promote`.
- **Pricing/Billing:** `discount_rules` CRUD; `GET /sis/registrations/:id/quote`
  (transparent price breakdown §5.4); `invoices` CRUD; `payment_plans`;
  `payment_records`; `GET /sis/households/:id/billing` (history + upcoming §5.6).
- **Attendance:** `GET/POST /sis/classes/:id/attendance?date=…` (teacher quick entry §6.2).
- **Reports:** `GET /sis/reports/{enrollment,revenue,attendance}` (+ existing roster.csv).

## Frontend surfaces (SIS console + portals; keep "Class" language)

- **Admin console (`SisRoutes`):** Programs & Classes manager (schedule, capacity,
  price, instructor); Registrations queue (in-progress + override/complete §7.3);
  Waitlist manager; Billing (invoices, plans, record payment, discounts); Attendance
  overview; Reports. Extends existing Dashboard/Roster/Households/Messaging.
- **Parent portal:** registration wizard (select classes → real-time eligibility/
  conflict/waitlist feedback → price breakdown → payment plan → confirm §5.3–5.5);
  schedules, billing history/upcoming, attendance — reuse `/parent/*` shell.
- **Teacher portal:** class roster, quick attendance, schedule — reuse `/advisor/*` shell.
- **Student portal:** schedule + class materials — reuse existing dashboard.

---

## Build order (each step: migration → backend → frontend → tests → commit)

1. **Foundation & naming:** `programs` + `org_classes` SIS columns + `class_meetings`;
   backend `credit*` rename pass (UI strings untouched); feature-flag scaffolding.
2. **Programs/Classes management** (admin console).
3. **Registration & enrollment** (wizard + admin override) incl. eligibility/conflict.
4. **Scheduling & waitlists** (meetings, conflict detection, auto-offer).
5. **Pricing & billing** (quote → invoice → plan → record payment → QBO sync log).
6. **Attendance** (+ teacher quick entry).
7. **Portals polish + reporting + notification event types.**

Every step ships behind `sis_enabled` and does not touch the learning app for
non-SIS orgs. Tests accompany each step (v1 vitest + backend). Coverage gate on
`main` still applies; we stay on this branch and on `develop` for dev deploys.
</content>
