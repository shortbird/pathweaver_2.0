# Optio × OpenEd Academy: Implementation Plan for Approval

**Prepared for:** OpenEd Academy (OEA) and OpenEd Academy High School (OEA HS)
**Prepared by:** Optio
**Version:** 1.0
**Date:** May 1, 2026
**Target launch:** August 1, 2026

---

## 1. Executive summary

Optio will serve as the official Learning Management System for both OEA programs, going live alongside the start of the 2026–27 school year. A single Optio platform supports both programs from one shared codebase, with program-specific behavior layered on top so that each department's families see the experience that fits their program.

- **OEA (K-12)** — approximately **600 students**. Course-based model. Families purchase courses through the OpenEd Marketplace; OEA admin staff CSV-upload provisions all parent and student accounts and enrollments in Optio. Evidence of student learning is recorded against a corresponding Optio quest. Homeroom teachers approve evidence in Optio's Credit Review dashboard for parent-run courses; designated graders enter scores from external online courses. Academic counselors formally award credit on a rolling basis as students complete it. Optio's XP system drives mastery-based completion.
- **OEA High School (Diploma Plan)** — approximately **150 students**. Pathway-based model. Parents create their own Optio accounts via an OEA-branded marketplace tile, select one of three diploma pathways, attest letter grades themselves as the primary educator, and submit weekly learning logs and portfolio evidence.

The two programs share a common platform, account structure, evidence submission workflow, in-platform messaging, oversight dashboard, and transcript output. They differ on enrollment trigger, grading authority, pathway structure, communication contacts, and weekly-progress requirements.

This document is the agreed scope of work for the August 1, 2026 launch.

## 2. Programs at a glance

| | **OEA (K-12)** | **OEA High School** |
|---|---|---|
| Estimated Year-1 enrollment | ~600 students | ~150 students |
| Source PRD | OE Inc. → Academy Proposal v1.0 (Apr 30, 2026) | Optio ⇄ OEA PRD V2 (Mar 11, 2026) |
| Primary educator | Optio homeroom teachers and parents | Parent (as the homeschool educator) |
| Enrollment trigger | OEA staff CSV upload to Optio admin portal | OpenEd Marketplace tile → Optio signup |
| Course categories | Parent-run (artifact upload) + Online external (grader enters scores) | Parent-attested credits across pathway categories |
| Grading authority | Homeroom teacher approves evidence (or "Grow This" return); grader enters external scores; academic counselor awards credit on a rolling basis | Parent self-attests letter grades A–F |
| Diploma framework | Optio's standard credit framework | One of three named pathways selected at signup |
| Communication channel | Parent ↔ assigned homeroom teacher (in-platform DM) | Parent ↔ designated OEA contacts (in-platform DM) |
| Weekly progress requirement | TBD (see Section 10) | Weekly learning log + at least one quarterly summary |
| Transcript branding | OpenEd-issued transcript with OpenEd logo | OpenEd-issued transcript with OpenEd logo |

## 3. What is shared between programs

These capabilities are identical across OEA and OEA HS. Both programs receive them on day one.

