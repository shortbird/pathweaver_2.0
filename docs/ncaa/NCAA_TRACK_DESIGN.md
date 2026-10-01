# NCAA Track: Design

**Status:** Draft for decision, 2026-10-01
**Owner:** Tanner (teacher of record for every course)
**Goal:** get Optio Academy's core courses onto its NCAA Eligibility Center list
of approved courses, so student-athletes can use them toward Division I and II
initial eligibility.

---

## 1. Why a separate track

The NCAA does not approve a learning model. It reviews the **high school
account** (is the school's information trustworthy) and then **each course**
(teacher of record, instructional model, content, rigor). The rules come from
the High School Review Committee Policies and Procedures 2025-26, procedures for
course review on or after Aug. 1, 2024, and Appendix A.

The standard Optio Academy model fails that review on structure, not on quality:

| NCAA requirement | Standard Optio Academy today |
|---|---|
| Course administered consistently for all students, not individualized per student | Students create their own classes; tasks are AI-generated per student |
| Fixed course title, description, unit outline, three major assessments | Credit prints as "Optio Competency-Based" or a comma-joined list of class titles |
| Grading scale, gradebook of dated graded assessments | Every Optio credit is recorded as an A (`utils/transcript_grades.py`) |
| Regular teacher-initiated instructional contact, not as-needed | Required only on Full-Time and the $500 add-on |
| Defined pacing (fastest and slowest path) | 1,000 XP unlocks a half credit with no time floor |
| Student's own work, evaluated by the school | A parent may complete tasks for the student |

The track keeps the Optio way of learning (projects, choice, evidence, XP for
motivation) inside the structure the NCAA reads: fixed courses, a teacher of
record, scheduled feedback, graded assessments, and terms.

The **parent-supported pathway stays as it is**. The NCAA calls that model
homeschooling ("the parent or guardian oversees curriculum, instruction, and
assessment"), and those students go through the NCAA's per-student homeschool
review. Their work must never be presented as track courses.

---

## 2. Shape of the solution

Following [ARCHITECTURE_CORE_AND_PROGRAMS.md](../ARCHITECTURE_CORE_AND_PROGRAMS.md),
core never knows about a program.

- **Core capability `graded_courses`** (new, per-org toggle). Terms, sections
  with a teacher of record, graded assessments with rubrics, a gradebook, letter
  grades per term, an instructional-feedback log, and a grading scale. Nothing
  in it mentions the NCAA, so any school that needs real grades can use it
  later.
- **Program `ncaa_track`** (new program module plus a new org). The org runs the
  NCAA-specific rules on top of the capability: pacing windows, student-only
  submission, the weekly contact rule, integrity checks, and the NCAA export
  packet.

### 2a. The org

- A new organization; its public name is decision D1. Keep "NCAA" out of the
  public school or program name: it is the NCAA's trademark and implies
  endorsement. The slug and code can say `ncaa_track`.
- Transcripts are issued by **Optio Academy**, the WASC-accredited school that
  holds the NCAA high school account. The new org is a program of that school,
  not a second high school. It needs `accreditation_source = 'optio'`.
- Registered in `backend/programs/registry.py` and `web/src/programs/registry.jsx`.
  Settings go in `feature_flags.ncaa_track_settings`.

### 2b. What is reused and what is new

| Need | Reuse | New |
|---|---|---|
| Course content | `courses` → `course_quests` (units) → `curriculum_lessons` → tasks | course fields for transcript title, NCAA subject, level, credits |
| Sections and roster | pattern of `org_classes` + `class_enrollments` | `course_sections` with term and teacher of record (SIS classes have no term or dates) |
| Terms | shape of the OEA `terms` JSON (`utils/oea_rules.py`) | `academic_terms` table (no term table exists today) |
| Graded assessments | none (the SIS gradebook tables have 0 rows and no rubrics) | `course_assessments`, `assessment_submissions`, `assessment_grades` |
| Term letter grades and GPA | `compute_gpa` pattern in `utils/oea_grades.py` | `course_term_grades`, `grading_scales`, `grade_changes` |
| Teacher feedback | `credit_review_messages` covers replies only | `instructional_feedback` (teacher-initiated, timestamped, typed) |
| AI review | `services/credit_ai_review` (proposes, never decides) | a rubric-scoring prompt variant |
| Transcript | `transcript_generator.py`, `PrintableTranscript.jsx` | term column, row type for graded courses, printed grading scale |

Hearthwood/OEA is being retired, so the `oea_*` tables are copied as a
pattern, not depended on.

---

## 3. Data model (core capability)

All tables carry `organization_id` and use RLS. Grades and feedback are
append-only: changes go through `grade_changes`, never in-place updates.

**`academic_terms`**: `id, organization_id, school_year ('2026-27'), term_type
(semester|quarter|annual), term_index, starts_on, ends_on, grades_due_on`.

**Course fields** (columns on `courses`, or a 1:1 `course_academic_profile`
table so core `courses` stays untouched; decide at build time):
`transcript_title` (exactly as printed), `subject_area` (english | math |
natural_physical_science | social_science | world_language |
philosophy_religion | non_core), `level` (regular | honors), `credits` (0.5 or
1.0), `description`, `standards jsonb` (Utah Core ids), `prerequisite_course_ids`,
`min_days`, `max_days` (pacing window), `version`, `ncaa_status` (not_submitted
| submitted | approved | additional_info | approved_pending_individual |
not_approved).

**`course_units`**: the units of a course, mapped to its projects. Fields:
`course_id, course_quest_id, sequence, title, objectives jsonb, standards jsonb`.

**`course_assessments`**: `course_id, unit_id, kind (formative|summative),
title, prompt, rubric jsonb (criteria × levels × points), max_points, weight,
thinking_level (application|strategic|extended), required, version`.
Every student gets the same summatives and rubrics. Students choose the
**context** of a project (their topic, their sport, their book), not its
requirements. That is what makes the course "administered consistently."

**`course_sections`**: `course_id, term_id, teacher_of_record_id,
contact_cadence_days (default 7), status`.

**`section_enrollments`**: `section_id, student_id, status (active | completed |
withdrawn | incomplete), first_activity_at, final_assessment_at, window_ends_at`.
These follow the NCAA's definitions: a course starts at the student's first
activity and ends at the final graded assessment.

**`assessment_submissions`**: `assessment_id, enrollment_id, attempt,
evidence_snapshot jsonb, submitted_by, submitted_at`. A database check enforces
`submitted_by = student_id`.

**`assessment_grades`**: `submission_id, rubric_scores jsonb, points,
graded_by (teacher), graded_at, ai_draft jsonb, ai_draft_accepted_unedited bool,
feedback`. Kept separately from the AI draft so the record shows that the
teacher decided.

**`grading_scales`**: `organization_id, version, effective_from, bands jsonb`
(for example 90 = A, 80 = B, 70 = C, 60 = D), `pass_fail_maps_to ('D')`,
`honors_bonus (≤ 1.0)`. The bands are printed on the transcript and published in
the handbook.

**`course_term_grades`**: `enrollment_id, term_id, percent, letter,
scale_version, posted_by, posted_at, locked`. This is the transcript source.

**`grade_changes`**: `term_grade_id, old, new, reason, changed_by, changed_at`.
This is the transcript-revision policy, enforced in data.

**`instructional_feedback`**: `enrollment_id, teacher_id, kind (instruction |
assessment_feedback | intervention | encouragement | management),
related_submission_id, body, initiated_by (teacher|student), created_at`. Only
`instruction`, `assessment_feedback` and `intervention` started by the teacher
count toward the contact rule. The NCAA excludes "Great job!" and course
management.

---

## 4. Rules the program enforces

1. **Teacher of record on every section.** A section cannot open without one.
   The default is Tanner. The field is per section, so more teachers can be
   added later without changing the model.
2. **Weekly teacher-initiated contact.** Each active enrollment needs at least
   one counting feedback entry every `contact_cadence_days`. The teacher
   dashboard lists overdue enrollments first, and a daily job flags them. AI
   may draft the feedback (from recent submissions and progress), but the
   teacher reads, edits and sends it.
3. **Student-only submission.** Parents can view but cannot submit or complete
   track work. Submissions made while masquerading are refused.
4. **Pacing.** The final summative unlocks only after `min_days` from
   `first_activity_at`. Past `max_days` the enrollment becomes `incomplete`
   until the teacher extends it, with a logged reason.
5. **Teacher-decided grades.** AI can propose rubric scores and feedback. Only
   the teacher of record can post an `assessment_grade`, and the record shows
   whether the AI draft was changed.
6. **Term grade.** A term grade is the weighted percent of graded assessments
   mapped through the active scale. It can be posted only when every required
   summative for the term is graded. After posting it is locked, and any
   change needs a `grade_changes` row with a reason.
7. **No double credit.** Tasks inside track courses still earn XP and show in
   the portfolio, but they never feed `user_subject_xp`. Credit for track
   courses comes only from `course_term_grades`. The diploma credit-request
   flow is off for this org.
8. **Integrity.** Each summative includes a short student explanation of their
   work: a recorded video, or a live check-in the teacher logs. AI-writing and
   similarity signals are shown to the teacher **as signals only**: they are
   unreliable and must never decide a grade on their own. The academic
   integrity policy is published in the handbook.

---

## 5. Teacher workload

One teacher of record for every course is allowed. The account review will ask
for "administrator and teacher information," so prepare a qualifications record
for each subject you teach (D4).

The contact rule scales with enrollments: 20 students taking 4 core courses
each is 80 counting feedback entries a week, plus grading summatives. The
design depends on three supports:

- AI-drafted weekly feedback to edit and send.
- AI-proposed rubric scores.
- One queue ordered by what is overdue.

The track should also be priced like the $500 teacher tier (D5).

---

## 6. Transcript

For a track student, the transcript gains:

- a **term** column (school year plus semester);
- one row per course per term, with the exact `transcript_title`, subject area,
  credits and letter grade;
- an `(H)` marker only on courses whose title says honors;
- the grading scale and a weighting note printed in the footer;
- a graduation date and diploma, which is proof of graduation for the NCAA.

The NCAA calculates its own GPA from approved core courses only. It still
reads the whole transcript when judging whether a school's records are
reliable, so mixing all-A competency credit with graded courses on one
transcript is a risk (D3).

---

## 7. NCAA export packet (program module)

These are the documents the Eligibility Center asks for, generated from the
data:

- **Per course** (for core-course review): description, unit outline with
  standards, a chart of where the course sits in the course sequence, and the
  three major assessments with rubrics.
- **Per student**, for "Approved Pending Individual Review", which a new school
  should expect for up to two years: the teacher's gradebook (every graded
  assessment, its date and score) and a complete copy of all graded work with
  the student's name and date on each.
- **School level**: course catalog, grading-scale policy, academic calendar,
  teacher roster with qualifications, and policies on integrity, repeated
  courses, transcript revisions and attendance.

---

## 8. Phases

| Phase | Work |
|---|---|
| **0. Decisions** | D1–D7 below. Check that Optio Academy has a CEEB/high school code. |
| **1. Core capability** | Migrations for section 3. Teacher gradebook and feedback queue. Student course view with assessments and submissions. |
| **2. Program** | Create the org. Pacing, student-only submission, contact-rule job, integrity check. Credit-request off for the org. |
| **3. First courses** | Author two pilot courses end to end (suggest English 9 and Algebra 1), then the rest of the catalog. |
| **4. Transcript + packet** | Term rows, grading scale, diploma, NCAA export packet. |
| **5. Pilot semester** | Run real students through one full term, so gradebooks and graded work exist to submit. |
| **6. Apply** | Call the Eligibility Center (877-622-2321) to open the account review, then submit courses through the High School Portal. |

---

## 9. Decisions for Tanner

- **D1. Public name** of the track and org (not containing "NCAA").
- **D2. Who enrolls.** Track only, or track core courses alongside standard
  Optio credit for electives, PE and the like?
- **D3. Transcript mixing.** If D2 allows both, do standard-credit rows on a
  track student's transcript keep printing as A? Keeping one graded standard
  for the whole transcript is the safer choice.
- **D4. Teacher qualifications.** What credential or subject background goes on
  record for each subject, and is it acceptable to WASC?
- **D5. Price** of the track.
- **D6. Catalog** for year one: which of the 16 Division I core courses to offer
  first.
- **D7. Pacing windows.** Proposed: a semester course runs no faster than
  9 weeks and no slower than 12 months from first activity.