- **One Optio organization** for OpenEd Academy. All families and staff sit under a single OEA org with appropriate roles.
- **Single sign-on family experience.** A parent with children in both programs uses one Optio account to manage both.
- **Family dashboard with multi-child view.** A parent sees a single dashboard with each child's program, progress, recent activity, and next-step CTAs.
- **Evidence submission.** Documents (PDF, Word), images, audio, video, links, and text entries are accepted. Per-file limits: **images up to 10 MB, documents up to 25 MB, videos up to 500 MB** (videos use Optio's direct-to-storage signed upload). Each submission is associated with a specific student and credit/course.
- **In-platform direct messaging.** Both programs have access to Optio's messaging UI. The specific contacts a parent or student can reach differ by program — see Section 4.4.
- **OpenEd-issued transcripts.** PDF and HTML transcripts are available for any enrolled student, generated from the Optio data layer. Optio generates the document; the **OpenEd Academy logo appears at the top of every transcript in place of the Optio logo**. Transcripts include classes, credits earned, credits in progress, pathway affiliation (HS) or program affiliation (K-12), and Honors/AP/IB designation. Parents can download their student's transcript at any time.
- **OEA Staff Oversight Dashboard** (read-only). OEA staff see enrollment summaries, pathway distribution, progress overviews, and per-student drill-downs across both programs. They cannot modify student data.
- **Public student portfolio.** Each student gets a portfolio page reflecting evidence submissions, learning logs (HS), and earned credits, with diploma achievement displayed when complete.
- **Acting-as-parent flow.** Parents can act as their child to help with submissions while preserving the audit trail of who actually submitted.
- **Email-based platform support.** All OEA users — parents, students, and staff in both programs — can email **support@optioeducation.com** with technical questions, bug reports, account-access issues, or navigation help. Curriculum / program / billing questions are handled by OEA directly.

## 4. What is different between programs

### 4.1 Enrollment

**OEA (K-12).** OEA admin staff upload a single CSV to the Optio admin portal that **creates all parent and student accounts AND enrolls students in their purchased Optio quests in one action.** Parent data is included in the same CSV row as the student so both accounts are provisioned and linked together automatically. There is no separate signup or account-creation step for K-12 families. The CSV is generated by OEA from OpenEd Marketplace purchase records on a regular cadence (recommended: daily during the enrollment surge, weekly steady-state). Existing accounts are matched by email + name + DOB; new accounts are provisioned automatically; new course purchases are enrolled in the corresponding Optio quest. Families receive in-platform welcome and confirmation. This pattern matches the "library resource" model OEA prefers — minimal parent action between marketplace purchase and Optio access.

**OEA High School.** A parent clicks the Optio tile on the OpenEd Marketplace and lands on an OEA-branded Optio signup page (`/signup?partner=opened-academy&program=oea_high_school`). After creating their account, the parent is guided into pathway selection (Section 4.3) and immediately begins the diploma-tracking experience. There is no per-course purchase model on the HS side — the program is one bundled enrollment.

### 4.2 Course categories and grading

OEA K-12 has two course categories with different grading flows. OEA HS has a single flow (parent self-attestation).

#### OEA (K-12) — two course categories

**(a) Parent-run courses** (paper-and-pencil, experiences, hands-on curriculum). The parent uploads artifacts as evidence. Homeroom teachers review submissions in Optio's existing **Credit Review dashboard** and either:

- **Approve** the evidence — the task is marked complete and XP accrues toward course completion, **or**
- Use **"Grow This"** — the submission is returned to the student with feedback; the student revises and resubmits.

Teachers do not assign letter grades for parent-run work. Mastery in Optio is XP-based (Section 5.2).

**(b) Online courses with external grades** (e.g., Adventum and similar marketplace partners that issue their own grades). For these, designated **graders** — non-family OEA staff — transfer the externally-issued score into Optio for the corresponding credit. Graders are distinct from homeroom teachers; their job is data transfer, not artifact review. This avoids parents having to enter the same data into two systems.

#### Rolling credit award (K-12)

The two-step credit workflow (homeroom teacher / grader → counselor) runs **continuously throughout the year**, not as a year-end batch. As the homeroom teacher approves tasks (or the grader enters scores), the underlying XP accrues toward the credit. Once a credit's XP threshold is met, that credit appears in the academic counselor's award queue. Counselors review and award credits on a rolling cadence — a regular weekly or biweekly review session, whatever rhythm OEA prefers. This keeps end-of-semester and end-of-year workload manageable rather than concentrating all credit decisions into a final crunch.

#### OEA High School — parent self-attestation

Parents are the primary educators and self-attest grades. When a parent marks a credit complete, they enter the letter grade A–F that was earned (either grade given by the parent for home-taught work or grade reported by the external curriculum provider). Parents may flag a course as Honors / AP / IB to apply weighted GPA. No teacher or counselor approval is required. OEA staff have read-only oversight visibility but do not approve individual credits.

### 4.3 Diploma framework

**OEA (K-12).** Uses Optio's existing fixed credit framework. Course-by-course progression. Whether the K-12 program issues a separate diploma — and on what completion criteria — is **TBD** (see Section 10).

**OEA High School.** Selects from three named pathways at signup. The chosen pathway defines the credit grid the student works toward.

| Pathway | Total credits | Foundation | Elective | Character |
|---|---|---|---|---|
| Open & Balanced | 24 | 12 (Math 3, LA 3, Sci 3, SS 3) | 12 (student choice) | Maximum flexibility |
| Traditionally Aligned | 24 | 13 (LA 4, Math 3, Sci 3, SS 3) | 11 (Arts 2, Health/PE 2, CTE 1, Fin Lit 1, Choice 5) | Conventional high-school structure |
| College Bound | 24 | 19 (LA 4, Math 4, Sci 3, SS 3, World Lang 2, Foundation Choice 3) | 5 (student choice) | Heaviest foundation, college-aligned |

A parent may change their student's pathway at any time without OEA approval. The parent is responsible for ensuring the student meets the requirements of the selected pathway. Siblings within a family may choose different pathways. Existing earned credits carry over when a pathway changes; required-but-missing categories update to reflect the new pathway.

### 4.4 Communication

Both programs use Optio's in-platform direct messaging. Routing — i.e. which contacts a parent can reach — differs.

**OEA (K-12).** Parents communicate with their student's assigned homeroom teacher. Communication history is logged and accessible to both parties. Parents do **not** message graders or counselors directly through the messaging system; counselor questions go through OEA admin staff or email.

**OEA High School.** HS families have access to in-platform messaging. The specific OEA contacts available to HS families (for example: an OEA HS administrator, an enrolled-family liaison, or an academic counselor) is **TBD** with OEA HS — see Section 10.

In addition to in-platform messaging, all OEA users in both programs can email Optio Support at **support@optioeducation.com** for platform-related technical questions, account-access issues, or bug reports. Bugs and platform issues should be sent to support@optioeducation.com directly rather than through the homeroom-teacher messaging channel.

### 4.5 Weekly learning logs

**OEA High School.** **Required.** Parents submit a learning log each week containing: (1) which diploma subjects were worked on (multi-select from the pathway's subject list) and (2) a 3–5 sentence reflection. The reflection can be submitted as written text, audio recording, video, link, or file upload (within the per-file limits in Section 3). Logs appear chronologically in the student's portfolio and feed into transcript generation. A quarterly summary is required at minimum; weekly logs satisfy the requirement automatically and a quarterly summary can be auto-generated from the prior weeks' logs and edited before submission.

**OEA (K-12).** Whether weekly learning logs are required, optional, or not used for K-12 students is **TBD** with OEA — see Section 10. The same learning-log capability will be made available for K-12 if required.

### 4.6 Roles

| Role | OEA (K-12) | OEA HS |
|---|---|---|
| **Family / Parent** | Submit student work, view feedback, communicate with assigned homeroom teacher in-platform, view transcript and progress for each child | Self-attest credits with letter grades, submit weekly learning logs and evidence, select and change pathway, communicate with designated OEA contacts in-platform, view transcript and progress |
| **Student** | Each student gets their own login at enrollment; completes assigned coursework | Each student gets their own login at enrollment; can view their portfolio and pathway progress |
| **Homeroom Teacher** | Review submissions in the Credit Review dashboard; **approve evidence** or return with **"Grow This"** feedback; communicate with families | Not in scope for HS |
| **Grader** (NEW for OEA) | Non-family OEA staff who transfer scores from external online courses (Adventum etc.) into Optio; do not review artifacts | Not in scope for HS |
| **Academic Counselor** | Review credits flagged as ready by homeroom teachers / graders on a rolling basis; formally award credit; view all evidence, feedback, and progress; download/generate transcripts | Read-only view of student progress; counselor does not approve individual credits in HS |
| **OEA Staff (Oversight)** | Read-only dashboard: enrollment summary, pathway distribution, progress overview, drill into individual student progress | Same |
| **Admin (OEA)** | Upload CSVs to provision accounts and enroll students; manage SKU → Optio quest mappings; manage staff roster | Same admin capabilities apply |
| **Optio Support** | Level-1 platform support for both programs via support@optioeducation.com | Same |

#### Hard constraints (cannot be done by parents)

**OEA (K-12).**
- Parents cannot approve their own student's evidence or grade for academic credit.
- Parents cannot mark a course or quest complete independently.
- Parents cannot award credit (counselor authority).
- Parents cannot modify due dates on coursework.

**OEA HS.** Parents are the primary educators and self-attest credits; the analogous K-12 constraints don't apply.

**Both programs.** Parents are not required to duplicate any action they took in the OpenEd Marketplace.

## 5. Quest design, XP, and grade conversion

### 5.1 Quest template (working hypothesis — to be finalized with OEA)

Optio's working hypothesis is that every Optio quest backing an OEA marketplace course will use the **same generic template** so grading and family expectations stay consistent across all ~50 marketplace offerings (~20 KiwiCo bundles + ~25–30 other curriculum providers). One template shape that came up in the Apr 30 conversation is **4 written artifacts + 1 summative element**, but the **exact template structure is not yet finalized** and will be worked out collaboratively with OEA during the May–June development phase.

Once the template is agreed, Optio engineering will use the AI task generator to draft tasks per template from each marketplace course's description, so OEA does not need to hand-author ~50 individual quest templates from scratch.

### 5.2 XP-to-credit conversion

Optio's K-12 model is mastery-based and uses **Experience Points (XP)** as the unit of progress. The conversion that matters for OEA:

- **1,000 XP = one one-semester high school class = 0.5 credits**
- **2,000 XP = one full-year course = 1.0 credit** (the unit OpenEd Marketplace credits map to)

Because the OpenEd Marketplace credit unit is full-year (1 credit) and the Optio internal unit is semester (0.5 credit / 1,000 XP), the conversion will be **clearly displayed in-platform** so families understand "I bought 1 credit on the marketplace; my child needs 2,000 XP in Optio to complete it." The marketplace tile copy itself is hard to update, so the messaging happens on the Optio side (welcome screen, course page, parent dashboard).

### 5.3 K-12 transcripts: XP by default, optional "traditional" all-A transcript

For OEA K-12 students, the **default transcript format is XP-based**: it lists every class, credits earned, and XP totals. No letter grades, no GPA. This matches Optio's mastery-based model — a student earns the XP when their evidence meets the bar, so there is no concept of partial credit or non-A letter grades.

For situations where a parent needs a **traditional letter-grade transcript** (e.g., college applications, scholarship paperwork, transferring schools), parents can download an optional **"traditional" transcript format** from their dashboard. This format renders every approved credit as **"A"** (the mastery shorthand — the work was approved, therefore it meets the bar) and reports an unweighted GPA of 4.0. Both formats carry the OpenEd Academy logo and reflect the same underlying credit data; only the presentation differs.

For OEA HS, the transcript reflects parent-attested A–F letter grades per credit, with both unweighted (A=4, B=3, C=2, D=1, F=0) and weighted (+1.0 for Honors/AP/IB) GPA on the standard 4.0 scale.

## 6. Diploma completion

**OEA (K-12).** Whether the K-12 program issues a diploma — and on what completion criteria — is **TBD** with OEA (see Section 10). For v1 planning, K-12 students accumulate credits visible on their transcript without a separate diploma-issuance milestone. If OEA confirms a K-12 diploma is required, Optio will add a counselor-reviewed completion flow analogous to the HS model.

**OEA High School.** When the system detects that all credit requirements for the chosen pathway are met (foundation by category, electives by total), the student's status changes to "Diploma Requirements Met" and OEA staff are notified via the oversight dashboard. OEA performs final review and verification, awards the diploma through OEA's existing process (outside Optio), and Optio records the diploma issuance and updates the student portfolio.

**Important:** The diploma itself is awarded by OpenEd Academy, not Optio. Optio's role is tracking progress toward completion, generating OpenEd-branded transcripts, and recording diploma issuance once OEA confirms.

## 7. Timeline

| Date | Milestone | OEA action required |
|---|---|---|
| **May 1 – June 1, 2026** | Optio builds the integration | Provide marketplace CSV format sample; provide a copy of the academy marketplace or list of relevant courses; deliver OpenEd Academy logo + brand assets for transcripts and HS signup; provide initial staff roster (homeroom teachers, graders, counselors); resolve the open items in Section 10; finalize the standard quest template structure with Optio |
| **June 1, 2026** | Beta opens on Optio's dev environment | OEA staff log in, walk through end-to-end flows for both programs, file feedback. Curriculum team begins generating and reviewing the ~50 quest templates over the summer with Optio's AI task generator. |
| **Mid–late June 2026** | OEA-branded marketplace signup link goes live (HS) | Parents can begin creating Optio HS accounts (enrollment will hold pending Aug 1 launch if needed) |
| **July 2026** | UAT and test imports | OEA admin runs at least one full K-12 CSV import as a dry-run; OEA HS staff complete end-to-end pathway flow for one test family; teacher training begins (Section 8) |
| **August 1, 2026** | Public launch — first day of school | OEA families fully active on the platform; daily K-12 CSV imports begin |

The HS marketplace signup link must be live before OEA opens the marketplace for purchases. We expect this to be no later than mid-July, but the actual date is yours to set.

## 8. Optio's commitments

- Build, host, secure, and maintain the platform on Render.
- Maintain ≥95% test pass rate and ratcheting code coverage on every release.
- Provide Level-1 tech support for OEA families: account access, platform errors, navigation help, and bug reports via support@optioeducation.com.
- Maintain the Optio data layer of record for academic progress, credits, XP, and transcripts.
- Generate OpenEd-branded transcripts (PDF + HTML) on demand, in both XP-default and optional "traditional" all-A format for K-12.
- **Teacher training:** deliver live video training sessions for OEA homeroom teachers, graders, and counselors during onboarding, and maintain a searchable in-platform docs system for self-service ongoing reference. The OEA curriculum team is welcome to attend the live training.
- Use Optio's AI task generator to assist OEA's curriculum team in building quest templates from the ~50 marketplace courses, so OEA does not have to hand-author every template.
- Honor the data privacy and COPPA/FERPA assumptions in both PRDs.
- Coordinate weekly with OEA during beta to triage feedback.

## 9. OEA's commitments

- **Marketplace CSV exports.** OEA delivers a CSV (or SFTP feed) of new course purchases on a regular cadence. The CSV includes parent data alongside student data so both accounts are auto-created in a single import. CSV columns at minimum: `parent_email, parent_first_name, parent_last_name, student_first_name, student_last_name, student_dob, course_sku, purchase_date`. (Action item from Apr 30: Karalee will prepare a single CSV file containing all student and parent data.)
- **Course list / marketplace access.** OEA provides Optio with a copy of the academy marketplace or the list of relevant courses (~20 KiwiCo bundles + ~25–30 other curriculum providers) so that Optio can use the AI task generator to draft quest templates. (Apr 30 action item, Karalee.)
- **SKU → Quest mapping.** OEA maintains the mapping of marketplace SKUs to Optio quest templates / courses via the Optio admin UI we will build. OEA provides the initial mapping list ahead of beta.
- **OpenEd Academy brand assets.** OEA provides the OpenEd Academy logo and any color/typography preferences for the transcript header and the OEA-branded HS signup page.
- **Standard quest template structure.** OEA collaborates with Optio in May to finalize the template structure (Section 5.1). This unblocks the AI-assisted template generation for the ~50 marketplace courses.
- **Curriculum and academic guidance.** OEA staff handle curriculum questions, pathway-selection guidance, and "does this count as credit X?" questions. These are out of Optio's tech-support scope.
- **OpenEd Marketplace billing and enrollment.** OEA owns the marketplace, course sales, and program-level enrollment/billing.
- **Diploma certification.** OEA certifies and issues the actual diploma; Optio tracks progress toward it and records the issuance date.
- **Staff roster.** OEA provides the initial list of homeroom teachers, graders, and academic counselors during May.
- **Test families.** OEA provides at least 2 test families per program for UAT during June–July, with full permission to populate test data.
- **Records-retention policy.** OEA confirms how long student artifacts and transcripts must be retained in Optio (this drives storage cost). See Section 10.

## 10. Open items requiring OEA decision

The following items must be resolved during May or early June so the August 1 launch is not at risk.

| # | Question | Optio's recommended default if not resolved |
|---|---|---|
| 1 | **K-12 grading flow specifics** — is approve/"Grow This" the only grading path for parent-run credits? Are graders the only path for online-course credits? | Default: yes to both, no overlap. |
| 2 | **K-12 counselor authority** — does counselor credit-award remain the authoritative final step for both course categories, on the rolling cadence described in 4.2? | Default: yes (counselor has final sign-off in both cases, on a rolling basis). |
| 3 | **K-12 diplomas** — does the K-12 program issue a diploma in addition to the HS pathway diplomas? If yes, what is the completion criteria? | Default: K-12 transcripts only; no diploma issuance milestone in v1. |
| 4 | **K-12 learning logs** — required, optional, or not used for K-12? | Default: optional; surfaced as a feature parents may use, not a requirement. |
| 5 | **HS messaging routing** — which OEA staff contacts are available to HS families via in-platform DM? | Default: HS families can DM a single "OEA HS Support" contact (a designated OEA staff role); routing widens later. |
| 6 | **Records-retention duration** — how long must student artifacts and transcripts be retained? Affects storage cost and design. | Default: align with OpenEd's existing recordkeeping standard (OEA to confirm the number). |
| 7 | **Staff size** — number of homeroom teachers + graders + counselors at launch? | Default: <20 total → manual provisioning; ≥20 → bulk staff CSV invite tool. |
| 8 | **Teacher↔Family assignment rule** — 1:1, 1:many, or by cohort? | Default: 1:many (one teacher to many families). |
| 9 | **Marketplace CSV format** — exact columns and encoding | Default: the columns listed in Section 9; UTF-8; one row per purchase. We will request a sample file. |
| 10 | **SKU → Quest mapping** — initial list of marketplace courses for fall, with mapping owner | Default: OEA org admins maintain via Optio UI; Optio engineering seeds the initial list using the AI task generator. |
| 11 | **`world_language` subject** — needed for College Bound HS pathway; not in Optio's current subject list | Default: Optio adds `world_language` as a new subject option. |
| 12 | **HS diploma awarding handshake** — does OEA notify Optio when the diploma is issued, or does the counselor flip the status manually in Optio? | Default: counselor flips status manually; one fewer integration to maintain. |
| 13 | **External graded platforms** — full list of platforms that the grader role will pull scores from (Adventum is named; what else?) | Default: Adventum + whatever OEA names; manual entry via grader UI in v1; auto-import scoping for v1.1. |
| 14 | **"Library resource" definition** — Karalee to clarify whether Optio functions as a direct library resource for OEA students (Apr 30 action item). Affects how the marketplace tile presents Optio access. | Default: CSV-import provisioning effectively delivers the "library resource" experience (no parent action between purchase and Optio access). |
| 15 | **KiwiCo bundle structure** — should KiwiCo bundles include extra Optio tasks for higher credit cost (Apr 30 idea)? | Default: standard quest template applies to KiwiCo bundles same as everything else; richer/higher-credit KiwiCo offerings can be defined separately if OEA wants them. |
| 16 | **Standard quest template structure** (Section 5.1) — the 4+1 hypothesis or something else? | Default: finalize collaboratively in May; if no other shape is proposed, fall back to 4 written artifacts + 1 summative as a starting point. |
